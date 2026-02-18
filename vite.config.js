const { defineConfig } = require('vite');

const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://127.0.0.1:4173';

module.exports = defineConfig({
  server: {
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
