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

const POC = {
  started_at: new Date().toISOString(),
  mcp: { status: 'offline', last_bootstrap: null },
  trident: {
    status: 'unknown',
    last_wake: null,
    url: process.env.HF_TRIDENT_CYNTHIA_URL || process.env.HF_TRIDENT_GENERAL_URL || process.env.TRIDENT_URL || ''
  },
  agents: {
    kimi: { label: 'Kimi', role: 'source/capture interface', status: 'logical' },
    chatgpt: { label: 'ChatGPT', role: 'implementation inbox', status: 'logical' },
    cynthia: { label: 'Cynthia', role: 'root connector/router', status: 'online' }
  },
  inboxes: { kimi: [], chatgpt: [], cynthia: [] },
  captures: [],
  artifacts: [],
  runs: [],
  events: []
};

function now() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function recordEvent(type, source, message, detail = {}) {
  const event = { id: newId('evt'), type, source, message, detail, timestamp: now() };
  POC.events.unshift(event);
  POC.events = POC.events.slice(0, 200);
  return event;
}

function enqueue(agent, item) {
  const key = String(agent || 'chatgpt').toLowerCase();
  if (!POC.inboxes[key]) POC.inboxes[key] = [];
  const message = { id: newId('msg'), ...item, target: key, timestamp: now() };
  POC.inboxes[key].unshift(message);
  POC.inboxes[key] = POC.inboxes[key].slice(0, 100);
  return message;
}

async function wakeTrident(reason = 'mcp_handoff') {
  const url = POC.trident.url;
  POC.trident.last_wake = now();

  if (!url) {
    POC.trident.status = 'not_configured';
    return {
      ok: false,
      status: 'not_configured',
      reason: 'HF_TRIDENT_CYNTHIA_URL / HF_TRIDENT_GENERAL_URL / TRIDENT_URL is not configured',
      api_key_required: false
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.TRIDENT_WAKE_TIMEOUT_MS || 8000));

  try {
    const response = await fetch(url.replace(/\/$/, '') + '/wake', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, source: 'synthia-server', timestamp: now() }),
      signal: controller.signal
    });

    let body;
    const text = await response.text();
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    POC.trident.status = response.ok ? 'awake' : 'wake_failed';
    return { ok: response.ok, status: POC.trident.status, http_status: response.status, response: body, api_key_required: false };
  } catch (error) {
    POC.trident.status = 'wake_failed';
    return { ok: false, status: 'wake_failed', error: error.message, api_key_required: false };
  } finally {
    clearTimeout(timeout);
  }
}

