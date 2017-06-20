/* eslint-env node */

const AWS = require('aws-sdk');
const BasePlugin = require('ember-cli-deploy-plugin');
const path = require('path');
const fs = require('fs-extra');
const archive = require('./archive');
const crypto = require('crypto');
const gitRepoInfo = require('git-repo-info');

module.exports = {
  name: 'ember-cli-deploy-cardstack-eb',

  createDeployPlugin(options) {
    let DeployPlugin = BasePlugin.extend({

      init() {
        this._super.init.apply(this, arguments);
        if (!this.name) {
          throw new Error('Plugin is missing name property');
        }
      },

      defaultConfig: {
        // these are optional, because aws-sdk can find them in
        // multiple other ways. I'm listing them here as a form of
        // documentation.
        accessKeyId: undefined,
        secretAccessKey: undefined,
        region: undefined,

        // you can pass your own instanceof AWS.ElasticBeanstalk as
        // "beanstalkClient" if you need to do something weird.
        beanstalkClient(context, pluginHelper) {
          return new AWS.ElasticBeanstalk({
            apiVersion: '2010-12-01',
            accessKeyId: pluginHelper.readConfig('accessKeyId'),
            secretAccessKey: pluginHelper.readConfig('secretAccessKey'),
            region: pluginHelper.readConfig('region')
          });
        },

        // you can pass your own instanceof AWS.S3 as
        // "s3Client" if you need to do something weird.
        s3Client(context, pluginHelper) {
          return new AWS.S3({
            apiVersion: '2006-03-01',
            accessKeyId: pluginHelper.readConfig('accessKeyId'),
            secretAccessKey: pluginHelper.readConfig('secretAccessKey'),
            region: pluginHelper.readConfig('region')
          });
        },

        // provide an object whose propeties will be available as
        // environment variables in elastic beanstalk.
        environmentVariables() {
          return {};
        },

        // the version of node that will be used on elastic
        // beanstalk. Not every version will work here, you need one
        // that is supported by the most recent Node.js solution
        // stack.
        nodeVersion: "7.6.0",

        instanceType: "t1.micro",

        // the endpoint that elasticbeanstalk will use for health
        // monitoring in order to do rolling deployments and load
        // balancing. The default works fine as long as you aren't
        // mounting the hub under a different prefix.
        healthCheckURL: '/content-types',

        // optional list of { namespace, optionName, value } that will be included in the AWS environment's OptionSettings
        optionSettings() {
          return [];
        },

        bucket(context, pluginHelper) {
          return `${clean(pluginHelper.readConfig('appName'))}-${clean(context.deployTarget)}`;
        },

        environmentName(context, pluginHelper) {
          return `${clean(pluginHelper.readConfig('appName'))}-${clean(context.deployTarget)}`;
        },

        appDescription: 'Cardstack Hub',
        outputPath: path.join('tmp', 'cardstack-dist')
      },

      requiredConfig: [
        'appName',
      ],

      setup() {
        this._eb = this.readConfig('beanstalkClient');
        this._s3 = this.readConfig('s3Client');
      },

      async willDeploy() {
        // Talk to AWS *before* the build step. This lets us fail
        // quickly if there's a problem with auth or connectivity.
        await this._existingApp();
      },

      async build() {
        let outputPath = this.readConfig('outputPath');
        await fs.mkdirs(outputPath);
        let bundlePath = path.join(outputPath, 'app.zip');
        if (!process.env.EMBER_CLI_DEPLOY_REUSE_BUILD || !(await fs.exists(bundlePath))) {
          await archive(fs.createWriteStream(bundlePath), a => {
            a.glob('**', {
              cwd: process.cwd(),
              dot: true,
              ignore: ['tmp/**', 'dist/**', '.git/**', '.vagrant/**']
            });
          });
        }
        return {
          cardstackBundle: bundlePath,
          cardstackVersionLabel: await this._versionLabel(bundlePath)
        };
      },

      async fetchInitialRevisions() {
        return {
          initialRevisions: (await this._existingVersions()).map(r => ({
            revision: r.VersionLabel
          }))
        };
      },

      async upload(context) {
        let app = await this._existingApp();
        if (!app) {
          await this._createApp();
        }
        if (await this._bucketExists()) {
          this.log(`Found bucket ${this.readConfig('bucket')}`, { verbose: true });
        } else {
          this.log(`Need to create bucket ${this.readConfig('bucket')}`);
          await this._createBucket();
        }
        await this._uploadBundle(context);
        await this._createAppVersion(context);
      },

      async activate(context) {
        let solution = (await this._eb.listAvailableSolutionStacks({}).promise()).SolutionStackDetails.map(s => s.SolutionStackName).find(name => /64bit.*Linux.*Node\.js/i.test(name));
        this.log(`Using solution stack ${solution}`, { verbose: true });
        let revision = context.commandOptions.revision || context.cardstackVersionLabel;
        let environmentName = this.readConfig('environmentName');

        let params = {
          ApplicationName: this.readConfig('appName'),
          EnvironmentName: environmentName,
          VersionLabel: revision,
          SolutionStackName: solution,
          OptionSettings: [
            {
              Namespace: "aws:elasticbeanstalk:container:nodejs",
              OptionName: "NodeVersion",
              Value: this.readConfig('nodeVersion')
            },
            {
              Namespace: "aws:elasticbeanstalk:container:nodejs",
              OptionName: "NodeCommand",
              Value: `/opt/elasticbeanstalk/node-install/node-v${this.readConfig('nodeVersion')}-linux-x64/bin/node server.js`
            },
            {
              Namespace: "aws:cloudformation:template:parameter",
              OptionName: "EnvironmentVariables",
              Value: keyValueList(this.readConfig('environmentVariables'))
            },
            {
              "Namespace": "aws:autoscaling:launchconfiguration",
              "OptionName": "InstanceType",
              "Value": this.readConfig('instanceType')
            },
            {
              "Namespace": "aws:elasticbeanstalk:application",
              "OptionName": "Application Healthcheck URL",
              "Value": this.readConfig("healthCheckURL")
            }
          ].concat(this.readConfig('optionSettings').map(o => ({
            Namespace: o.namespace,
            OptionName: o.optionName,
            Value: o.value
          })))
        };

        await this._applicationVersionIsReady(params);

        if (await this._existingEnvironment(environmentName)) {
          this.log(`Found existing environment ${environmentName}`, { verbose: true });
          await this._eb.updateEnvironment(params).promise();
        } else {
          this.log(`Need to create environment ${environmentName}`);
          await this._eb.createEnvironment(params).promise();
        }
      },

      async fetchRevisions() {
        return {
          revisions: await this._existingVersions()
        };
      },

      async displayRevisions(context) {
        for (let { Description, VersionLabel, DateCreated } of context.revisions) {
          this.log(`${VersionLabel} | ${DateCreated} | ${Description}`);
        }
      },

      async _applicationVersionIsReady({ ApplicationName, VersionLabel }) {
        while (true) {
          let response = await this._eb.describeApplicationVersions({ ApplicationName, VersionLabels: [ VersionLabel ] }).promise();
          if (response.ApplicationVersions.length < 1) {
            throw new Error(`Tried to check if ${VersionLabel} is ready but couldn't find it`);
          }
          let status = response.ApplicationVersions[0].Status;
          if (status === 'PROCESSED') {
            return;
          }
          this.log(`Waiting for ApplicationVersion ${VersionLabel} to be processed, currently in state ${status}`, { verbose: true });
          await sleep(10000);
        }
      },

      async _existingApp() {
        if (this._cachedApp) { return this._cachedApp; }
        let appName = this.readConfig('appName');
        this.log('Listing existing applications...', { verbose: true });
        let { Applications } = await this._eb.describeApplications({}).promise();
        let existing = Applications.find(a => a.ApplicationName === appName);
        this.log(`Found ${Applications.length} applications`, { verbose: true });
        if (existing) {
          this.log(`App "${appName}" already exists`, { verbose: true });
        } else {
          this.log(`App "${appName}" needs to be created`);
        }
        return this._cachedApp = existing;
      },

      async _existingEnvironment(name) {
        let results = await this._eb.describeEnvironments({
          EnvironmentNames: [name]
        }).promise();
        return results.Environments[0];
      },

      async _bucketExists() {
        try {
          await this._s3.headBucket({ Bucket: this.readConfig('bucket') }).promise();
          return true;
        } catch(err) {
          // You can get a 403 here too, but only when you don't have
          // permission to know if the bucket exists, which we would
          // treat as an error anyway.
          if (err.statusCode !== 404) {
            throw err;
          }
        }
      },

      async _createApp() {
        await this._eb.createApplication({
          ApplicationName: this.readConfig('appName'),
          Description: this.readConfig('appDescription')
        }).promise();
      },

      async _createBucket() {
        await this._s3.createBucket({
          Bucket: this.readConfig('bucket')
        }).promise();
      },

      async _uploadBundle(context) {
        let params = {
          Bucket: this.readConfig('bucket'),
          Key: `app-${context.cardstackVersionLabel}.zip`,
        };
        try {
          await this._s3.headObject(Object.assign({}, params)).promise();
          this.log(`Already found object ${params.Key}`, { verbose: true });
        } catch(err) {
          if (err.statusCode !== 404) {
            throw err;
          }
          this.log(`Uploading object ${params.Key}`, { verbose: true });
          await this._s3.putObject({
            Bucket: this.readConfig('bucket'),
            Key: `app-${context.cardstackVersionLabel}.zip`,
            Body: fs.createReadStream(context.cardstackBundle)
          }).promise();
        }
      },

      async _existingVersions() {
        if (this._cachedVersions) {
          return this._cachedVersions;
        }
        return this._cachedVersions = (await this._eb.describeApplicationVersions({
          ApplicationName: this.readConfig('appName')
        }).promise()).ApplicationVersions;
      },

      async _createAppVersion(context) {
        let repoInfo = gitRepoInfo();
        let desc;
        if (repoInfo.sha) {
          desc = `Built from commit ${repoInfo.sha}`;
        }

        let existing = (await this._existingVersions()).find(v => v.VersionLabel === context.cardstackVersionLabel);
        if (!existing) {
          await this._eb.createApplicationVersion({
            ApplicationName: this.readConfig('appName'),
            VersionLabel: context.cardstackVersionLabel,
            Process: true,
            Description: desc,
            SourceBundle: {
              S3Bucket: this.readConfig('bucket'),
              S3Key: `app-${context.cardstackVersionLabel}.zip`,
            }
          }).promise();
        } else {
          this.log(`App version ${context.cardstackVersionLabel} already exists`, { verbose: true });
        }
      },

      _versionLabel(bundlePath) {
        return new Promise(resolve => {
          let hash = crypto.createHash('sha1');
          hash.on('readable', () => {
            let data = hash.read();
            if (data) {
              resolve(data.toString('hex'));
            }
          });
          fs.createReadStream(bundlePath).pipe(hash);
        });
      },

    });
    return new DeployPlugin(options);
  }
};

function keyValueList(pojo) {
  return Object.keys(pojo).map(key => `${key}=${pojo[key]}`).join(',');
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function clean(name) {
  return name.replace(/_/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
}
