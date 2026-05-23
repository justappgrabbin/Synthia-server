// Synthia Discovery Preload
// Injects /api/v3/discovery routes into the existing lite server without rewriting server/lite.js.

const express = require('express');
const crypto = require('crypto');

const installed = new WeakSet();
const state = {
  started_at: new Date().toISOString(),
  agents: new Map(),
  messages: [],
  opportunities: [],
  heartbeats: new Map()
};

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex'); }
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
function scoreMatch(a, b) {
  const ac = new Set((a.capabilities || []).map(String));
  const bc = new Set((b.capabilities || []).map(String));
  const ai = new Set((a.convergence_interests || []).map(String));
  const bi = new Set((b.convergence_interests || []).map(String));
  let score = 0;
  for (const c of ac) if (bc.has(c)) score += 2;
  for (const i of ai) if (bi.has(i)) score += 1;
  if (a.domain && b.domain && a.domain === b.domain) score += 1;
  return score;
}
function graph() {
  const agents = Array.from(state.agents.values());
  const edges = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const score = scoreMatch(agents[i], agents[j]);
      if (score > 0) edges.push({ from: agents[i].id, to: agents[j].id, score, kind: 'capability_resonance' });
    }
  }
  return { nodes: agents, edges };
}
function installDiscoveryRoutes(app) {
  if (!app || installed.has(app)) return;
  installed.add(app);

  app.get('/api/v3/discovery/health', (_req, res) => {
    res.json({ ok: true, service: 'synthia-discovery', mounted: true, mode: process.env.NODE_MODE || 'lite', started_at: state.started_at, agents: state.agents.size, messages: state.messages.length, timestamp: now() });
  });

  app.post('/api/v3/discovery/register', (req, res) => {
    const agent = normalizeAgent(req.body || {});
    state.agents.set(agent.id, agent);
    state.heartbeats.set(agent.id, now());
    res.json({ ok: true, registered: true, agent, timestamp: now() });
  });

  app.post('/api/v3/discovery/heartbeat/:agentId', (req, res) => {
    const agentId = String(req.params.agentId || '').toLowerCase();
    const agent = state.agents.get(agentId);
    if (agent) {
      agent.status = 'online';
      agent.last_seen = now();
      state.agents.set(agentId, agent);
    }
    state.heartbeats.set(agentId, now());
    res.json({ ok: true, agent_id: agentId, known: Boolean(agent), last_seen: state.heartbeats.get(agentId) });
  });

  app.get('/api/v3/discovery/agents', (_req, res) => {
    res.json({ ok: true, agents: Array.from(state.agents.values()), count: state.agents.size });
  });

  app.get('/api/v3/discovery/graph', (_req, res) => {
    res.json({ ok: true, graph: graph(), timestamp: now() });
  });

  app.get('/api/v3/discovery/matches/:agentId', (req, res) => {
    const agentId = String(req.params.agentId || '').toLowerCase();
    const agent = state.agents.get(agentId);
    if (!agent) return res.status(404).json({ ok: false, error: 'agent_not_found', agent_id: agentId });
    const matches = Array.from(state.agents.values())
      .filter((other) => other.id !== agentId)
      .map((other) => ({ agent: other, score: scoreMatch(agent, other) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    res.json({ ok: true, agent_id: agentId, matches });
  });

  app.get('/api/v3/discovery/opportunities', (_req, res) => {
    const g = graph();
    const opportunities = g.edges.map((edge) => ({ id: hash(edge).slice(0, 16), ...edge, status: 'open', created_at: now() }));
    state.opportunities = opportunities;
    res.json({ ok: true, opportunities });
  });

  app.post('/api/v3/discovery/message', (req, res) => {
    const payload = req.body || {};
    const message = {
      id: id('disc_msg'),
      from: payload.from || payload.source || 'unknown',
      to: payload.to || payload.target || 'broadcast',
      text: String(payload.text || payload.message || payload.content || ''),
      intent_type: payload.intent_type || payload.intent || 'context_sync',
      project: payload.project || null,
      meta: payload.meta || {},
      created_at: now(),
      hash: hash(payload).slice(0, 16)
    };
    state.messages.unshift(message);
    state.messages = state.messages.slice(0, 500);
    res.json({ ok: true, routed: true, message });
  });

  app.get('/api/v3/discovery/messages/:agentId', (req, res) => {
    const agentId = String(req.params.agentId || '').toLowerCase();
    const messages = state.messages.filter((m) => String(m.to).toLowerCase() === agentId || String(m.from).toLowerCase() === agentId || m.to === 'broadcast');
    res.json({ ok: true, agent_id: agentId, messages });
  });

  app.get('/api/v3/discovery/status', (_req, res) => {
    res.json({ ok: true, mounted: true, routes: [
      'GET /api/v3/discovery/health',
      'POST /api/v3/discovery/register',
      'POST /api/v3/discovery/heartbeat/:agentId',
      'GET /api/v3/discovery/agents',
      'GET /api/v3/discovery/graph',
      'GET /api/v3/discovery/matches/:agentId',
      'GET /api/v3/discovery/opportunities',
      'POST /api/v3/discovery/message',
      'GET /api/v3/discovery/messages/:agentId'
    ], timestamp: now() });
  });
}

const originalListen = express.application.listen;
express.application.listen = function patchedListen(...args) {
  installDiscoveryRoutes(this);
  return originalListen.apply(this, args);
};

module.exports = { installDiscoveryRoutes };
