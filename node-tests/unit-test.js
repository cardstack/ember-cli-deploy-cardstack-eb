let EBDeploy = require('..');

describe("Unit | Deploy Plugin", function() {

  let context;
  let name = 'plugin-under-test';
  let plugin;

  beforeEach(function() {
    context = {
      ui: {
        writeLine() {}
      },
      config: {
        [name]: {}
      }
    };
    plugin = EBDeploy.createDeployPlugin({ name });
  });

  it("errors on missing config", function() {
    plugin.beforeHook(context),
    expect(() => {
      plugin.configure(context);
    }).throws('Missing required config');
  });

  it("accepts complete config", function() {
    context.config[name].appName = 'Instagram But For Squirrels';
    plugin.beforeHook(context),
    plugin.configure(context);
  });

});
