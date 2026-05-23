// Synthia Control Preload
// Working browser terminal + Trident MCP control + discovery routes.
// Loaded with: node -r ./server/control-preload.js server/lite.js

const express = require('express');
const { exec, spawn } = require('child_process');
const crypto = require('crypto');

const installed = new WeakSet();
const logs = [];
const discovery = { started_at: new Date().toISOString(), agents: new Map(), messages: [] };
let tridentProcess = null;

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function safe(value, max = 20000) { return String(value ?? '').slice(0, max); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex').slice(0, 16); }
function log(entry) { logs.unshift({ timestamp: now(), ...entry }); logs.splice(300); }
function terminalToken() { return process.env.TERMINAL_TOKEN || process.env.ADMIN_TOKEN || process.env.SYNTHIA_TERMINAL_TOKEN || ''; }
function readToken(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-terminal-token'] || req.query.token || req.body?.token || '');
}
function requireAuth(req, res) {
  const token = terminalToken();
  if (!token) {
    res.status(403).json({ ok: false, error: 'terminal_token_not_configured', fix: 'Set TERMINAL_TOKEN in Render env vars, then redeploy.' });
    return false;
  }
  if (readToken(req) !== token) {
    res.status(401).json({ ok: false, error: 'terminal_auth_required', fix: 'Send x-terminal-token header, Bearer token, or ?token=...' });
    return false;
  }
  return true;
}
function normalizeAgent(input = {}) {
  const agentId = String(input.id || input.agent_id || input.name || id('agent')).toLowerCase();
  return {
    id: agentId,
    name: input.name || agentId,
    owner: input.owner || 'unknown',
    domain: input.domain || 'general',
    capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
    convergence_interests: Array.isArray(input.convergence_interests) ? input.convergence_interests : [],
    endpoint: input.endpoint || null,
    adapter_kind: input.adapter_kind || input.protocol || 'unknown',
    status: 'online',
    registered_at: input.registered_at || now(),
    last_seen: now(),
    meta: input.meta || {}
  };
}
function scoreAgents(a, b) {
  let score = 0;
  const ac = new Set((a.capabilities || []).map(String));
  const bc = new Set((b.capabilities || []).map(String));
  const ai = new Set((a.convergence_interests || []).map(String));
  const bi = new Set((b.convergence_interests || []).map(String));
  for (const c of ac) if (bc.has(c)) score += 2;
  for (const i of ai) if (bi.has(i)) score += 1;
  if (a.domain && a.domain === b.domain) score += 1;
  return score;
}
function discoveryGraph() {
  const nodes = Array.from(discovery.agents.values());
  const edges = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const score = scoreAgents(nodes[i], nodes[j]);
      if (score > 0) edges.push({ from: nodes[i].id, to: nodes[j].id, score, kind: 'capability_resonance' });
    }
  }
  return { nodes, edges };
}
function tridentCommand() { return process.env.TRIDENT_MCP_COMMAND || 'npx tsx trident-mcp-server.ts'; }
function startTrident(source = 'api') {
  if (tridentProcess && !tridentProcess.killed) {
    return { ok: true, already_running: true, pid: tridentProcess.pid, command: tridentCommand() };
  }
  const command = tridentCommand();
  const parts = command.split(' ').filter(Boolean);
  const bin = parts.shift();
  if (!bin) return { ok: false, error: 'empty_trident_command' };
  log({ type: 'trident_start_requested', source, command });
  try {
    tridentProcess = spawn(bin, parts, { cwd: process.cwd(), env: process.env, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    tridentProcess.stdout.on('data', (data) => log({ type: 'trident_stdout', line: safe(data.toString(), 4000) }));
    tridentProcess.stderr.on('data', (data) => log({ type: 'trident_stderr', line: safe(data.toString(), 4000) }));
    tridentProcess.on('error', (error) => log({ type: 'trident_error', error: error.message }));
    tridentProcess.on('exit', (code) => { log({ type: 'trident_exit', code }); tridentProcess = null; });
    return { ok: true, started: true, pid: tridentProcess.pid, command, note: 'Trident MCP is stdio-based. This starts the carrier process; tools are listed over HTTP for control visibility.' };
  } catch (error) {
    log({ type: 'trident_start_failed', error: error.message });
    return { ok: false, error: error.message, command };
  }
}
function tridentStatus() {
  return {
    ok: true,
    trident_mcp: {
      running: Boolean(tridentProcess && !tridentProcess.killed),
      pid: tridentProcess && !tridentProcess.killed ? tridentProcess.pid : null,
      command: tridentCommand(),
      transport: 'stdio',
      usable_from_browser: false,
      control_layer: 'http endpoints expose start/status/tools/logs'
    },
    timestamp: now()
  };
}
const TRIDENT_TOOLS = [
  'trident_generate','trident_router','trident_rag_add','trident_rag_search','trident_rag_list',
  'code_review','code_fix_patch','repo_deploy_plan',
  'human_design_chart','human_design_profile','human_design_gate','human_design_channels','coherence_check','human_design_interpret',
  'physics_explain','math_solve','research_summarize','hypothesis_builder',
  'photo_analysis_prompt','image_generation_brief','visual_debug_prompt',
  'oracle_ask','memory_save','memory_get','tool_suite_manifest'
];
function terminalHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthia Terminal</title><style>
body{margin:0;background:#050509;color:#e8eef8;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.wrap{max-width:1100px;margin:0 auto;padding:18px}.card{background:#0d111c;border:1px solid #263041;border-radius:16px;padding:14px;margin:12px 0}h1{color:#00f0ff;margin:0 0 8px}input{width:100%;background:#03050a;color:#e8eef8;border:1px solid #263041;border-radius:10px;padding:12px;margin:8px 0;font-family:inherit}button{background:#00f0ff;color:#001014;border:0;border-radius:10px;padding:11px 14px;font-weight:900;cursor:pointer;margin:4px 6px 4px 0}.secondary{background:#182235;color:#e8eef8;border:1px solid #263041}.danger{background:#ff5f56;color:white}pre{white-space:pre-wrap;word-break:break-word;background:#020307;border:1px solid #263041;border-radius:12px;padding:12px;min-height:330px;max-height:560px;overflow:auto}.pill{display:inline-block;padding:6px 9px;border:1px solid #263041;border-radius:999px;color:#8b9bb2;margin:3px}code{color:#00f0ff}</style></head><body><div class="wrap"><div class="card"><h1>Synthia Server Terminal</h1><span class="pill">browser cockpit</span><span class="pill">MCP startup</span><span class="pill">Trident control</span><p>Set <code>TERMINAL_TOKEN</code> in Render. This page will not run commands without it.</p></div><div class="card"><label>Token</label><input id="token" type="password" placeholder="TERMINAL_TOKEN"><button onclick="save()">Save token locally</button><button class="secondary" onclick="status()">Server status</button><button class="secondary" onclick="logs()">Logs</button><button onclick="mcp()">MCP bootstrap</button><button onclick="tridentStart()">Start Trident</button><button class="secondary" onclick="tridentStatus()">Trident status</button><button class="secondary" onclick="tools()">Tools</button></div><div class="card"><label>Command</label><input id="cmd" value="node -v && npm -v" onkeydown="if(event.key==='Enter')run()"><button onclick="run()">Run command</button><button class="secondary" onclick="cmd('pwd')">pwd</button><button class="secondary" onclick="cmd('ls -la')">ls</button><button class="secondary" onclick="cmd('npm run mcp')">npm run mcp</button><button class="secondary" onclick="cmd('npx tsx trident-mcp-server.ts')">trident</button></div><div class="card"><h3>Output</h3><pre id="out">ready</pre></div></div><script>
const out=document.getElementById('out'); const tok=document.getElementById('token'); tok.value=localStorage.synthiaTerminalToken||'';
function save(){localStorage.synthiaTerminalToken=tok.value; out.textContent='saved locally';}
function h(){return {'content-type':'application/json','x-terminal-token':tok.value};}
function cmd(v){document.getElementById('cmd').value=v;}
async function j(method,path,body){const r=await fetch(path,{method,headers:h(),body:body?JSON.stringify(body):undefined}); const t=await r.text(); try{return JSON.stringify(JSON.parse(t),null,2)}catch{return t}}
async function status(){out.textContent=await j('GET','/terminal/status')}
async function logs(){out.textContent=await j('GET','/terminal/logs')}
async function mcp(){out.textContent=await j('POST','/mcp/bootstrap',{source:'terminal-ui'})}
async function tridentStart(){out.textContent=await j('POST','/trident/mcp/start',{source:'terminal-ui'})}
async function tridentStatus(){out.textContent=await j('GET','/trident/mcp/status')}
async function tools(){out.textContent=await j('GET','/trident/mcp/tools')}
async function run(){out.textContent='running...'; out.textContent=await j('POST','/terminal/run',{command:document.getElementById('cmd').value})}
status();
</script></body></html>`;
}
function installControlRoutes(app) {
  if (!app || installed.has(app)) return;
  installed.add(app);

  app.get('/terminal', (_req, res) => res.type('html').send(terminalHtml()));
  app.get('/terminal/status', (_req, res) => res.json({ ok: true, mounted: true, token_configured: Boolean(terminalToken()), cwd: process.cwd(), timestamp: now() }));
  app.get('/terminal/logs', (req, res) => { if (!requireAuth(req, res)) return; res.json({ ok: true, logs }); });
  app.post('/terminal/run', (req, res) => {
    if (!requireAuth(req, res)) return;
    const command = safe(req.body?.command || '').trim();
    if (!command) return res.status(400).json({ ok: false, error: 'command_required' });
    const started_at = now();
    log({ type: 'command_start', command, started_at });
    exec(command, { cwd: process.cwd(), env: process.env, timeout: Number(process.env.TERMINAL_COMMAND_TIMEOUT_MS || 25000), maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const result = { ok: !error, command, started_at, finished_at: now(), stdout: safe(stdout), stderr: safe(stderr), error: error ? safe(error.message) : null, code: error && typeof error.code !== 'undefined' ? error.code : 0 };
      log({ type: 'command_finish', ...result });
      res.json(result);
    });
  });

  app.get('/trident/mcp/status', (_req, res) => res.json(tridentStatus()));
  app.get('/trident/mcp/tools', (_req, res) => res.json({ ok: true, transport: 'stdio', tools: TRIDENT_TOOLS, count: TRIDENT_TOOLS.length }));
  app.post('/trident/mcp/start', (req, res) => { if (!requireAuth(req, res)) return; res.json(startTrident(req.body?.source || 'api')); });
  app.post('/trident/mcp/stop', (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!tridentProcess || tridentProcess.killed) return res.json({ ok: true, already_stopped: true });
    const pid = tridentProcess.pid;
    tridentProcess.kill('SIGTERM');
    tridentProcess = null;
    log({ type: 'trident_stop', pid });
    res.json({ ok: true, stopped: true, pid });
  });

  app.get('/api/v3/discovery/health', (_req, res) => res.json({ ok: true, service: 'synthia-discovery', mounted: true, agents: discovery.agents.size, messages: discovery.messages.length, timestamp: now() }));
  app.post('/api/v3/discovery/register', (req, res) => { const agent = normalizeAgent(req.body || {}); discovery.agents.set(agent.id, agent); res.json({ ok: true, registered: true, agent }); });
  app.post('/api/v3/discovery/message', (req, res) => { const p = req.body || {}; const message = { id: id('disc_msg'), from: p.from || p.source || 'unknown', to: p.to || p.target || 'broadcast', text: safe(p.text || p.message || p.content || '', 6000), intent_type: p.intent_type || p.intent || 'context_sync', created_at: now(), hash: hash(p) }; discovery.messages.unshift(message); discovery.messages.splice(500); res.json({ ok: true, routed: true, message }); });
  app.get('/api/v3/discovery/messages/:agentId', (req, res) => { const a = String(req.params.agentId || '').toLowerCase(); res.json({ ok: true, agent_id: a, messages: discovery.messages.filter(m => String(m.to).toLowerCase() === a || String(m.from).toLowerCase() === a || m.to === 'broadcast') }); });
  app.get('/api/v3/discovery/agents', (_req, res) => res.json({ ok: true, agents: Array.from(discovery.agents.values()) }));
  app.get('/api/v3/discovery/graph', (_req, res) => res.json({ ok: true, graph: discoveryGraph() }));
  app.get('/api/v3/discovery/status', (_req, res) => res.json({ ok: true, mounted: true, routes: ['/terminal','/terminal/run','/trident/mcp/start','/trident/mcp/status','/trident/mcp/tools','/api/v3/discovery/health'] }));
}

const originalUse = express.application.use;
express.application.use = function patchedUse(...args) {
  const last = args[args.length - 1];
  const src = typeof last === 'function' ? String(last) : '';
  if (src.includes('route_not_found_in_node_lite')) installControlRoutes(this);
  return originalUse.apply(this, args);
};

const originalListen = express.application.listen;
express.application.listen = function patchedListen(...args) {
  installControlRoutes(this);
  return originalListen.apply(this, args);
};

module.exports = { installControlRoutes };
