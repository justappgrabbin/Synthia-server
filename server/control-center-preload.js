// Synthia Control Center Preload
// Additive boot hook for the existing Node server.

const path = require('path');
const express = require('express');

const installed = new WeakSet();
const controlState = {};

function installControlCenter(app) {
  if (!app || installed.has(app)) return;
  installed.add(app);
  try {
    require('./mcp-hub-addon')(app, controlState);
    console.log('✓ Synthia Control Center mounted');
  } catch (err) {
    console.warn('⚠ Synthia Control Center mount failed:', err.message);
  }
}

// Private build mode: root opens the Control Center. Existing /terminal, /mcp, /api remain available.
const originalGet = express.application.get;
express.application.get = function patchedGet(routePath, ...handlers) {
  if (routePath === '/' && handlers.length) {
    return originalGet.call(this, routePath, (_req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'control-center.html'));
    });
  }
  return originalGet.call(this, routePath, ...handlers);
};

const originalUse = express.application.use;
express.application.use = function patchedUse(...args) {
  const last = args[args.length - 1];
  const src = typeof last === 'function' ? String(last) : '';
  if (src.includes('route_not_found_in_synthia_mcp_bus') || src.includes('route_not_found_in_node_lite')) {
    installControlCenter(this);
  }
  return originalUse.apply(this, args);
};

const originalListen = express.application.listen;
express.application.listen = function patchedListen(...args) {
  installControlCenter(this);
  return originalListen.apply(this, args);
};

module.exports = { installControlCenter };
