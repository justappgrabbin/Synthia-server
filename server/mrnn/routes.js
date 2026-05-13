'use strict';

const crypto = require('crypto');

let MRNNSpeechEngine;
let MRNNNeuralEngine;
try { MRNNSpeechEngine = require('../engine/mrnnSpeech'); } catch (_error) { MRNNSpeechEngine = null; }
try { ({ MRNNNeuralEngine } = require('./MRNN_Neural_Engine')); } catch (_error) { MRNNNeuralEngine = null; }

function hashContent(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex').slice(0, 16);
}

function inferAst(content = '') {
  const raw = String(content || '');
  return {
    functions: (raw.match(/function\s+\w+|=>/g) || []).length,
    imports: (raw.match(/require\(|import\s+/g) || []).length,
    classes: (raw.match(/class\s+\w+/g) || []).length,
    exports: (raw.match(/module\.exports|export\s+/g) || []).length,
    total_lines: raw.split('\n').length,
    bytes: Buffer.byteLength(raw),
  };
}

function createMRNNService({ tridentBridge, primarySupabase }) {
  const speech = MRNNSpeechEngine ? new MRNNSpeechEngine() : null;
  const neural = MRNNNeuralEngine ? new MRNNNeuralEngine({ bases: {}, tones: {}, colors: {}, gates: {}, lines: {} }) : null;
  const ingested = new Map();

  async function analyzeDrop({ filename, content, context = {} }) {
    if (!filename || !content) throw new Error('filename and content required');
    const ast = inferAst(content);
    const analysis = tridentBridge && typeof tridentBridge.analyzeCode === 'function'
      ? await tridentBridge.analyzeCode(filename, content, ast)
      : { mode: 'analysis', confidence: 0.5, capabilities: ['general'], address: null };

    const contentHash = crypto.createHash('sha256').update(String(content)).digest('hex');
    const record = {
      id: `mrnn_${hashContent({ filename, contentHash, ts: Date.now() })}`,
      filename,
      content_hash: contentHash,
      language: filename.split('.').pop(),
      ast,
      analysis,
      context,
      ontological_address: analysis.address || null,
      recommended_mode: analysis.mode || 'analysis',
      confidence: analysis.confidence || 0.5,
      status: (analysis.confidence || 0) > 0.7 ? 'integration_queued' : 'analyzed',
      created_at: new Date().toISOString(),
    };

    ingested.set(record.id, record);

    if (primarySupabase) {
      try {
        const { data: drop, error } = await primarySupabase
          .from('code_drops')
          .insert({
            filename,
            content_hash: contentHash,
            language: record.language,
            ast_json: ast,
            gnn_analysis: analysis,
            detected_capabilities: analysis.capabilities || ['general'],
            recommended_mode: record.recommended_mode,
            confidence: record.confidence,
            ontological_address: record.ontological_address,
            status: 'analyzed',
          })
          .select()
          .single();
        if (!error && drop) record.drop_id = drop.id;

        if ((record.confidence || 0) > 0.7 && record.drop_id) {
          await primarySupabase.from('integration_queue').insert({
            code_drop_id: record.drop_id,
            strategy: record.recommended_mode,
            priority: 10,
            status: 'pending',
          });
          record.status = 'integration_queued';
        }
      } catch (error) {
        record.database_warning = error.message;
      }
    }

    return record;
  }

  return {
    speech,
    neural,
    ingested,

    status() {
      return {
        ok: true,
        service: 'mrnn-orchestration',
        speech: speech ? speech.status() : { ok: false, error: 'speech engine unavailable' },
        neural: Boolean(neural),
        ingested_count: ingested.size,
        database: primarySupabase ? 'connected' : 'degraded',
      };
    },

    async ingest(payload = {}) {
      const record = await analyzeDrop(payload);
      return {
        ok: true,
        ...record,
        next: record.status === 'integration_queued'
          ? 'queued for integration/apply worker'
          : 'analyzed; teach or correct placement to improve confidence',
      };
    },

    speak(payload = {}) {
      if (!speech) return { ok: false, error: 'speech engine unavailable' };
      return speech.speak(String(payload.message || payload.content || ''), payload);
    },

    train(payload = {}) {
      if (!speech) return { ok: false, error: 'speech engine unavailable' };
      const examples = Array.isArray(payload.examples) ? payload.examples : [];
      return speech.train(examples, payload);
    },

    feedback(payload = {}) {
      if (!speech) return { ok: false, error: 'speech engine unavailable' };
      return speech.rate(payload);
    },

    query(payload = {}) {
      if (!neural) return { ok: false, error: 'MRNN neural engine unavailable' };
      const address = String(payload.address || '');
      const result = neural.query(address);
      return { ok: Boolean(result), result };
    },

    activate(payload = {}) {
      if (!neural) return { ok: false, error: 'MRNN neural engine unavailable' };
      const state = payload.state || {};
      const result = neural.activateState(state, Number(payload.intensity || 1));
      return { ok: true, result, field: neural.getFieldSnapshot(10) };
    },
  };
}

function attachMRNNRoutes(app, deps = {}) {
  const service = createMRNNService(deps);
  app.locals.mrnn = service;

  app.get('/mrnn/status', (_req, res) => res.json(service.status()));
  app.get('/mrnn/speech/status', (_req, res) => res.json(service.speech ? service.speech.status() : { ok: false, error: 'speech engine unavailable' }));
  app.post('/mrnn/speech/speak', (req, res) => res.json(service.speak(req.body || {})));
  app.post('/mrnn/speech/train', (req, res) => res.json(service.train(req.body || {})));
  app.post('/mrnn/speech/feedback', (req, res) => res.json(service.feedback(req.body || {})));
  app.post('/mrnn/ingest', async (req, res) => {
    try { res.json(await service.ingest(req.body || {})); }
    catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });
  app.post('/mrnn/query', (req, res) => res.json(service.query(req.body || {})));
  app.post('/mrnn/activate', (req, res) => res.json(service.activate(req.body || {})));

  return service;
}

async function handleMRNNSocket(msg, service) {
  if (!service) return { type: 'error', error: 'mrnn service unavailable' };
  if (msg.type === 'mrnn.status') return { type: 'mrnn.status', result: service.status(), timestamp: new Date().toISOString() };
  if (msg.type === 'mrnn.speech') return { type: 'mrnn.speech.result', result: service.speak(msg), timestamp: new Date().toISOString() };
  if (msg.type === 'mrnn.ingest') return { type: 'mrnn.ingest.result', result: await service.ingest(msg), timestamp: new Date().toISOString() };
  if (msg.type === 'mrnn.query') return { type: 'mrnn.query.result', result: service.query(msg), timestamp: new Date().toISOString() };
  if (msg.type === 'mrnn.activate') return { type: 'mrnn.activate.result', result: service.activate(msg), timestamp: new Date().toISOString() };
  return null;
}

module.exports = { attachMRNNRoutes, handleMRNNSocket };
