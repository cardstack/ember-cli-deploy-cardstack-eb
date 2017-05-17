let EBDeploy = require('..');

describe("Integration | Deploy Plugin", function() {

  this.timeout(20000);

  let context;
  let name = 'plugin-under-test';
  let plugin;

  beforeEach(function() {
    context = {
      ui: {
        verbose: true,
        write(message) {
          process.stdout.write(message);
        },
        writeLine(message) {
          process.stdout.write(message + "\n");
        }

      },
      config: {
        [name]: {
          appName: 'Snapchat for Unicellular Organisms'
        }
      }
    };
    plugin = EBDeploy.createDeployPlugin({ name });
  });


  if (!process.env.FULL_AWS_TEST) {
    it.skip("Set FULL_AWS_TEST to run these tests (you will need credentials)");
    return;
  }

  it("Talks to AWS", async function() {
    plugin.beforeHook(context),
    plugin.configure(context);
    plugin.setup(context);
    await plugin.fetchRevisions();
  });

});
