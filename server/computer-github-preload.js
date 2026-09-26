const express = require('express');
const { installComputerGitHubRoutes } = require('./computer-github-routes');

const installed = new WeakSet();

function install(app) {
  if (!app || installed.has(app)) return;
  installed.add(app);
  installComputerGitHubRoutes(app);
  console.log('✓ SynthAI Computer GitHub bridge attached');
}

// Before the catch-all 404 is registered, attach the bridge so its routes stay
// reachable. lite.js also calls install() explicitly; the WeakSet makes this
// idempotent. The listen hook remains as a last-resort fallback.
const originalUse = express.application.use;
express.application.use = function patchedComputerGitHubUse(...args) {
  const last = args[args.length - 1];
  const src = typeof last === 'function' ? String(last) : '';
  if (src.includes('route_not_found_in_node_lite') || src.includes('route_not_found_in_synthia_mcp_bus')) install(this);
  return originalUse.apply(this, args);
};

const originalListen = express.application.listen;
express.application.listen = function patchedComputerGitHubListen(...args) {
  install(this);
  return originalListen.apply(this, args);
};

module.exports = { install };