function renderPage(title, body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #0b0f16; color: #e7eefc; margin: 0; padding: 24px; }
    a { color: #8ab4ff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
    .card { border: 1px solid #263244; border-radius: 14px; padding: 16px; background: #111827; }
    button { background:#e7eefc; color:#0b0f16; border:0; border-radius:10px; padding:10px 12px; font-weight:700; cursor:pointer; }
    textarea,input { width:100%; box-sizing:border-box; background:#0b0f16; color:#e7eefc; border:1px solid #263244; border-radius:10px; padding:10px; }
    pre { white-space: pre-wrap; background:#05070b; border:1px solid #263244; padding:12px; border-radius:12px; overflow:auto; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'synthia-node',
    mode: NODE_MODE,
    role: 'root connector/router for MCP handoff POC',
    python_bridge: PYTHON_BRIDGE_URL ? 'configured' : 'not_configured',
    trident: POC.trident.url ? 'configured' : 'not_configured',
    no_hidden_llm_api_keys: true,
    health: '/health',
    interface: ['/admin', '/client'],
    poc_endpoints: ['/mcp/status', '/mcp/bootstrap', '/mcp/capture', '/mcp/artifact', '/mcp/inbox/chatgpt', '/substrate/inquire', '/trident/wake'],
    legacy_endpoints: ['/ingest', '/morph', '/runtime', '/execute', '/registry', '/api/drop', '/api/intent']
  });
});

app.get('/admin', (_req, res) => {
  res.type('html').send(renderPage('Synthia MCP Handoff Admin', `
    <h1>Synthia MCP Handoff Admin</h1>
    <p>Proof surface for Kimi/Mobile MCP → Synthia root connector → ChatGPT inbox.</p>
    <div class="grid">
      <div class="card"><h2>MCP</h2><pre id="mcp">loading...</pre><button onclick="bootstrap()">Turn on MCP</button></div>
      <div class="card"><h2>Trident</h2><pre id="trident">loading...</pre><button onclick="wake()">Wake Trident</button></div>
      <div class="card"><h2>ChatGPT Inbox</h2><pre id="inbox">loading...</pre></div>
      <div class="card"><h2>Events</h2><pre id="events">loading...</pre></div>
    </div>
    <script>
      async function get(path){ return fetch(path).then(r=>r.json()); }
      async function post(path, body){ return fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})}).then(r=>r.json()); }
      async function refresh(){
        document.getElementById('mcp').textContent = JSON.stringify(await get('/mcp/status'), null, 2);
        document.getElementById('trident').textContent = JSON.stringify(await get('/trident/status'), null, 2);
        document.getElementById('inbox').textContent = JSON.stringify(await get('/mcp/inbox/chatgpt'), null, 2);
        document.getElementById('events').textContent = JSON.stringify((await get('/mcp/events')).events.slice(0,10), null, 2);
      }
      async function bootstrap(){ await post('/mcp/bootstrap',{source:'admin'}); refresh(); }
      async function wake(){ await post('/trident/wake',{source:'admin'}); refresh(); }
      refresh(); setInterval(refresh, 4000);
    </script>
  `));
});

app.get('/client', (_req, res) => {
  res.type('html').send(renderPage('Synthia Client Capture', `
    <h1>Synthia Client Capture</h1>
    <p>Paste Kimi/Mobile MCP output here. This does not call Kimi or OpenAI APIs. It sends a local handoff packet into Synthia.</p>
    <label>Source</label><input id="source" value="kimi" />
    <label>Target inbox</label><input id="target" value="chatgpt" />
    <label>Content</label><textarea id="content" rows="10" placeholder="Paste captured work/output here"></textarea>
    <p><button onclick="send()">Send to MCP capture</button></p>
    <pre id="result"></pre>
    <script>
      async function send(){
        const body = {
          source: document.getElementById('source').value || 'kimi',
          target: document.getElementById('target').value || 'chatgpt',
          content: document.getElementById('content').value,
          capture_type: 'manual_client_capture'
        };
        const out = await fetch('/mcp/capture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
        document.getElementById('result').textContent = JSON.stringify(out, null, 2);
      }
    </script>
  `));
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
    mcp: POC.mcp,
    trident: { status: POC.trident.status, configured: Boolean(POC.trident.url), api_key_required: false },
    timestamp: now()
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

app.get('/mcp/status', (_req, res) => {
  res.json({
    ok: true,
    mcp: POC.mcp,
    bridge: {
      status: POC.mcp.status === 'online' ? 'ready' : 'waiting_for_bootstrap',
      flow: 'kimi_or_mobile_capture -> synthia_server -> mcp_inbox_chatgpt',
      no_hidden_llm_api_keys: true
    },
    agents: POC.agents,
    inbox_counts: Object.fromEntries(Object.entries(POC.inboxes).map(([k, v]) => [k, v.length])),
    timestamp: now()
  });
});

app.post('/mcp/bootstrap', async (req, res) => {
  POC.mcp.status = 'online';
  POC.mcp.last_bootstrap = now();
  const event = recordEvent('mcp', req.body?.source || 'server', 'MCP handoff surface bootstrapped', { no_hidden_llm_api_keys: true });
  const trident = await wakeTrident('mcp_bootstrap');
  res.json({ ok: true, mcp: POC.mcp, trident, event });
});

app.get('/mcp/agents', (_req, res) => {
  res.json({ ok: true, agents: POC.agents });
});

app.get('/mcp/events', (_req, res) => {
  res.json({ ok: true, events: POC.events });
});

app.post('/mcp/capture', async (req, res) => {
  const payload = req.body || {};
  const source = payload.source || 'kimi';
  const target = payload.target || 'chatgpt';
  const capture = {
    id: newId('cap'),
    source,
    target,
    type: payload.capture_type || 'mobile_mcp_capture',
    content: payload.content || payload.text || payload.message || '',
    metadata: payload.metadata || {},
    summary: summarizePayload(payload),
    timestamp: now()
  };
  POC.captures.unshift(capture);
  POC.captures = POC.captures.slice(0, 100);
  const inbox = enqueue(target, { kind: 'capture', source, payload: capture });
  const event = recordEvent('capture', source, `Capture routed to ${target}`, { capture_id: capture.id, inbox_id: inbox.id });
  res.json({ ok: true, capture, routed_to: target, inbox, event });
});

app.post('/mcp/artifact', async (req, res) => {
  const payload = req.body || {};
  const source = payload.source || 'kimi';
  const target = payload.target || 'chatgpt';
  const artifact = {
    id: newId('art'),
    source,
    target,
    name: payload.name || payload.filename || 'artifact',
    content: payload.content || payload.text || '',
    metadata: payload.metadata || {},
    summary: summarizePayload(payload),
    timestamp: now()
  };
  POC.artifacts.unshift(artifact);
  POC.artifacts = POC.artifacts.slice(0, 100);
  const inbox = enqueue(target, { kind: 'artifact', source, payload: artifact });
  const event = recordEvent('artifact', source, `Artifact routed to ${target}`, { artifact_id: artifact.id, inbox_id: inbox.id });
  res.json({ ok: true, artifact, routed_to: target, inbox, event });
});

app.get('/mcp/inbox/:agent', (req, res) => {
  const agent = String(req.params.agent || '').toLowerCase();
  res.json({ ok: true, agent, inbox: POC.inboxes[agent] || [] });
});

app.post('/mcp/implement', (req, res) => {
  const implementation = {
    id: newId('impl'),
    source: req.body?.source || 'chatgpt',
    status: req.body?.status || 'received',
    detail: req.body || {},
    timestamp: now()
  };
  const event = recordEvent('implementation', implementation.source, 'Implementation status recorded', implementation);
  res.json({ ok: true, implementation, event });
});

app.get('/mcp/bridge/status', (_req, res) => {
  res.json({
    ok: true,
    status: POC.mcp.status === 'online' ? 'ready' : 'offline',
    bridge: 'Kimi/Mobile MCP -> Synthia-server -> ChatGPT inbox',
    trident: { status: POC.trident.status, configured: Boolean(POC.trident.url), api_key_required: false },
    counts: { captures: POC.captures.length, artifacts: POC.artifacts.length, runs: POC.runs.length },
    no_hidden_llm_api_keys: true,
    timestamp: now()
  });
});

app.post('/substrate/inquire', async (req, res) => {
  const payload = req.body || {};
  const run = {
    id: newId('run'),
    source: payload.source || 'user',
    target: payload.target || 'chatgpt',
    inquiry: payload.inquiry || payload.prompt || payload.message || payload.content || '',
    status: 'received',
    route: 'root_connector -> mcp -> trident_wake -> chatgpt_inbox',
    timestamp: now()
  };
  POC.runs.unshift(run);
  POC.runs = POC.runs.slice(0, 100);

  const trident = await wakeTrident('substrate_inquire');
  run.trident = trident;
  run.status = trident.ok ? 'trident_wake_requested' : 'queued_without_trident';

  const inbox = enqueue(run.target, { kind: 'substrate_inquiry', source: run.source, payload: run });
  const event = recordEvent('substrate', run.source, `Substrate inquiry routed to ${run.target}`, { run_id: run.id, trident_status: trident.status });
  res.json({ ok: true, run, trident, inbox, event });
});

app.get('/substrate/runs', (_req, res) => {
  res.json({ ok: true, runs: POC.runs });
});

app.get('/substrate/runs/:id', (req, res) => {
  const run = POC.runs.find((item) => item.id === req.params.id);
  if (!run) return res.status(404).json({ ok: false, error: 'run_not_found' });
  res.json({ ok: true, run });
});

app.get('/trident/status', (_req, res) => {
  res.json({
    ok: true,
    trident: {
      status: POC.trident.status,
      url_configured: Boolean(POC.trident.url),
      last_wake: POC.trident.last_wake,
      api_key_required: false
    }
  });
});

app.post('/trident/wake', async (req, res) => {
  const trident = await wakeTrident(req.body?.reason || 'manual_wake');
  const event = recordEvent('trident', req.body?.source || 'server', 'Trident wake requested', trident);
  res.json({ ok: true, trident, event });
});

app.get('/router/status', (_req, res) => {
  res.json({
    ok: true,
    router: 'online',
    role: 'root connector for MCP handoff POC',
    routes: ['/mcp/capture', '/mcp/artifact', '/mcp/inbox/:agent', '/substrate/inquire', '/trident/wake'],
    no_hidden_llm_api_keys: true
  });
});

app.post('/router/delegate', async (req, res) => {
  const target = req.body?.target || 'chatgpt';
  const trident = await wakeTrident('router_delegate');
  const inbox = enqueue(target, { kind: 'delegation', source: req.body?.source || 'router', payload: req.body || {} });
  const event = recordEvent('router', req.body?.source || 'router', `Delegation routed to ${target}`, { inbox_id: inbox.id, trident_status: trident.status });
  res.json({ ok: true, routed_to: target, trident, inbox, event });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'route_not_found_in_node_lite',
    path: req.path,
    hint: 'Use /admin, /client, /mcp/status, /mcp/capture, /mcp/inbox/chatgpt, or /substrate/inquire.'
  });
});

app.listen(PORT, () => {
  console.log(`✓ Synthia Node Lite relay listening on ${PORT}`);
  console.log(`✓ Python bridge: ${PYTHON_BRIDGE_URL || 'not configured'}`);
  console.log(`✓ MCP handoff POC surface: /admin /client /mcp/status`);
});
