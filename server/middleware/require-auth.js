'use strict';

const { requireAuth } = require('../server');

function authRequired(req, res, next) {
  return requireAuth(req, res, next);
}

module.exports = {
  authRequired,
  requireAuth,
};
