# ember-cli-deploy-cardstack-eb

This README outlines the details of collaborating on this Ember addon.

## Installation

* `git clone <repository-url>` this repository
* `cd ember-cli-deploy-cardstack-eb`
* `npm install`
* `bower install`

## Running

* `ember serve`
* Visit your app at [http://localhost:4200](http://localhost:4200).

## Running Tests

* `npm test` (Runs `ember try:each` to test your addon against multiple Ember versions)
* `ember test`
* `ember test --server`

### Live AWS Tests

By default the test suite will only run unit tests that don't really talk to AWS. But you can activate optional integration tests that do:

 1. Have AWS credentials in your environment.
 2. Set the environment variable `FULL_AWS_TEST` to an app name of your choice, like `FULL_AWS_TEST=some-app-name-here`. An app with this name must not already exist in AWS. It's considered a test failure if it does.
 3. Set the `AWS_REGION` region environment variable (like `AWS_REGION=us-east-1`).
 4. Run the test suite.
 5. The test suite attempts to clean up after itself, but you may want to verify that nothing remains. TODO: document everything here.

## Building

* `ember build`

For more information on using ember-cli, visit [https://ember-cli.com/](https://ember-cli.com/).
