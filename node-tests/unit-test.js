const EBDeploy = require('..');

describe("Unit | Deploy Plugin", function() {
  let context;
  let plugin;
  let config;
  let appName = 'Instagram But For Squirrels';

  beforeEach(function() {
    let name = 'plugin-under-test';
    context = {
      ui: {
        writeLine() {}
      },
      config: {
        [name]: {
          appName,
          beanstalkClient: new MockClient()
        }
      }
    };
    config = context.config[name];
    plugin = EBDeploy.createDeployPlugin({ name });
  });

  it("rejects missing config", function() {
    delete config.appName;
    plugin.beforeHook(context),
    expect(() => {
      plugin.configure(context);
    }).throws('Missing required config');
  });

  it("accepts complete config", function() {
    plugin.beforeHook(context),
    plugin.configure(context);
  });

  it("fails early when not authorized", async function() {
    config.beanstalkClient.authorized = false;
    plugin.beforeHook(context),
    plugin.configure(context);
    await plugin.setup(context);
    try {
      await plugin.willDeploy(context);
      throw new Error("shouldnt get here");
    } catch(err) {
      expect(err.message).to.equal("Not authorized");
    }
  });

  it("can fetch initial revisions when there's no app", async function() {
    plugin.beforeHook(context),
    plugin.configure(context);
    await plugin.setup(context);
    let { initialRevisions } = await plugin.fetchInitialRevisions(context);
    expect(initialRevisions).length(0);
  });

  it("can fetch initial revisions when there's an app", async function() {
    config.beanstalkClient.apps = [ appName ];
    config.beanstalkClient.versions = ['1'];
    plugin.beforeHook(context),
    plugin.configure(context);
    await plugin.setup(context);
    let { initialRevisions } = await plugin.fetchInitialRevisions(context);
    expect(initialRevisions).to.deep.equal([{ revision: '1' }]);
  });

  it.skip("creates new app", async function() {
    plugin.beforeHook(context),
    plugin.configure(context);
    await plugin.setup(context);
    await plugin.upload(context);
  });

});

class MockClient {
  constructor() {
    this.apps = [];
    this.versions = [];
    this.authorized = true;
  }
  describeApplications() {
    if (!this.authorized) {
      throw new Error("Not authorized");
    }
    return this.response({
      Applications: this.apps.map(ApplicationName => ({ ApplicationName }))
    });
  }
  describeApplicationVersions() {
    return this.response({
      ApplicationVersions: this.versions.map(VersionLabel => ({ VersionLabel }))
    });
  }
  response(value) {
    return {
      async promise() {
        return value;
      }
    };
  }
}
