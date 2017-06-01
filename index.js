/* eslint-env node */

const AWS = require('aws-sdk');
const BasePlugin = require('ember-cli-deploy-plugin');
const { wrap } = require('./wrap');
const path = require('path');
const fs = require('fs-extra');
const archive = require('./archive');
const crypto = require('crypto');

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

        s3Client(context, pluginHelper) {
          return new AWS.S3({
            apiVersion: '2006-03-01',
            accessKeyId: pluginHelper.readConfig('accessKeyId'),
            secretAccessKey: pluginHelper.readConfig('secretAccessKey'),
            region: pluginHelper.readConfig('region')
          });
        },

        bucket(context, pluginHelper) {
          return `${pluginHelper.readConfig('appName').replace(/[^a-zA-Z-]/g, '')}-${context.deployTarget}`;
        },

        appDescription: 'Cardstack Hub',
        outputPath: path.join('tmp', 'cardstack-dist')
      },

      requiredConfig: [
        'appName',
      ],

      setup() {
        this._eb = wrap(this.readConfig('beanstalkClient'));
        this._s3 = wrap(this.readConfig('s3Client'));
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
        if (process.env.EMBER_CLI_REUSE_BUILD && await fs.exists(bundlePath)) {
          return { cardstackBundle: bundlePath };
        }
        await archive(fs.createWriteStream(bundlePath), a => {
          a.glob('**', {
            cwd: process.cwd(),
            ignore: ['tmp/**', 'dist/**']
          });
        });
        return {
          cardstackBundle: bundlePath
        };
      },

      async fetchInitialRevisions() {
        return {
          initialRevisions: this._revisions(await this._existingApp())
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
          this.log(`Need to create bucket ${this.readConfig('bucket')}`, { verbose: true });
        }
        return;
        await this._createAppVersion(context);
      },

      async fetchRevisions() {
        return {
          revisions: this._revisions(await this._existingApp())
        };
      },

      async _existingApp() {
        if (this._cachedApp) { return this._cachedApp; }
        let appName = this.readConfig('appName');
        this.log('Listing existing applications...', { verbose: true });
        let { Applications } = await this._eb.describeApplications({});
        let existing = Applications.find(a => a.ApplicationName === appName);
        this.log(`Found ${Applications.length} applications`, { verbose: true });
        if (existing) {
          this.log(`App "${appName}" already exists`, { verbose: true });
        } else {
          this.log(`App "${appName}" needs to be created`);
        }
        return this._cachedApp = existing;
      },

      async _bucketExists() {
        try {
          await this._s3.headBucket({ Bucket: this.readConfig('bucket') });
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

      _revisions(app) {
        return app ? app.Versions.map(revision => ({
          revision
        })) : [];
      },

      async _createApp() {
        await this._eb.createApplication({
          ApplicationName: this.readConfig('appName'),
          Description: this.readConfig('appDescription')
        });
      },

      async _createAppVersion(context) {

        await this._eb.createApplicationVersion({
          ApplicationName: this.readConfig('appName'),
          VersionLabel: await this._versionLabel(context),
          Process: true,
          SourceBundle: {
            S3Bucket: `TODO`,
            S3Key: `TODO`
          }
        });
      },

      _versionLabel(context) {
        return new Promise(resolve => {
          let hash = crypto.createHash('sha256');
          hash.on('readable', () => {
            let data = hash.read();
            if (data) {
              resolve(data.toString('hex'));
            }
          });
          fs.createReadStream(context.cardstackBundle).pipe(hash);
        });
      },

    });
    return new DeployPlugin(options);
  }
};
