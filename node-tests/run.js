// This file is necessary because mocha will not watch file changes
// inside node_modules. We need an entrypoint within our own app to
// make file watching work correctly.
require('@cardstack/test-support')();
