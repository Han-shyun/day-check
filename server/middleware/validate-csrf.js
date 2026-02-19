'use strict';

const { validateCsrf } = require('../server');

function csrfGuard(req, res, next) {
  return validateCsrf(req, res, next);
}

module.exports = {
  csrfGuard,
  validateCsrf,
};
