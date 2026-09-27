const express = require('express');
const { installComputerGitHubRoutes } = require('./computer-github-routes');

const installed = new WeakSet();

function install(app) {
  if (!app || installed.has(app)) return;
  installed.add(app);
  installComputerGitHubRoutes(app);
  console.log('✓ SynthAI Computer GitHub bridge attached');
}

const originalListen = express.application.listen;
express.application.listen = function patchedComputerGitHubListen(...args) {
  install(this);
  return originalListen.apply(this, args);
};

module.exports = { install };
