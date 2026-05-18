require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const PYTHON_BRIDGE_URL = process.env.PYTHON_BRIDGE_URL || process.env.SYNTHIA_PYTHON_URL || '';
const NODE_MODE = process.env.NODE_MODE || 'lite';

app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.RATE_LIMIT_MAX || 300) }));
app.use(express.json({ limit: process.env.JSON_LIMIT || '25mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || '25mb' }));

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function summarizePayload(payload = {}) {
  const raw = JSON.stringify(payload || {});
  return {
    bytes: Buffer.byteLength(raw),
    hash: sha256(raw),
    keys: Object.keys(payload || {}),
    received_at: new Date().toISOString()
  };
}

async function forwardToPython(path, payload, method = 'POST') {
  if (!PYTHON_BRIDGE_URL) {
    return {
      ok: false,
      forwarded: false,
      reason: 'PYTHON_BRIDGE_URL not configured'
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.PYTHON_BRIDGE_TIMEOUT_MS || 8000));

  try {
    const response = await fetch(`${PYTHON_BRIDGE_URL}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(payload || {}),
      signal: controller.signal
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return {
      ok: response.ok,
      forwarded: true,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      forwarded: false,
      error: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function localContract(kind, payload = {}) {
  const summary = summarizePayload(payload);
  const filename = payload.filename || payload.name || payload.fileName || 'unknown';
  const content = payload.content || payload.text || '';

  return {
    id: `${kind}_${summary.hash.slice(0, 12)}`,
    src: filename,
    type: kind,
    mode: NODE_MODE,
    meta: summary,
    structure: {
      language: String(filename).split('.').pop() || 'unknown',
      lines: typeof content === 'string' ? content.split('\n').length : 0,
      functions: typeof content === 'string' ? (content.match(/function\s+\w+|=>/g) || []).length : 0,
      imports: typeof content === 'string' ? (content.match(/require\(|import\s+/g) || []).length : 0,
      classes: typeof content === 'string' ? (content.match(/class\s+\w+/g) || []).length : 0
    },
    capabilities: ['ingest', 'relay', 'degraded-analysis'],
    created_at: new Date().toISOString()
  };
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'synthia-node',
    mode: NODE_MODE,
    python_bridge: PYTHON_BRIDGE_URL ? 'configured' : 'not_configured',
    health: '/health',
    endpoints: ['/ingest', '/morph', '/runtime', '/execute', '/registry', '/api/drop', '/api/intent']
  });
});

app.get('/health', async (_req, res) => {
  const python = await forwardToPython('/health', null, 'GET');
  res.json({
    ok: true,
    status: 'healthy',
    service: 'synthia-node',
    mode: NODE_MODE,
    heavy_engines: 'disabled_in_lite_mode',
    python_bridge: python,
    timestamp: new Date().toISOString()
  });
});

app.post(['/ingest', '/api/drop'], async (req, res) => {
  const contract = localContract('ingest', req.body || {});
  const python = await forwardToPython('/ingest', { ...req.body, node_contract: contract });
  res.json({ ok: true, handled_by: 'node-lite', contract, python });
});

app.post(['/morph', '/api/morph'], async (req, res) => {
  const contract = localContract('morph', req.body || {});
  const mutations = [
    { type: 'register-capsule', confidence: 0.62, reason: 'lite fallback mutation proposal' },
    { type: 'sync-python-bridge', confidence: PYTHON_BRIDGE_URL ? 0.8 : 0.2, reason: 'python bridge availability' }
  ];
  const python = await forwardToPython('/morph', { ...req.body, node_contract: contract, mutations });
  res.json({ ok: true, handled_by: 'node-lite', contract, mutations, python });
});

app.post(['/runtime', '/api/runtime'], async (req, res) => {
  const python = await forwardToPython('/runtime', req.body || {});
  res.json({
    ok: true,
    handled_by: 'node-lite',
    runtime: {
      node: 'online',
      mode: NODE_MODE,
      heavy_engines: 'disabled',
      python_bridge: PYTHON_BRIDGE_URL ? 'configured' : 'not_configured'
    },
    python
  });
});

app.post(['/execute', '/api/execute'], async (req, res) => {
  const python = await forwardToPython('/execute', req.body || {});
  res.json({
    ok: true,
    handled_by: 'node-lite',
    executed: false,
    reason: 'Node lite mode does not execute packages; forwarded to Python if configured.',
    python
  });
});

app.post(['/registry', '/api/registry'], async (req, res) => {
  const entry = localContract('registry', req.body || {});
  const python = await forwardToPython('/registry', { ...req.body, node_registry_entry: entry });
  res.json({ ok: true, handled_by: 'node-lite', entry, python });
});

app.post('/api/intent', async (req, res) => {
  const intent = req.body?.intent || req.body?.text || '';
  const python = await forwardToPython('/intent', req.body || {});
  res.json({
    ok: true,
    handled_by: 'node-lite',
    intent,
    analysis: {
      mode: 'relay',
      confidence: 0.5,
      capabilities: ['python-bridge', 'degraded-intent']
    },
    requires_confirmation: true,
    python
  });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'route_not_found_in_node_lite',
    path: req.path,
    hint: 'Use full server/index.js for heavy engines or configure PYTHON_BRIDGE_URL.'
  });
});

app.listen(PORT, () => {
  console.log(`✓ Synthia Node Lite relay listening on ${PORT}`);
  console.log(`✓ Python bridge: ${PYTHON_BRIDGE_URL || 'not configured'}`);
});
