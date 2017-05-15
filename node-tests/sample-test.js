let EBDeploy = require('..');

describe("Deploy Plugin", function() {

  let context;

  beforeEach(function() {
    context = {
      ui: {
        writeLine() {}
      },
      config: {}
    };
  });

  it("instantiates", function() {
    EBDeploy.createDeployPlugin({});
  });

  it("validates config", function() {
    let plugin = EBDeploy.createDeployPlugin({});
    plugin.beforeHook(context),
    plugin.configure(context);
  });

});
