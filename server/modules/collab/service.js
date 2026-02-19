'use strict';

const legacyServer = require('../../server');

module.exports = {
  hasNoCollabState: () => Boolean(legacyServer),
};
