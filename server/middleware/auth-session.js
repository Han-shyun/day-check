'use strict';

const { authSessionMiddleware } = require('../server');

function authSession(req, res, next) {
  return authSessionMiddleware(req, res, next);
}

module.exports = {
  authSession,
};
