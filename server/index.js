'use strict';

const { startServer } = require('./app');

startServer().catch((error) => {
  console.error('[modular] failed to start server', error);
  process.exit(1);
});
