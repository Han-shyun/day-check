'use strict';

function createStateService(dependencies = {}) {
  const { normalizeState, payloadHash } = dependencies;

  return {
    normalizeState,
    payloadHash,
  };
}

module.exports = {
  createStateService,
};
