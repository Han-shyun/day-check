'use strict';

function requireAuth(_req, _res, next) {
  next();
}

module.exports = requireAuth;
