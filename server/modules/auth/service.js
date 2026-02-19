'use strict';

function createAuthService(dependencies = {}) {
  const {
    parseKakaoProfile,
    generateRandomToken,
    getRedirectUri,
    buildSignedSessionCookie,
    parseSignedSessionCookie,
  } = dependencies;

  return {
    parseKakaoProfile,
    generateRandomToken,
    getRedirectUri,
    buildSignedSessionCookie,
    parseSignedSessionCookie,
  };
}

module.exports = {
  createAuthService,
};
