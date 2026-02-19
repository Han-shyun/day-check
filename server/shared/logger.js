'use strict';

function logInfo(...args) {
  console.log(...args);
}

function logError(...args) {
  console.error(...args);
}

module.exports = {
  logInfo,
  logError,
};
