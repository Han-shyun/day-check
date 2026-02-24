'use strict';

const legacyServer = require('../server');

function createApp() {
  return legacyServer.app;
}

function startServer() {
  return legacyServer.startServer();
}

function createAuthRouter() {
  return legacyServer.createAuthRouter();
}

function createStateRouter() {
  return legacyServer.createStateRouter();
}

function createHolidaysRouter() {
  return legacyServer.createHolidaysRouter();
}

function createCollabRouter() {
  return legacyServer.createCollabRouter();
}

module.exports = {
  createApp,
  startServer,
  createAuthRouter,
  createStateRouter,
  createHolidaysRouter,
  createCollabRouter,
};
