'use strict';

// Placeholder for extracted app factory in later modularization phases.
function createApp() {
  throw new Error('createApp is not extracted yet. Use ../server.js runtime bridge for now.');
}

module.exports = {
  createApp,
};
