let EBDeploy = require('..');
let log = require('debug')('tests');

describe("Integration | Deploy Plugin", function() {
  let appName = process.env.FULL_AWS_TEST;
  if (!appName) {
    it.skip("Live AWS tests are disabled, see README.md");
    return;
  }

  this.timeout(20000);

  let context;
  let name = 'plugin-under-test';
  let logBuffer;

  beforeEach(async function() {
    logBuffer = '';
    context = {
      ui: {
        verbose: true,
        write(message) {
          logBuffer += message;
        },
        writeLine(message) {
          logBuffer += message + "\n";
        }

      },
      config: {
        [name]: {
          appName
        }
      }
    };
    await assertCleanEnvironment();
  });


  async function assertCleanEnvironment() {
    let plugin = EBDeploy.createDeployPlugin({ name });
    plugin.beforeHook(context),
    plugin.configure(context);
    plugin.setup(context);

    if (await plugin._existingApp()) {
      throw new Error(`app ${appName} is not supposed to exist`);
    }
  }

  afterEach(async function() {
    log("Logs from above test:");
    log(logBuffer);
    let plugin = EBDeploy.createDeployPlugin({ name });
    plugin.beforeHook(context),
    plugin.configure(context);
    plugin.setup(context);
    await plugin._eb.deleteApplication({ ApplicationName: appName });
  });

  it("lists empty revisions", async function() {
    let plugin = EBDeploy.createDeployPlugin({ name });

    plugin.beforeHook(context),
    plugin.configure(context);
    plugin.setup(context);
    expect(await plugin.fetchRevisions()).to.deep.equal({
      revisions: []
    });
  });

  it("deploys", async function() {
    let plugin = EBDeploy.createDeployPlugin({ name });
    plugin.beforeHook(context),
    plugin.configure(context);
    plugin.setup(context);
    await plugin.upload(context);

  });

});
