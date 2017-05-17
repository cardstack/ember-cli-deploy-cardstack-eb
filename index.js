/* eslint-env node */

const AWS = require('aws-sdk');
const BasePlugin = require('ember-cli-deploy-plugin');
const { wrap } = require('./wrap');

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
        }
      },

      requiredConfig: [
        'appName',
      ],

      setup() {
        this._eb = wrap(this.readConfig('beanstalkClient'));
      },

      async willDeploy() {
        // Talk to AWS *before* the build step. This lets us fail
        // quickly if there's a problem with auth or connectivity.
        await this._existingApp();
      },

      async fetchInitialRevisions() {
        return {
          initialRevisions: this._revisions(await this._existingApp())
        };
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

      _revisions(app) {
        return app ? app.Versions.map(revision => ({
          revision
        })) : [];
      },



    });
    return new DeployPlugin(options);
  }
};
