'use strict';

function createAuthRepository(dependencies = {}) {
  const {
    loadUserById,
    upsertUser,
    getSessionRecord,
    saveSessionRecord,
    deleteSessionRecord,
    getOauthState,
    createOauthState,
    deleteOauthState,
  } = dependencies;

  return {
    loadUserById,
    upsertUser,
    getSessionRecord,
    saveSessionRecord,
    deleteSessionRecord,
    getOauthState,
    createOauthState,
    deleteOauthState,
  };
}

module.exports = {
  createAuthRepository,
};
