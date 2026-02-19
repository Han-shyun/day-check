'use strict';

function errorHandler(error, _req, res, _next) {
  const message = error && error.message ? error.message : 'internal_error';
  res.status(500).json({ error: message });
}

module.exports = errorHandler;
