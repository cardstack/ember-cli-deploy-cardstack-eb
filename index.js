/* eslint-env node */

let BasePlugin = require('ember-cli-deploy-plugin');

module.exports = {
  name: 'ember-cli-deploy-cardstack-eb',

  createDeployPlugin(options) {
    let DeployPlugin = BasePlugin.extend({
      defaultConfig: {
      }
    });
    return new DeployPlugin(options);
  }
};
