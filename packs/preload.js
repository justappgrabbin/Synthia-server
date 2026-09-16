'use strict';

// Synthia cultivation pack preload.
// Loaded before the Express server so the five manifestation packs become
// callable without rewriting server/lite.js or server/index.js.

const express = require('express');
const { listPacks, getPack, createCultivationSession } = require('./registry');

const installed = new WeakSet();

function installCultivationRoutes(app) {
  if (!app || installed.has(app)) return;
  installed.add(app);

  app.get('/api/cultivation/packs', (_req, res) => {
    res.json({
      ok: true,
      count: 5,
      sharedReality: 'YOU-N-I-VERSE',
      packs: listPacks(),
    });
  });

  app.get('/api/cultivation/packs/:id', (req, res) => {
    try {
      res.json({ ok: true, pack: getPack(req.params.id) });
    } catch (error) {
      res.status(404).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/cultivation/session', (req, res) => {
    try {
      const body = req.body || {};
      if (!body.pack && !body.id && !body.manifestation) {
        return res.status(400).json({
          ok: false,
          error: 'pack_required',
          allowed: listPacks().map((pack) => pack.id),
        });
      }

      const packId = body.pack || body.id || body.manifestation;
      const session = createCultivationSession(packId, {
        userId: body.userId || body.user_id,
        stage: body.stage,
        context: body.context,
      });

      res.json({ ok: true, session });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });
}

const previousListen = express.application.listen;
express.application.listen = function synthiaCultivationListen(...args) {
  installCultivationRoutes(this);
  return previousListen.apply(this, args);
};

module.exports = { installCultivationRoutes };
