require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 10000;
const NODE_MODE = process.env.NODE_MODE || 'lite';
const MCP_TERMINAL_COMMAND = process.env.MCP_TERMINAL_COMMAND || 'npm run mcp';
const TRIDENT_MCP_COMMAND = process.env.TRIDENT_MCP_COMMAND || 'npx tsx trident-mcp-server.ts';
const TERMINAL_TOKEN = process.env.TERMINAL_TOKEN || process.env.ADMIN_TOKEN || process.env.SYNTHIA_TERMINAL_TOKEN || '';
const PYTHON_BRIDGE_URL = process.env.PYTHON_BRIDGE_URL || process.env.SYNTHIA_PYTHON_URL || '';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.RATE_LIMIT_MAX || 500) }));
app.use(express.json({ limit: process.env.JSON_LIMIT || '50mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || '50mb' }));

const now = () => new Date().toISOString();
const id = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const hash = (v) => crypto.createHash('sha256').update(String(typeof v === 'string' ? v : JSON.stringify(v || {}))).digest('hex');
const safe = (v, n = 12000) => String(v ?? '').slice(0, n);

const state = {
  started_at: now(),
  mcp: { status: 'offline', last_bootstrap: null, terminal_required: true },
  terminal: { status: 'stopped', command: MCP_TERMINAL_COMMAND, pid: null, started_at: null, stopped_at: null, exit_code: null, logs: [] },
  trident: { status: 'stopped', command: TRIDENT_MCP_COMMAND, pid: null, transport: 'stdio' },
  agents: {
    alexis: { id: 'alexis', label: 'Alexis', role: 'operator', status: 'online', capabilities: ['command', 'route'] },
    kimi: { id: 'kimi', label: 'Kimi', role: 'capture/source', status: 'logical', capabilities: ['capture', 'handoff'] },
    chatgpt: { id: 'chatgpt', label: 'ChatGPT', role: 'implementation/inbox', status: 'logical', capabilities: ['reasoning', 'code', 'architecture'] },
    cynthia: { id: 'cynthia', label: 'Cynthia', role: 'root connector', status: 'online', capabilities: ['router', 'memory', 'surface'] },
    trident: { id: 'trident', label: 'Trident', role: 'MCP tool carrier', status: 'stopped', capabilities: ['tools', 'rag', 'code', 'research'] },
    mobile_mcp: { id: 'mobile_mcp', label: 'Mobile MCP', role: 'mobile bridge', status: 'logical', capabilities: ['mobile', 'capture'] }
  },
  inboxes: { alexis: [], kimi: [], chatgpt: [], cynthia: [], trident: [], mobile_mcp: [], broadcast: [] },
  routes: [], morphs: [], uploads: [], captures: [], artifacts: [], runs: [], events: [], discovery_messages: []
};
let mcpProcess = null;
let tridentProcess = null;

function log(line) {
  const entry = { timestamp: now(), line: safe(line) };
  state.terminal.logs.unshift(entry);
  state.terminal.logs = state.terminal.logs.slice(0, 300);
  return entry;
}
function event(type, source, message, detail = {}) {
  const e = { id: id('evt'), type, source, message, detail, timestamp: now() };
  state.events.unshift(e);
  state.events = state.events.slice(0, 300);
  return e;
}
function tokenFrom(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-terminal-token'] || req.query.token || req.body?.token || '');
}
function auth(req, res) {
  if (!TERMINAL_TOKEN) {
    res.status(403).json({ ok: false, error: 'terminal_token_not_configured', fix: 'Set TERMINAL_TOKEN in Render env vars, then redeploy.' });
    return false;
  }
  if (tokenFrom(req) !== TERMINAL_TOKEN) {
    res.status(401).json({ ok: false, error: 'terminal_auth_required', fix: 'Send x-terminal-token, Bearer token, or ?token=...' });
    return false;
  }
  return true;
}
function normalizeAgent(input = {}) {
  const agentId = String(input.id || input.agent_id || input.name || id('agent')).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return {
    id: agentId,
    label: input.label || input.name || agentId,
    owner: input.owner || 'alexis',
    role: input.role || input.domain || 'agent',
    status: input.status || 'online',
    capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
    convergence_interests: Array.isArray(input.convergence_interests) ? input.convergence_interests : [],
    endpoint: input.endpoint || null,
    adapter_kind: input.adapter_kind || input.protocol || 'mcp',
    registered_at: input.registered_at || now(),
    last_seen: now(),
    meta: input.meta || {}
  };
}
function ensureInbox(agent) {
  const key = String(agent || 'broadcast').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!state.inboxes[key]) state.inboxes[key] = [];
  return key;
}
function inferChannel(payload = {}) {
  const explicit = payload.hexagram || payload.channel || payload.route_channel;
  if (explicit) return String(explicit);
  const text = `${payload.subject || ''} ${payload.text || payload.message || payload.content || ''}`.toLowerCase();
  if (text.includes('identity') || text.includes('trust')) return '25-51 / EGO';
  if (text.includes('structure') || text.includes('understand')) return '63-4 / UNDERSTANDING';
  if (text.includes('sense') || text.includes('sequence')) return '42-53 / SENSING';
  if (text.includes('emerge') || text.includes('unknown')) return '3-60 / KNOWING';
  return 'unassigned';
}
function route(kind, payload = {}) {
  const source = ensureInbox(payload.source || payload.from || 'alexis');
  const target = ensureInbox(payload.target || payload.to || 'chatgpt');
  const subject = payload.subject || payload.topic || payload.name || kind;
  const channel = inferChannel({ ...payload, subject });
  const r = { id: id('route'), kind, source, target, project: payload.project || 'Synthia MCP connector', subject, channel, path: `${source} -> synthia-server -> mcp-bus -> ${target}`, status: 'routed', timestamp: now() };
  state.routes.unshift(r); state.routes = state.routes.slice(0, 300);
  const morph = { id: id('morph'), source_route: r.id, state: 'routed_through_mcp_bus', channel, subject, target, timestamp: now() };
  state.morphs.unshift(morph); state.morphs = state.morphs.slice(0, 300);
  return { route: r, morph };
}
function sendMessage(kind, payload = {}) {
  const { route: r, morph } = route(kind, payload);
  const message = { id: id('msg'), kind, source: r.source, target: r.target, text: safe(payload.text || payload.message || payload.content || '', 8000), route: r, morph, payload_meta: { hash: hash(payload).slice(0, 16), keys: Object.keys(payload || {}) }, timestamp: now() };
  state.inboxes[r.target].unshift(message); state.inboxes[r.target] = state.inboxes[r.target].slice(0, 200);
  state.inboxes.broadcast.unshift(message); state.inboxes.broadcast = state.inboxes.broadcast.slice(0, 200);
  event(kind, r.source, `${kind} routed to ${r.target}`, { route_id: r.id, message_id: message.id });
  return message;
}
function spawnTracked(kind, commandLine, source = 'api') {
  const parts = String(commandLine || '').split(' ').filter(Boolean);
  const command = parts.shift();
  if (!command) return { ok: false, error: `${kind}_command_empty` };
  log(`[${kind}] start requested by ${source}: ${commandLine}`);
  const proc = spawn(command, parts, { cwd: process.cwd(), env: process.env, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
  proc.stdout.on('data', d => log(`[${kind} stdout] ${d.toString()}`));
  proc.stderr.on('data', d => log(`[${kind} stderr] ${d.toString()}`));
  proc.on('error', err => log(`[${kind} error] ${err.message}`));
  proc.on('exit', code => {
    log(`[${kind} exit] code ${code}`);
    if (kind === 'mcp') { state.mcp.status = 'offline'; state.terminal.status = 'stopped'; state.terminal.exit_code = code; state.terminal.stopped_at = now(); mcpProcess = null; }
    if (kind === 'trident') { state.trident.status = 'stopped'; state.trident.pid = null; state.agents.trident.status = 'stopped'; tridentProcess = null; }
  });
  return { ok: true, proc, pid: proc.pid, command: commandLine };
}
function startMcp(source = 'api') {
  if (mcpProcess && !mcpProcess.killed) return { ok: true, already_running: true, terminal: state.terminal };
  state.terminal.status = 'starting'; state.terminal.command = MCP_TERMINAL_COMMAND; state.terminal.started_at = now(); state.terminal.stopped_at = null; state.terminal.exit_code = null;
  const out = spawnTracked('mcp', MCP_TERMINAL_COMMAND, source);
  if (!out.ok) { state.terminal.status = 'error'; state.mcp.status = 'error'; return out; }
  mcpProcess = out.proc; state.terminal.status = 'running'; state.terminal.pid = out.pid; state.mcp.status = 'online'; state.mcp.last_bootstrap = now();
  event('mcp', source, 'MCP carrier started', { pid: out.pid, command: out.command });
  return { ok: true, started: true, terminal: state.terminal };
}
function startTrident(source = 'api') {
  if (tridentProcess && !tridentProcess.killed) return { ok: true, already_running: true, trident: state.trident };
  const out = spawnTracked('trident', TRIDENT_MCP_COMMAND, source);
  if (!out.ok) { state.trident.status = 'error'; return out; }
  tridentProcess = out.proc; state.trident.status = 'running'; state.trident.pid = out.pid; state.agents.trident.status = 'online';
  event('trident', source, 'Trident MCP carrier started', { pid: out.pid, command: out.command });
  return { ok: true, started: true, trident: state.trident };
}
function status() {
  return { ok: true, service: 'synthia-node', mode: NODE_MODE, role: 'MCP connector bus for all agents', terminal_token_configured: Boolean(TERMINAL_TOKEN), mcp: state.mcp, terminal: state.terminal, trident: state.trident, agents: state.agents, counts: { agents: Object.keys(state.agents).length, inboxes: Object.keys(state.inboxes).length, messages: Object.values(state.inboxes).reduce((a, v) => a + v.length, 0), routes: state.routes.length, morphs: state.morphs.length, events: state.events.length }, endpoints: ['/terminal','/api/status','/mcp/status','/mcp/bootstrap','/mcp/bus','/mcp/agents','/mcp/register','/mcp/route','/mcp/inbox/:agent','/trident/mcp/start','/trident/mcp/status','/api/v3/discovery/health'] };
}
function terminalPage() { return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthia Terminal</title><style>body{margin:0;background:#050509;color:#e8eef8;font-family:ui-monospace,Menlo,monospace}.wrap{max-width:1100px;margin:0 auto;padding:18px}.card{background:#0d111c;border:1px solid #263041;border-radius:16px;padding:14px;margin:12px 0}h1{color:#00f0ff}input{width:100%;background:#03050a;color:#e8eef8;border:1px solid #263041;border-radius:10px;padding:12px;margin:8px 0}button{background:#00f0ff;color:#001014;border:0;border-radius:10px;padding:11px 14px;font-weight:900;margin:4px;cursor:pointer}.secondary{background:#182235;color:#e8eef8;border:1px solid #263041}pre{white-space:pre-wrap;word-break:break-word;background:#020307;border:1px solid #263041;border-radius:12px;padding:12px;min-height:330px;max-height:560px;overflow:auto}</style></head><body><div class="wrap"><div class="card"><h1>Synthia MCP Terminal</h1><p>MCP connects Alexis, Kimi, ChatGPT, Cynthia, Trident, Mobile MCP, and any registered agent.</p></div><div class="card"><input id="token" type="password" placeholder="TERMINAL_TOKEN"><button onclick="save()">Save token</button><button onclick="mcp()">Start MCP</button><button onclick="trident()">Start Trident</button><button class="secondary" onclick="stat()">Status</button><button class="secondary" onclick="logs()">Logs</button><button class="secondary" onclick="agents()">Agents</button><button class="secondary" onclick="bus()">Bus</button></div><div class="card"><input id="cmd" value="node -v && npm -v"><button onclick="run()">Run command</button><button class="secondary" onclick="document.getElementById('cmd').value='npm run mcp'">npm run mcp</button><button class="secondary" onclick="document.getElementById('cmd').value='npx tsx trident-mcp-server.ts'">trident</button></div><div class="card"><pre id="out">ready</pre></div></div><script>const out=document.getElementById('out'),tok=document.getElementById('token');tok.value=localStorage.synthiaTerminalToken||'';function save(){localStorage.synthiaTerminalToken=tok.value;out.textContent='saved'}function h(){return {'content-type':'application/json','x-terminal-token':tok.value}}async function j(m,p,b){const r=await fetch(p,{method:m,headers:h(),body:b?JSON.stringify(b):undefined});const t=await r.text();try{return JSON.stringify(JSON.parse(t),null,2)}catch{return t}}async function stat(){out.textContent=await j('GET','/api/status')}async function logs(){out.textContent=await j('GET','/mcp/terminal/logs')}async function mcp(){out.textContent=await j('POST','/mcp/bootstrap',{source:'terminal'})}async function trident(){out.textContent=await j('POST','/trident/mcp/start',{source:'terminal'})}async function agents(){out.textContent=await j('GET','/mcp/agents')}async function bus(){out.textContent=await j('GET','/mcp/bus')}async function run(){out.textContent=await j('POST','/terminal/run',{command:document.getElementById('cmd').value})}stat()</script></body></html>`; }

app.get('/', (_req, res) => res.type('html').send('<h1>Synthia Server</h1><p><a href="/terminal">Open MCP Terminal</a></p>'));
app.get('/surface', (_req, res) => res.redirect('/terminal'));
app.get('/admin', (_req, res) => res.redirect('/terminal'));
app.get('/client', (_req, res) => res.redirect('/terminal'));
app.get('/terminal', (_req, res) => res.type('html').send(terminalPage()));
app.get('/api/status', (_req, res) => res.json(status()));
app.get('/health', (_req, res) => res.json({ ...status(), status: 'healthy' }));
app.get('/poc/overview', (_req, res) => res.json({ ok: true, counts: status().counts, latest_route: state.routes[0] || null, latest_morph: state.morphs[0] || null, projects: [{ id: 'mcp-bus', name: 'Everyone connector', status: 'active' }], mcp: state.mcp, terminal: state.terminal }));
app.get('/poc/projects', (_req, res) => res.json({ ok: true, projects: [{ id: 'mcp-bus', name: 'Everyone connector', status: 'active' }] }));

app.get('/mcp/status', (_req, res) => res.json({ ok: true, mcp: state.mcp, terminal: state.terminal, bridge: { status: state.mcp.status === 'online' ? 'ready' : 'waiting_for_terminal_bootstrap', flow: 'any agent -> synthia-server -> mcp-bus -> target agent' }, agents: state.agents, inbox_counts: Object.fromEntries(Object.entries(state.inboxes).map(([k, v]) => [k, v.length])), timestamp: now() }));
app.post('/mcp/bootstrap', (req, res) => res.json(startMcp(req.body?.source || 'api')));
app.post('/mcp/terminal/start', (req, res) => res.json(startMcp(req.body?.source || 'api')));
app.get('/mcp/terminal/status', (_req, res) => res.json({ ok: true, terminal: state.terminal, mcp: state.mcp }));
app.get('/mcp/terminal/logs', (_req, res) => res.json({ ok: true, logs: state.terminal.logs }));
app.get('/mcp/agents', (_req, res) => res.json({ ok: true, agents: state.agents }));
app.post('/mcp/register', (req, res) => { const agent = normalizeAgent(req.body || {}); state.agents[agent.id] = agent; ensureInbox(agent.id); event('agent', agent.id, 'Agent registered', agent); res.json({ ok: true, registered: true, agent }); });
app.get('/mcp/bus', (_req, res) => res.json({ ok: true, bus: { agents: Object.keys(state.agents), inboxes: Object.fromEntries(Object.entries(state.inboxes).map(([k, v]) => [k, v.length])), routes: state.routes.slice(0, 50), events: state.events.slice(0, 50) } }));
app.post('/mcp/route', (req, res) => res.json({ ok: true, message: sendMessage('route', req.body || {}) }));
app.post('/mcp/capture', (req, res) => { const msg = sendMessage('capture', req.body || {}); state.captures.unshift(msg); res.json({ ok: true, capture: msg, route: msg.route, morph: msg.morph, inbox: state.inboxes[msg.target][0] }); });
app.post('/mcp/upload', (req, res) => { const msg = sendMessage('upload', req.body || {}); state.uploads.unshift(msg); res.json({ ok: true, upload: msg, route: msg.route, morph: msg.morph, inbox: state.inboxes[msg.target][0] }); });
app.post('/mcp/artifact', (req, res) => { const msg = sendMessage('artifact', req.body || {}); state.artifacts.unshift(msg); res.json({ ok: true, artifact: msg, route: msg.route, morph: msg.morph, inbox: state.inboxes[msg.target][0] }); });
app.get('/mcp/inbox/:agent', (req, res) => { const key = ensureInbox(req.params.agent); res.json({ ok: true, agent: key, inbox: state.inboxes[key] }); });
app.get('/mcp/events', (_req, res) => res.json({ ok: true, events: state.events }));
app.get('/mcp/routes', (_req, res) => res.json({ ok: true, routes: state.routes }));
app.get('/mcp/morphs', (_req, res) => res.json({ ok: true, morphs: state.morphs }));
app.get('/mcp/uploads', (_req, res) => res.json({ ok: true, uploads: state.uploads }));
app.post('/mcp/implement', (req, res) => res.json({ ok: true, implementation: sendMessage('implementation', req.body || {}) }));
app.get('/mcp/bridge/status', (_req, res) => res.json({ ok: true, status: state.mcp.status === 'online' ? 'ready' : 'offline', bridge: 'everyone -> synthia-server -> mcp-bus -> everyone', terminal: state.terminal, trident: state.trident, counts: status().counts }));

app.post('/substrate/inquire', (req, res) => { const msg = sendMessage('substrate_inquiry', req.body || {}); state.runs.unshift(msg); res.json({ ok: true, run: msg, route: msg.route, morph: msg.morph, inbox: state.inboxes[msg.target][0] }); });
app.get('/substrate/runs', (_req, res) => res.json({ ok: true, runs: state.runs }));
app.get('/substrate/runs/:id', (req, res) => res.json({ ok: true, run: state.runs.find(r => r.id === req.params.id) || null }));

app.get('/trident/status', (_req, res) => res.json({ ok: true, trident: state.trident }));
app.post('/trident/wake', (_req, res) => res.json(startTrident('wake')));
app.get('/trident/mcp/status', (_req, res) => res.json({ ok: true, trident_mcp: state.trident }));
app.get('/trident/mcp/tools', (_req, res) => res.json({ ok: true, transport: 'stdio', tools: ['trident_generate','trident_router','trident_rag_add','trident_rag_search','trident_rag_list','code_review','code_fix_patch','repo_deploy_plan','human_design_chart','human_design_profile','human_design_gate','human_design_channels','coherence_check','human_design_interpret','physics_explain','math_solve','research_summarize','hypothesis_builder','photo_analysis_prompt','image_generation_brief','visual_debug_prompt','oracle_ask','memory_save','memory_get','tool_suite_manifest'], count: 26 }));
app.post('/trident/mcp/start', (req, res) => { if (!auth(req, res)) return; res.json(startTrident(req.body?.source || 'api')); });
app.post('/trident/mcp/stop', (req, res) => { if (!auth(req, res)) return; if (tridentProcess && !tridentProcess.killed) tridentProcess.kill('SIGTERM'); state.trident.status = 'stopped'; state.trident.pid = null; res.json({ ok: true, stopped: true }); });

app.post('/terminal/run', (req, res) => { if (!auth(req, res)) return; const command = safe(req.body?.command, 600).trim(); if (!command) return res.status(400).json({ ok: false, error: 'command_required' }); log(`[terminal] ${command}`); exec(command, { cwd: process.cwd(), env: process.env, timeout: Number(process.env.TERMINAL_COMMAND_TIMEOUT_MS || 25000), maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => res.json({ ok: !error, command, stdout: safe(stdout, 20000), stderr: safe(stderr, 20000), error: error ? error.message : null, code: error && typeof error.code !== 'undefined' ? error.code : 0, timestamp: now() })); });

app.get('/api/v3/discovery/health', (_req, res) => res.json({ ok: true, service: 'synthia-discovery', mounted: true, agents: Object.keys(state.agents).length, messages: state.discovery_messages.length, timestamp: now() }));
app.post('/api/v3/discovery/register', (req, res) => { const agent = normalizeAgent(req.body || {}); state.agents[agent.id] = agent; ensureInbox(agent.id); res.json({ ok: true, registered: true, agent }); });
app.post('/api/v3/discovery/heartbeat/:agentId', (req, res) => { const key = String(req.params.agentId || '').toLowerCase(); if (state.agents[key]) state.agents[key].last_seen = now(); res.json({ ok: true, agent_id: key, known: Boolean(state.agents[key]), last_seen: now() }); });
app.get('/api/v3/discovery/agents', (_req, res) => res.json({ ok: true, agents: Object.values(state.agents), count: Object.keys(state.agents).length }));
app.get('/api/v3/discovery/graph', (_req, res) => res.json({ ok: true, graph: { nodes: Object.values(state.agents), edges: state.routes.map(r => ({ from: r.source, to: r.target, kind: r.kind, route_id: r.id })) } }));
app.get('/api/v3/discovery/matches/:agentId', (req, res) => res.json({ ok: true, agent_id: req.params.agentId, matches: Object.values(state.agents).filter(a => a.id !== req.params.agentId) }));
app.get('/api/v3/discovery/opportunities', (_req, res) => res.json({ ok: true, opportunities: state.routes.slice(0, 25) }));
app.post('/api/v3/discovery/message', (req, res) => { const msg = sendMessage('discovery_message', req.body || {}); state.discovery_messages.unshift(msg); res.json({ ok: true, routed: true, message: msg }); });
app.get('/api/v3/discovery/messages/:agentId', (req, res) => { const key = ensureInbox(req.params.agentId); res.json({ ok: true, agent_id: key, messages: state.inboxes[key] }); });
app.get('/api/v3/discovery/status', (_req, res) => res.json({ ok: true, mounted: true, bus: 'mcp', routes: ['/mcp/register','/mcp/route','/mcp/inbox/:agent','/api/v3/discovery/register','/api/v3/discovery/message'] }));

app.get('/router/status', (_req, res) => res.json({ ok: true, router: 'online', role: 'MCP everyone connector', routes: status().endpoints }));
app.post('/router/delegate', (req, res) => res.json({ ok: true, message: sendMessage('delegation', req.body || {}) }));

app.use((req, res) => res.status(404).json({ ok: false, error: 'route_not_found_in_synthia_mcp_bus', path: req.path, hint: 'Use /terminal, /api/status, /mcp/status, /mcp/bus, /mcp/route, /mcp/inbox/chatgpt, /trident/mcp/status, or /api/v3/discovery/health.' }));
app.listen(PORT, () => { console.log(`✓ Synthia MCP connector bus listening on ${PORT}`); console.log(`✓ MCP command: ${MCP_TERMINAL_COMMAND}`); console.log(`✓ Trident command: ${TRIDENT_MCP_COMMAND}`); });
