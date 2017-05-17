/* eslint-env node */

const AWS = require('aws-sdk');
const BasePlugin = require('ember-cli-deploy-plugin');

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
        // these are optional, and it's generally easiest to leave
        // them off and just provide the standard environment
        // variables that aws-sdk knows to use automatically. But we
        // include them here for the advanced cases where you need
        // to use different keys for different plugins, etc.
        accessKeyId: null,
        secretAccessKey: null
      },

      requiredConfig: [
        'appName',

      ],

      prepare() {
        this.eb = new AWS.ElasticBeanstalk({
          apiVersion: '2010-12-01',
          accessKeyId: this.readConfig('accessKeyId'),
          secretAccessKey: this.readConfig('secretAccessKey')
        });
      }

    });
    return new DeployPlugin(options);
  }
};
