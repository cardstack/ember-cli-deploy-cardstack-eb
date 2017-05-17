const denodeify = require('denodeify');
const wrapped = Symbol();

exports.wrap = function wrap(awsAPI) {
  if (awsAPI[wrapped]) {
    return awsAPI;
  }
  let result = {
    [wrapped]: true
  };
  for (let method in awsAPI) {
    if (typeof awsAPI[method] === 'function') {
      result[method] = function() {
        return denodeify(awsAPI[method]).apply(awsAPI, arguments);
      };
    }
  }
  return result;
};

exports.wrapped = wrapped;
