require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 10000;
const PYTHON_BRIDGE_URL = process.env.PYTHON_BRIDGE_URL || process.env.SYNTHIA_PYTHON_URL || '';
const NODE_MODE = process.env.NODE_MODE || 'lite';
const MCP_TERMINAL_COMMAND = process.env.MCP_TERMINAL_COMMAND || 'npm run mcp';
const TRIDENT_CONNECTOR_URL = process.env.TRIDENT_CONNECTOR_URL || process.env.HF_TRIDENT_GENERAL_URL || process.env.TRIDENT_URL || '';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.RATE_LIMIT_MAX || 300) }));
app.use(express.json({ limit: process.env.JSON_LIMIT || '50mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || '50mb' }));

function now() { return new Date().toISOString(); }
function sha256(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }
function newId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function summarizePayload(payload = {}) {
  const raw = JSON.stringify(payload || {});
  return { bytes: Buffer.byteLength(raw), hash: sha256(raw), keys: Object.keys(payload || {}), received_at: now() };
}
function safeText(value, fallback = '') { return String(value ?? fallback).slice(0, 6000); }
function inferHexagram(payload = {}) {
  const explicit = payload.hexagram || payload.channel || payload.route_channel;
  if (explicit) return String(explicit);
  const text = `${payload.subject || ''} ${payload.content || payload.text || payload.message || ''}`.toLowerCase();
  if (text.includes('trust') || text.includes('identity')) return '25-51 / EGO';
  if (text.includes('structure') || text.includes('understand')) return '63-4 / UNDERSTANDING';
  if (text.includes('sense') || text.includes('sequence')) return '42-53 / SENSING';
  if (text.includes('emerge') || text.includes('unknown')) return '3-60 / KNOWING';
  if (text.includes('align') || text.includes('center')) return '10-34 / CENTERING';
  return 'unassigned';
}
function inferMorph(payload = {}) {
  const hex = inferHexagram(payload);
  const family = hex.includes('/') ? hex.split('/').pop().trim() : 'UNASSIGNED';
  return {
    state: 'queued_for_substrate_morph',
    family,
    channel: hex,
    subject: payload.subject || payload.project || 'unclassified',
    visibility: payload.visibility || 'operator-panel',
    next: 'route through MCP handoff and surface/inbox panels'
  };
}
function routeRecord(kind, payload = {}) {
  const source = payload.source || 'surface';
  const target = payload.target || 'chatgpt';
  const project = payload.project || 'POC handoff';
  const subject = payload.subject || payload.topic || payload.name || kind;
  const hexagram = inferHexagram(payload);
  const morph = inferMorph({ ...payload, subject, hexagram });
  return {
    id: newId('route'),
    kind,
    source,
    target,
    project,
    subject,
    hexagram,
    path: `${source} -> synthia-server -> MCP handoff -> ${target}`,
    morph,
    status: 'routed',
    timestamp: now()
  };
}

const POC = {
  started_at: now(),
  mcp: { status: 'offline', last_bootstrap: null, terminal_required: true },
  terminal: { status: 'stopped', command: MCP_TERMINAL_COMMAND, pid: null, started_at: null, stopped_at: null, exit_code: null, logs: [] },
  trident: { status: 'unknown', last_wake: null, url: TRIDENT_CONNECTOR_URL },
  address_model: {
    repo: process.env.TRIDENT_ADDRESS_MODEL_REPO || 'stellarproximology/Trident',
    file: process.env.TRIDENT_ADDRESS_MODEL_FILE || 'Trident_synthia.onnx',
    url: process.env.TRIDENT_ADDRESS_MODEL_URL || 'https://huggingface.co/stellarproximology/Trident/resolve/main/Trident_synthia.onnx'
  },
  agents: {
    kimi: { label: 'Kimi', role: 'current capture/source side', status: 'logical' },
    chatgpt: { label: 'ChatGPT', role: 'current implementation/inbox side', status: 'logical' },
    cynthia: { label: 'Cynthia', role: 'current root connector/server surface', status: 'online' }
  },
  profiles: {
    alexis: { id: 'alexis', label: 'Alexis', morph: 'primary operator surface' },
    joe: { id: 'joe', label: 'Joe', morph: 'participant surface' }
  },
  projects: [
    { id: 'poc-handoff', name: 'Kimi / Mobile MCP / ChatGPT handoff', status: 'active', phase: 'current proof', next: 'prove visible capture, upload, routing, inbox, MCP terminal path' },
    { id: 'substrate-surface', name: 'Visible substrate panel', status: 'active', phase: 'front-end proof', next: 'surface should show morph/project/subject route state' },
    { id: 'mcp-terminal', name: 'Server MCP terminal activation', status: 'pending_runtime', phase: 'server process proof', next: 'configure MCP_TERMINAL_COMMAND to actual server command if npm run mcp is not correct' }
  ],
  inboxes: { kimi: [], chatgpt: [], cynthia: [], alexis: [], joe: [] },
  captures: [],
  artifacts: [],
  uploads: [],
  routes: [],
  morphs: [],
  runs: [],
  events: []
};

let mcpProcess = null;

function pushLog(line) {
  const entry = { timestamp: now(), line: safeText(line, '').slice(0, 4000) };
  POC.terminal.logs.unshift(entry);
  POC.terminal.logs = POC.terminal.logs.slice(0, 200);
  return entry;
}
function recordEvent(type, source, message, detail = {}) {
  const event = { id: newId('evt'), type, source, message, detail, timestamp: now() };
  POC.events.unshift(event);
  POC.events = POC.events.slice(0, 250);
  return event;
}
function enqueue(agent, item) {
  const key = String(agent || 'chatgpt').toLowerCase();
  if (!POC.inboxes[key]) POC.inboxes[key] = [];
  const message = { id: newId('msg'), ...item, target: key, timestamp: now() };
  POC.inboxes[key].unshift(message);
  POC.inboxes[key] = POC.inboxes[key].slice(0, 150);
  return message;
}
function addRoute(kind, payload) {
  const route = routeRecord(kind, payload);
  POC.routes.unshift(route);
  POC.routes = POC.routes.slice(0, 200);
  POC.morphs.unshift({ id: newId('morph'), source_route: route.id, ...route.morph, timestamp: now() });
  POC.morphs = POC.morphs.slice(0, 200);
  return route;
}
function apiStatus() {
  return {
    ok: true,
    service: 'synthia-node',
    mode: NODE_MODE,
    role: 'root connector/router for visible MCP handoff POC',
    python_bridge: PYTHON_BRIDGE_URL ? 'configured' : 'not_configured',
    trident_connector: TRIDENT_CONNECTOR_URL ? 'configured' : 'not_configured',
    no_hidden_model_api_keys: true,
    interface: ['/', '/admin', '/client', '/surface'],
    poc_endpoints: [
      '/mcp/status', '/mcp/bootstrap', '/mcp/terminal/start', '/mcp/terminal/status', '/mcp/terminal/logs',
      '/mcp/capture', '/mcp/upload', '/mcp/uploads', '/mcp/artifact', '/mcp/routes', '/mcp/morphs',
      '/mcp/inbox/chatgpt', '/substrate/inquire', '/trident/wake', '/poc/overview', '/poc/projects'
    ],
    legacy_endpoints: ['/health', '/ingest', '/morph', '/runtime', '/execute', '/registry', '/api/drop', '/api/intent'],
    timestamp: now()
  };
}

async function forwardToPython(path, payload, method = 'POST') {
  if (!PYTHON_BRIDGE_URL) return { ok: false, forwarded: false, reason: 'PYTHON_BRIDGE_URL not configured' };
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
    return { ok: response.ok, forwarded: true, status: response.status, data };
  } catch (error) {
    return { ok: false, forwarded: false, error: error.message };
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
    created_at: now()
  };
}
async function wakeTrident(reason = 'mcp_handoff') {
  const url = POC.trident.url;
  POC.trident.last_wake = now();
  if (!url) {
    POC.trident.status = 'not_configured';
    return { ok: false, status: 'not_configured', reason: 'TRIDENT_CONNECTOR_URL is not configured', api_key_required: false };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.TRIDENT_WAKE_TIMEOUT_MS || 8000));
  try {
    const response = await fetch(url.replace(/\/$/, '') + '/wake', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, source: 'synthia-server', timestamp: now() }), signal: controller.signal
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    POC.trident.status = response.ok ? 'awake' : 'wake_failed';
    return { ok: response.ok, status: POC.trident.status, http_status: response.status, response: body, api_key_required: false };
  } catch (error) {
    POC.trident.status = 'wake_failed';
    return { ok: false, status: 'wake_failed', error: error.message, api_key_required: false };
  } finally { clearTimeout(timeout); }
}
function startMcpTerminal(source = 'server') {
  if (mcpProcess && !mcpProcess.killed) {
    POC.mcp.status = 'online';
    return { ok: true, already_running: true, terminal: POC.terminal };
  }
  const parts = MCP_TERMINAL_COMMAND.split(' ').filter(Boolean);
  const command = parts.shift();
  const args = parts;
  if (!command) return { ok: false, error: 'MCP_TERMINAL_COMMAND is empty' };
  POC.terminal = { status: 'starting', command: MCP_TERMINAL_COMMAND, pid: null, started_at: now(), stopped_at: null, exit_code: null, logs: POC.terminal.logs || [] };
  pushLog(`starting: ${MCP_TERMINAL_COMMAND}`);
  recordEvent('terminal', source, 'MCP terminal start requested', { command: MCP_TERMINAL_COMMAND });
  try {
    mcpProcess = spawn(command, args, { cwd: process.cwd(), env: process.env, shell: true });
    POC.terminal.status = 'running';
    POC.terminal.pid = mcpProcess.pid;
    POC.mcp.status = 'online';
    POC.mcp.last_bootstrap = now();
    mcpProcess.stdout.on('data', (data) => pushLog(`[stdout] ${data.toString()}`));
    mcpProcess.stderr.on('data', (data) => pushLog(`[stderr] ${data.toString()}`));
    mcpProcess.on('error', (error) => { POC.terminal.status = 'error'; POC.mcp.status = 'error'; pushLog(`[error] ${error.message}`); recordEvent('terminal', 'mcp', 'MCP terminal error', { error: error.message }); });
    mcpProcess.on('exit', (code) => { POC.terminal.status = 'stopped'; POC.terminal.exit_code = code; POC.terminal.stopped_at = now(); POC.mcp.status = 'offline'; pushLog(`[exit] MCP process exited with code ${code}`); recordEvent('terminal', 'mcp', 'MCP terminal stopped', { code }); mcpProcess = null; });
    return { ok: true, started: true, terminal: POC.terminal };
  } catch (error) {
    POC.terminal.status = 'error'; POC.mcp.status = 'error'; pushLog(`[start failed] ${error.message}`); return { ok: false, error: error.message, terminal: POC.terminal };
  }
}

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>
<style>
:root{--bg:#070a12;--panel:#111827;--panel2:#0d1320;--line:#263244;--text:#e7eefc;--muted:#97a6bd;--accent:#8ab4ff;--hot:#d9f99d;--bad:#fca5a5}*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:radial-gradient(circle at top left,#1e293b,#070a12 42%);color:var(--text);margin:0}.wrap{max-width:1280px;margin:0 auto;padding:24px}.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:16px;align-items:stretch}.card{border:1px solid var(--line);border-radius:18px;padding:16px;background:linear-gradient(180deg,var(--panel),var(--panel2));box-shadow:0 12px 40px rgba(0,0,0,.25)}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.tab{border:1px solid var(--line);background:#0b1220;color:var(--text);border-radius:999px;padding:10px 14px;cursor:pointer}.tab.active{background:var(--accent);color:#07101f}.section{display:none}.section.active{display:block}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}textarea,input,select{width:100%;background:#05070b;color:var(--text);border:1px solid var(--line);border-radius:12px;padding:11px;margin:6px 0 12px}button{background:var(--text);color:#07101f;border:0;border-radius:12px;padding:11px 14px;font-weight:800;cursor:pointer;margin:4px 6px 4px 0}button.secondary{background:#172033;color:var(--text);border:1px solid var(--line)}pre{white-space:pre-wrap;overflow:auto;background:#05070b;border:1px solid var(--line);padding:12px;border-radius:12px;max-height:420px}.badge{display:inline-block;border:1px solid var(--line);padding:6px 10px;border-radius:999px;margin:3px;color:var(--muted)}.nodefield{min-height:320px;border-radius:18px;border:1px solid var(--line);position:relative;overflow:hidden;background:radial-gradient(circle at 20% 30%,rgba(138,180,255,.25),transparent 25%),radial-gradient(circle at 80% 60%,rgba(217,249,157,.18),transparent 28%),#05070b}.node{position:absolute;width:92px;height:92px;border-radius:50%;display:grid;place-items:center;text-align:center;font-weight:800;border:1px solid rgba(255,255,255,.2);background:rgba(17,24,39,.8);transition:all .55s ease}.node.alexis{left:10%;top:18%}.node.substrate{left:42%;top:36%;width:128px;height:128px}.node.joe{right:11%;top:18%}.node.mcp{left:23%;bottom:14%}.node.chatgpt{right:22%;bottom:14%}.pulse{transform:scale(1.08);box-shadow:0 0 34px rgba(138,180,255,.7)}.statusrow{display:flex;gap:8px;flex-wrap:wrap}.pill{padding:7px 10px;border-radius:999px;background:#07111f;border:1px solid var(--line);color:var(--muted);font-size:13px}@media(max-width:800px){.hero{grid-template-columns:1fr}.wrap{padding:14px}}
</style></head><body><div class="wrap">${body}</div></body></html>`;
}
function appShell() {
  return page('Synthia Substrate POC', `
    <div class="hero">
      <div class="card"><h1>Synthia Substrate POC Panel</h1><p>Visible control surface for upload, capture, message passing, project status, morph/hexagram metadata, MCP terminal state, and backend status.</p><div class="statusrow"><span class="pill">visible interface</span><span class="pill">upload routing</span><span class="pill">project status</span><span class="pill">morph / hexagram</span><span class="pill">MCP terminal</span></div></div>
      <div class="card"><h2>Live State</h2><pre id="quickStatus">loading...</pre></div>
    </div>
    <div class="tabs">
      <button class="tab active" onclick="showTab('surface', event)">Surface</button>
      <button class="tab" onclick="showTab('talk', event)">Talk / Capture</button>
      <button class="tab" onclick="showTab('upload', event)">Upload</button>
      <button class="tab" onclick="showTab('projects', event)">Projects</button>
      <button class="tab" onclick="showTab('morph', event)">Morph / Hexagrams</button>
      <button class="tab" onclick="showTab('terminal', event)">MCP Terminal</button>
      <button class="tab" onclick="showTab('inbox', event)">Inbox / Trail</button>
      <button class="tab" onclick="showTab('backend', event)">Backend Status</button>
    </div>

    <section id="surface" class="section active"><div class="grid"><div class="card"><h2>Visible Morph Surface</h2><p>Local visual proof shell. It pulses when messages/uploads are routed.</p><div class="nodefield"><div class="node alexis">Alexis</div><div class="node substrate">Substrate</div><div class="node joe">Joe</div><div class="node mcp">MCP</div><div class="node chatgpt">ChatGPT</div></div></div><div class="card"><h2>Latest Route</h2><pre id="latestRoute">loading...</pre></div></div></section>

    <section id="talk" class="section"><div class="grid"><div class="card"><h2>Talk to Substrate / Capture Work</h2><label>Source</label><select id="profile"><option value="alexis">Alexis</option><option value="joe">Joe</option><option value="kimi">Kimi</option><option value="mobile-mcp">Mobile MCP</option></select><label>Target</label><select id="target"><option value="chatgpt">ChatGPT Inbox</option><option value="cynthia">Cynthia</option><option value="joe">Joe</option><option value="alexis">Alexis</option></select><label>Project</label><input id="project" value="POC handoff"/><label>Subject</label><input id="subject" placeholder="project, topic, file subject, morph area"/><label>Hexagram / Channel</label><input id="hexagram" placeholder="optional, e.g. 63-4 or 25-51"/><label>Message / Capture</label><textarea id="message" rows="7" placeholder="Talk to the substrate or paste Kimi/Mobile MCP output here"></textarea><button onclick="sendCapture()">Send Through MCP Handoff</button><button class="secondary" onclick="askSubstrate()">Substrate Inquiry</button></div><div class="card"><h2>Routing Result</h2><pre id="sendResult">waiting...</pre></div></div></section>

    <section id="upload" class="section"><div class="grid"><div class="card"><h2>Upload Artifact</h2><p>Uploads are routed with target, project, subject, and hexagram/channel metadata.</p><input id="fileInput" type="file"/><label>Target</label><select id="uploadTarget"><option value="chatgpt">ChatGPT Inbox</option><option value="cynthia">Cynthia</option><option value="alexis">Alexis</option><option value="joe">Joe</option></select><label>Project</label><input id="uploadProject" value="POC handoff"/><label>Subject</label><input id="uploadSubject" placeholder="what is this file for?"/><label>Hexagram / Channel</label><input id="uploadHexagram" placeholder="optional routing hint"/><button onclick="uploadFile()">Upload and Route</button></div><div class="card"><h2>Upload Routing Result</h2><pre id="uploadResult">waiting...</pre></div><div class="card"><h2>Recent Uploads</h2><pre id="uploadsBox">loading...</pre></div></div></section>

    <section id="projects" class="section"><div class="grid"><div class="card"><h2>Project Status</h2><pre id="projectsBox">loading...</pre></div><div class="card"><h2>Routes by Project</h2><pre id="routesBox2">loading...</pre></div></div></section>

    <section id="morph" class="section"><div class="grid"><div class="card"><h2>Morph / Subject / Hexagram Status</h2><pre id="morphBox">loading...</pre></div><div class="card"><h2>Address Model</h2><pre id="addressBox">loading...</pre></div></div></section>

    <section id="terminal" class="section"><div class="grid"><div class="card"><h2>MCP Terminal Activation</h2><p>MCP must be active from the server terminal path for the real handoff.</p><button onclick="bootstrapMcp()">Start / Bootstrap MCP</button><button class="secondary" onclick="wakeTrident()">Wake Trident Connector</button><pre id="terminalStatus">loading...</pre></div><div class="card"><h2>Terminal Logs</h2><pre id="terminalLogs">loading...</pre></div></div></section>

    <section id="inbox" class="section"><div class="grid"><div class="card"><h2>ChatGPT Inbox</h2><pre id="chatgptInbox">loading...</pre></div><div class="card"><h2>Message Passing Trail</h2><pre id="events">loading...</pre></div></div></section>

    <section id="backend" class="section"><div class="grid"><div class="card"><h2>Backend Status Panel</h2><p>The old root status is preserved here and at <code>/api/status</code>.</p><pre id="backendStatus">loading...</pre></div><div class="card"><h2>API Routes</h2><pre id="apiRoutesBox">loading...</pre></div></div></section>

<script>
function showTab(id, ev){ document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); if(ev) ev.target.classList.add('active'); document.querySelectorAll('.section').forEach(s=>s.classList.remove('active')); document.getElementById(id).classList.add('active'); refresh(); }
async function get(path){ const r = await fetch(path); return r.json(); }
async function post(path, body){ const r = await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})}); return r.json(); }
function morph(){ document.querySelectorAll('.node').forEach(n=>n.classList.add('pulse')); setTimeout(()=>document.querySelectorAll('.node').forEach(n=>n.classList.remove('pulse')), 900); }
async function refresh(){
  const status = await get('/api/status'); const mcp = await get('/mcp/status'); const overview = await get('/poc/overview');
  document.getElementById('quickStatus').textContent = JSON.stringify({mcp:mcp.mcp, terminal:mcp.terminal, counts:overview.counts}, null, 2);
  document.getElementById('backendStatus').textContent = JSON.stringify(status, null, 2);
  document.getElementById('apiRoutesBox').textContent = JSON.stringify(status.poc_endpoints, null, 2);
  document.getElementById('terminalStatus').textContent = JSON.stringify(await get('/mcp/terminal/status'), null, 2);
  document.getElementById('terminalLogs').textContent = JSON.stringify((await get('/mcp/terminal/logs')).logs.slice(0,25), null, 2);
  document.getElementById('chatgptInbox').textContent = JSON.stringify(await get('/mcp/inbox/chatgpt'), null, 2);
  document.getElementById('events').textContent = JSON.stringify((await get('/mcp/events')).events.slice(0,35), null, 2);
  document.getElementById('uploadsBox').textContent = JSON.stringify((await get('/mcp/uploads')).uploads.slice(0,20), null, 2);
  document.getElementById('projectsBox').textContent = JSON.stringify((await get('/poc/projects')).projects, null, 2);
  document.getElementById('routesBox2').textContent = JSON.stringify((await get('/mcp/routes')).routes.slice(0,30), null, 2);
  document.getElementById('morphBox').textContent = JSON.stringify((await get('/mcp/morphs')).morphs.slice(0,30), null, 2);
  document.getElementById('addressBox').textContent = JSON.stringify((await get('/trident/status')).address_model, null, 2);
  document.getElementById('latestRoute').textContent = JSON.stringify(overview.latest_route || {}, null, 2);
}
function baseMeta(){ return {source:document.getElementById('profile').value,target:document.getElementById('target').value,project:document.getElementById('project').value,subject:document.getElementById('subject').value,hexagram:document.getElementById('hexagram').value}; }
async function sendCapture(){ const out = await post('/mcp/capture',{...baseMeta(),content:document.getElementById('message').value,capture_type:'surface_message'}); document.getElementById('sendResult').textContent = JSON.stringify(out,null,2); morph(); refresh(); }
async function askSubstrate(){ const out = await post('/substrate/inquire',{...baseMeta(),content:document.getElementById('message').value}); document.getElementById('sendResult').textContent = JSON.stringify(out,null,2); morph(); refresh(); }
async function uploadFile(){ const file = document.getElementById('fileInput').files[0]; if(!file){ document.getElementById('uploadResult').textContent='choose a file first'; return; } const data = await new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file); }); const out = await post('/mcp/upload',{source:'surface_upload',target:document.getElementById('uploadTarget').value,project:document.getElementById('uploadProject').value,subject:document.getElementById('uploadSubject').value,hexagram:document.getElementById('uploadHexagram').value,name:file.name,mime:file.type,size:file.size,data}); document.getElementById('uploadResult').textContent = JSON.stringify(out,null,2); morph(); refresh(); }
async function bootstrapMcp(){ const out = await post('/mcp/bootstrap',{source:'surface'}); document.getElementById('terminalStatus').textContent=JSON.stringify(out,null,2); refresh(); }
async function wakeTrident(){ const out = await post('/trident/wake',{source:'surface'}); document.getElementById('terminalStatus').textContent=JSON.stringify(out,null,2); refresh(); }
refresh(); setInterval(refresh, 5000);
</script>`);
}

app.get('/', (_req, res) => res.type('html').send(appShell()));
app.get('/surface', (_req, res) => res.type('html').send(appShell()));
app.get('/admin', (_req, res) => res.type('html').send(appShell()));
app.get('/client', (_req, res) => res.type('html').send(appShell()));
app.get('/api/status', (_req, res) => res.json(apiStatus()));
app.get('/poc/overview', (_req, res) => res.json({ ok: true, counts: { captures: POC.captures.length, uploads: POC.uploads.length, artifacts: POC.artifacts.length, routes: POC.routes.length, morphs: POC.morphs.length, events: POC.events.length }, latest_route: POC.routes[0] || null, latest_morph: POC.morphs[0] || null, projects: POC.projects, mcp: POC.mcp, terminal: POC.terminal }));
app.get('/poc/projects', (_req, res) => res.json({ ok: true, projects: POC.projects }));

app.get('/health', async (_req, res) => res.json({ ok: true, status: 'healthy', service: 'synthia-node', mode: NODE_MODE, python_bridge: await forwardToPython('/health', null, 'GET'), mcp: POC.mcp, terminal: POC.terminal, trident: { status: POC.trident.status, configured: Boolean(POC.trident.url), api_key_required: false }, timestamp: now() }));
app.post(['/ingest', '/api/drop'], async (req, res) => { const contract = localContract('ingest', req.body || {}); res.json({ ok: true, handled_by: 'node-lite', contract, python: await forwardToPython('/ingest', { ...req.body, node_contract: contract }) }); });
app.post(['/morph', '/api/morph'], async (req, res) => { const contract = localContract('morph', req.body || {}); const route = addRoute('legacy_morph', { ...req.body, source: req.body?.source || 'legacy_morph', target: req.body?.target || 'cynthia' }); res.json({ ok: true, handled_by: 'node-lite', contract, route, python: await forwardToPython('/morph', { ...req.body, node_contract: contract }) }); });
app.post(['/runtime', '/api/runtime'], async (req, res) => res.json({ ok: true, handled_by: 'node-lite', runtime: { node: 'online', mode: NODE_MODE, heavy_engines: 'disabled', python_bridge: PYTHON_BRIDGE_URL ? 'configured' : 'not_configured' }, python: await forwardToPython('/runtime', req.body || {}) }));
app.post(['/execute', '/api/execute'], async (req, res) => res.json({ ok: true, handled_by: 'node-lite', executed: false, reason: 'Node lite mode does not execute packages; forwarded to Python if configured.', python: await forwardToPython('/execute', req.body || {}) }));
app.post(['/registry', '/api/registry'], async (req, res) => { const entry = localContract('registry', req.body || {}); res.json({ ok: true, handled_by: 'node-lite', entry, python: await forwardToPython('/registry', { ...req.body, node_registry_entry: entry }) }); });
app.post('/api/intent', async (req, res) => res.json({ ok: true, handled_by: 'node-lite', intent: req.body?.intent || req.body?.text || '', analysis: { mode: 'relay', confidence: 0.5, capabilities: ['python-bridge', 'degraded-intent'] }, requires_confirmation: true, python: await forwardToPython('/intent', req.body || {}) }));

app.get('/mcp/status', (_req, res) => res.json({ ok: true, mcp: POC.mcp, terminal: { status: POC.terminal.status, command: POC.terminal.command, pid: POC.terminal.pid, started_at: POC.terminal.started_at, stopped_at: POC.terminal.stopped_at, exit_code: POC.terminal.exit_code }, bridge: { status: POC.mcp.status === 'online' ? 'ready' : 'waiting_for_terminal_bootstrap', flow: 'visible_surface_or_kimi_capture -> synthia_server -> mcp_handoff -> chatgpt_inbox', no_hidden_model_api_keys: true }, agents: POC.agents, profiles: POC.profiles, inbox_counts: Object.fromEntries(Object.entries(POC.inboxes).map(([k, v]) => [k, v.length])), timestamp: now() }));
app.post('/mcp/bootstrap', async (req, res) => { const terminal = startMcpTerminal(req.body?.source || 'server'); const trident = await wakeTrident('mcp_bootstrap'); const event = recordEvent('mcp', req.body?.source || 'server', 'MCP bootstrap requested through server terminal path', { terminal, trident }); res.json({ ok: terminal.ok, terminal, trident, mcp: POC.mcp, event }); });
app.post('/mcp/terminal/start', (req, res) => res.json(startMcpTerminal(req.body?.source || 'server')));
app.get('/mcp/terminal/status', (_req, res) => res.json({ ok: true, terminal: POC.terminal, mcp: POC.mcp }));
app.get('/mcp/terminal/logs', (_req, res) => res.json({ ok: true, logs: POC.terminal.logs }));
app.get('/mcp/agents', (_req, res) => res.json({ ok: true, agents: POC.agents, profiles: POC.profiles }));
app.get('/mcp/events', (_req, res) => res.json({ ok: true, events: POC.events }));
app.get('/mcp/routes', (_req, res) => res.json({ ok: true, routes: POC.routes }));
app.get('/mcp/morphs', (_req, res) => res.json({ ok: true, morphs: POC.morphs }));
app.get('/mcp/uploads', (_req, res) => res.json({ ok: true, uploads: POC.uploads }));

app.post('/mcp/capture', async (req, res) => { const payload = req.body || {}; const source = payload.source || 'kimi'; const target = payload.target || 'chatgpt'; const route = addRoute('capture', { ...payload, source, target }); const capture = { id: newId('cap'), route_id: route.id, source, target, project: route.project, subject: route.subject, hexagram: route.hexagram, type: payload.capture_type || 'mobile_mcp_capture', content: safeText(payload.content || payload.text || payload.message || ''), metadata: payload.metadata || {}, summary: summarizePayload(payload), timestamp: now() }; POC.captures.unshift(capture); POC.captures = POC.captures.slice(0, 150); const inbox = enqueue(target, { kind: 'capture', source, route, payload: capture }); const event = recordEvent('capture', source, `Capture routed to ${target}`, { capture_id: capture.id, route_id: route.id, inbox_id: inbox.id, path: route.path }); res.json({ ok: true, capture, route, morph: route.morph, routed_to: target, inbox, event }); });

app.post('/mcp/upload', async (req, res) => { const payload = req.body || {}; const target = payload.target || 'chatgpt'; const route = addRoute('upload', { ...payload, source: payload.source || 'surface_upload', target }); const upload = { id: newId('upl'), route_id: route.id, source: payload.source || 'surface_upload', target, project: route.project, subject: route.subject, hexagram: route.hexagram, name: payload.name || 'upload', mime: payload.mime || 'application/octet-stream', size: payload.size || 0, data_hash: sha256(payload.data || payload.content || ''), data_preview: safeText(payload.data || '').slice(0, 120), metadata: payload.metadata || {}, timestamp: now() }; POC.uploads.unshift(upload); POC.uploads = POC.uploads.slice(0, 150); const inbox = enqueue(target, { kind: 'upload', source: upload.source, route, payload: upload }); const event = recordEvent('upload', upload.source, `Upload routed to ${target}`, { upload_id: upload.id, route_id: route.id, inbox_id: inbox.id, path: route.path }); res.json({ ok: true, upload, route, morph: route.morph, routed_to: target, inbox, event }); });

app.post('/mcp/artifact', async (req, res) => { const payload = req.body || {}; const source = payload.source || 'kimi'; const target = payload.target || 'chatgpt'; const route = addRoute('artifact', { ...payload, source, target }); const artifact = { id: newId('art'), route_id: route.id, source, target, project: route.project, subject: route.subject, hexagram: route.hexagram, name: payload.name || payload.filename || 'artifact', content: safeText(payload.content || payload.text || ''), metadata: payload.metadata || {}, summary: summarizePayload(payload), timestamp: now() }; POC.artifacts.unshift(artifact); POC.artifacts = POC.artifacts.slice(0, 150); const inbox = enqueue(target, { kind: 'artifact', source, route, payload: artifact }); const event = recordEvent('artifact', source, `Artifact routed to ${target}`, { artifact_id: artifact.id, route_id: route.id, inbox_id: inbox.id, path: route.path }); res.json({ ok: true, artifact, route, morph: route.morph, routed_to: target, inbox, event }); });
app.get('/mcp/inbox/:agent', (req, res) => res.json({ ok: true, agent: String(req.params.agent || '').toLowerCase(), inbox: POC.inboxes[String(req.params.agent || '').toLowerCase()] || [] }));
app.post('/mcp/implement', (req, res) => { const implementation = { id: newId('impl'), source: req.body?.source || 'chatgpt', status: req.body?.status || 'received', detail: req.body || {}, timestamp: now() }; const event = recordEvent('implementation', implementation.source, 'Implementation status recorded', implementation); res.json({ ok: true, implementation, event }); });
app.get('/mcp/bridge/status', (_req, res) => res.json({ ok: true, status: POC.mcp.status === 'online' ? 'ready' : 'offline', bridge: 'visible surface / Kimi / Mobile MCP -> Synthia-server -> MCP handoff -> ChatGPT inbox', terminal: POC.terminal, trident: { status: POC.trident.status, configured: Boolean(POC.trident.url), api_key_required: false }, counts: { captures: POC.captures.length, artifacts: POC.artifacts.length, uploads: POC.uploads.length, routes: POC.routes.length, morphs: POC.morphs.length, runs: POC.runs.length }, no_hidden_model_api_keys: true, timestamp: now() }));

app.post('/substrate/inquire', async (req, res) => { const payload = req.body || {}; const source = payload.source || 'user'; const target = payload.target || 'chatgpt'; const route = addRoute('substrate_inquiry', { ...payload, source, target }); const run = { id: newId('run'), route_id: route.id, source, target, project: route.project, subject: route.subject, hexagram: route.hexagram, inquiry: safeText(payload.inquiry || payload.prompt || payload.message || payload.content || ''), status: 'received', route: route.path, morph: route.morph, timestamp: now() }; POC.runs.unshift(run); POC.runs = POC.runs.slice(0, 150); const inbox = enqueue(target, { kind: 'substrate_inquiry', source, route, payload: run }); const event = recordEvent('substrate', source, `Substrate inquiry routed to ${target}`, { run_id: run.id, route_id: route.id, inbox_id: inbox.id, path: route.path }); res.json({ ok: true, run, route, morph: route.morph, inbox, event }); });
app.get('/substrate/runs', (_req, res) => res.json({ ok: true, runs: POC.runs }));
app.get('/substrate/runs/:id', (req, res) => { const run = POC.runs.find((item) => item.id === req.params.id); if (!run) return res.status(404).json({ ok: false, error: 'run_not_found' }); res.json({ ok: true, run }); });

app.get('/trident/status', (_req, res) => res.json({ ok: true, trident: { status: POC.trident.status, url_configured: Boolean(POC.trident.url), last_wake: POC.trident.last_wake, api_key_required: false }, address_model: POC.address_model }));
app.post('/trident/wake', async (req, res) => { const trident = await wakeTrident(req.body?.reason || 'manual_wake'); const event = recordEvent('trident', req.body?.source || 'server', 'Trident wake requested', trident); res.json({ ok: true, trident, event }); });
app.get('/router/status', (_req, res) => res.json({ ok: true, router: 'online', role: 'current root connector for visible MCP handoff POC', routes: ['/mcp/capture', '/mcp/upload', '/mcp/artifact', '/mcp/inbox/:agent', '/substrate/inquire', '/mcp/terminal/start'], no_hidden_model_api_keys: true }));
app.post('/router/delegate', async (req, res) => { const target = req.body?.target || 'chatgpt'; const route = addRoute('delegation', { ...req.body, source: req.body?.source || 'router', target }); const inbox = enqueue(target, { kind: 'delegation', source: req.body?.source || 'router', route, payload: req.body || {} }); const event = recordEvent('router', req.body?.source || 'router', `Delegation routed to ${target}`, { route_id: route.id, inbox_id: inbox.id }); res.json({ ok: true, routed_to: target, route, morph: route.morph, inbox, event }); });

app.use((req, res) => res.status(404).json({ ok: false, error: 'route_not_found_in_node_lite', path: req.path, hint: 'Use /, /mcp/status, /mcp/capture, /mcp/upload, /mcp/routes, /mcp/morphs, /mcp/inbox/chatgpt, /mcp/terminal/status, or /substrate/inquire.' }));
app.listen(PORT, () => { console.log(`✓ Synthia visible POC panel listening on ${PORT}`); console.log(`✓ MCP terminal command: ${MCP_TERMINAL_COMMAND}`); });
