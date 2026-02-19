'use strict';

function errorHandler(error, req, res, _next) {
  console.error(error);
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    res.status(500).json({ error: 'internal_server_error' });
    return;
  }
  res.status(500).send('internal_server_error');
}

module.exports = {
  errorHandler,
};
