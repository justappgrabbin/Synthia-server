/**
 * PAPER WORLDS SERVER
 * Express backend running alongside Synthia on Render.
 *
 * Pipeline on every upload:
 * 1. Receive file(s)
 * 2. Assign ontological address
 * 3. Store in Supabase
 * 4. Run gap analysis
 * 5. Auto-fill static gaps
 * 6. Check for resonant pairs → auto-mix if found
 * 7. Notify Synthia
 * 8. Broadcast graph update via WebSocket
 * 9. Return address + artifact to client
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import archiver from 'archiver';

import { createAddress, inferDimension } from './address.js';
import { supabase, upsertArtifact, createEdge, getGraphData,
         getArtifacts, logGap, getTrident, upsertTrident } from './db.js';
import { runGapAnalysis, autoFillArtifact, analyzeGraphGaps } from './gapFiller.js';
import { checkAndMix } from './mixer.js';
import { createRepo, listPaperWorldsRepos } from './github.js';
import { checkSynthiaStatus, notifyArtifactCreated,
         notifyMixComplete, syncTridentToSynthia } from './synthia.js';

dotenv.config();

const app  = express();
const http = createServer(app);
const wss  = new WebSocketServer({ server: http, path: '/ws' });

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: (process.env.CORS_ORIGINS ?? '*').split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────

const clients = new Set<WebSocket>();

wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', server: 'paper-worlds', version: '1.0.0' }));
  ws.on('close', () => clients.delete(ws));
});

function broadcast(type: string, data: any) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function getUserId(req: express.Request): string {
  return (req.headers['x-user-id'] as string) ?? 'anonymous';
}

// ── FULL INGEST PIPELINE ──────────────────────────────────────────────────────

async function ingestArtifact(params: {
  name:      string;
  type:      string;
  source:    string;
  content:   string;
  mimeType?: string;
  userId?:   string;
}): Promise<any> {
  const { name, type, source, content, mimeType, userId } = params;
  const isHtml = type === 'html' || mimeType?.includes('html') || content.trimStart().startsWith('<!');

  // 1. Address
  const addr = createAddress(name, content, type);

  // 2. Store
  const artifact = await upsertArtifact({
    id:          uuid(),
    name,
    type,
    source,
    html:        isHtml ? content : null,
    content:     isHtml ? null    : content,
    size_bytes:  Buffer.byteLength(content, 'utf8'),
    mime_type:   mimeType ?? 'text/plain',
    ...addr,
  });

  log(`📦 Ingested: "${name}" → Gate ${addr.gate} · ${addr.dimension} · ${addr.address_22t}`);
  broadcast('artifact_created', { id: artifact.id, name, gate: addr.gate, signature: addr.signature });

  // 3. Gap analysis (async — don't block response)
  runGapAnalysis(artifact).then(gaps => {
    if (gaps.length) {
      log(`🔍 Gaps found in "${name}": ${gaps.map(g => g.type).join(', ')}`);
      broadcast('gaps_detected', { artifact_id: artifact.id, gaps });
    }
  });

  // 4. Auto-mix (async)
  checkAndMix(artifact).then(mixes => {
    mixes.forEach(mix => {
      if (mix.mixed) {
        log(`🔀 Mixed "${name}" + partner → ${mix.artifact?.name}`);
        broadcast('mix_created', {
          result_name:     mix.artifact?.name,
          result_id:       mix.artifact?.id,
          resonance_score: mix.resonanceScore,
          reason:          mix.reason,
        });
        notifyMixComplete(mix);
      }
    });
  });

  // 5. Notify Synthia (async)
  notifyArtifactCreated(artifact);

  return artifact;
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  const synthia = await checkSynthiaStatus();
  res.json({
    status:      'alive',
    server:      'paper-worlds',
    version:     '1.0.0',
    synthia:     synthia.alive,
    supabase:    !!process.env.SUPABASE_URL,
    github:      !!process.env.GITHUB_TOKEN,
    anthropic:   !!process.env.ANTHROPIC_API_KEY,
    clients:     clients.size,
    ts:          new Date().toISOString(),
  });
});

// ── ARTIFACTS ──────────────────────────────────────────────────────────────────

// Upload one or more files
app.post('/api/upload', upload.array('files', 20), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) { res.status(400).json({ error: 'No files' }); return; }

  const results = [];
  for (const file of files) {
    const content = file.buffer.toString('utf8');
    const ext     = path.extname(file.originalname).slice(1).toLowerCase();
    const type    = ['html','htm'].includes(ext) ? 'html'
                  : ['js','ts','tsx','jsx'].includes(ext) ? 'code'
                  : ['json','yaml','yml'].includes(ext) ? 'data'
                  : ['md','txt'].includes(ext) ? 'doc'
                  : ['css'].includes(ext) ? 'style'
                  : ['py'].includes(ext) ? 'code'
                  : 'upload';

    const artifact = await ingestArtifact({
      name:     file.originalname,
      type,
      source:  'upload',
      content,
      mimeType: file.mimetype,
      userId:   getUserId(req),
    });
    results.push(artifact);
  }

  res.json({ success: true, artifacts: results });
});

// Paper Pal build → ingest the generated HTML
app.post('/api/build', async (req, res) => {
  const { name, type, html } = req.body;
  if (!html || !name) { res.status(400).json({ error: 'name + html required' }); return; }

  const artifact = await ingestArtifact({
    name,
    type:    type ?? 'html',
    source: 'pal',
    content: html,
    mimeType: 'text/html',
    userId:   getUserId(req),
  });

  res.json({ success: true, artifact });
});

// Get all artifacts
app.get('/api/artifacts', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const artifacts = await getArtifacts(limit);
  res.json({ artifacts });
});

// Get one artifact
app.get('/api/artifacts/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('pw_artifacts').select('*').eq('id', req.params.id).single();
  if (error) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ artifact: data });
});

// Delete artifact
app.delete('/api/artifacts/:id', async (req, res) => {
  await supabase.from('pw_artifacts').delete().eq('id', req.params.id);
  broadcast('artifact_deleted', { id: req.params.id });
  res.json({ success: true });
});

// ── GRAPH ──────────────────────────────────────────────────────────────────────

app.get('/api/graph', async (_req, res) => {
  const graph = await getGraphData();
  res.json(graph);
});

// ── GAP FILLER ────────────────────────────────────────────────────────────────

// Run gap analysis on a specific artifact
app.post('/api/gaps/analyze/:id', async (req, res) => {
  const { data: artifact } = await supabase
    .from('pw_artifacts').select('*').eq('id', req.params.id).single();
  if (!artifact) { res.status(404).json({ error: 'Not found' }); return; }

  const gaps = await runGapAnalysis(artifact);
  broadcast('gaps_detected', { artifact_id: artifact.id, gaps });
  res.json({ gaps });
});

// Auto-fill all static gaps for an artifact
app.post('/api/gaps/fill/:id', async (req, res) => {
  const { data: artifact } = await supabase
    .from('pw_artifacts').select('*').eq('id', req.params.id).single();
  if (!artifact) { res.status(404).json({ error: 'Not found' }); return; }

  const filledHtml = await autoFillArtifact(artifact);
  broadcast('artifact_updated', { id: artifact.id, name: artifact.name });
  res.json({ success: true, html: filledHtml });
});

// Run graph-level gap analysis
app.get('/api/gaps/graph', async (_req, res) => {
  const gaps = await analyzeGraphGaps();
  res.json({ gaps });
});

// Get all open gaps
app.get('/api/gaps', async (_req, res) => {
  const { data } = await supabase
    .from('pw_gaps')
    .select('*')
    .eq('resolved', false)
    .order('created_at', { ascending: false });
  res.json({ gaps: data ?? [] });
});

// ── MIXER ─────────────────────────────────────────────────────────────────────

// Manually trigger mix between two artifacts
app.post('/api/mix', async (req, res) => {
  const { artifact_id_a, artifact_id_b } = req.body;
  if (!artifact_id_a || !artifact_id_b) {
    res.status(400).json({ error: 'artifact_id_a + artifact_id_b required' });
    return;
  }

  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from('pw_artifacts').select('*').eq('id', artifact_id_a).single(),
    supabase.from('pw_artifacts').select('*').eq('id', artifact_id_b).single(),
  ]);

  if (!a || !b) { res.status(404).json({ error: 'Artifact(s) not found' }); return; }

  const { mixArtifacts } = await import('./mixer.js');
  const result = await mixArtifacts(a, b, 0.85);

  if (result.mixed) {
    broadcast('mix_created', {
      result_name:     result.artifact?.name,
      result_id:       result.artifact?.id,
      resonance_score: result.resonanceScore,
    });
  }

  res.json(result);
});

// ── GITHUB ────────────────────────────────────────────────────────────────────

app.post('/api/github/publish/:id', async (req, res) => {
  const { data: artifact } = await supabase
    .from('pw_artifacts').select('*').eq('id', req.params.id).single();
  if (!artifact) { res.status(404).json({ error: 'Not found' }); return; }

  const result = await createRepo(artifact);

  if (result.success) {
    await supabase.from('pw_artifacts')
      .update({ github_repo: result.repo_name, github_url: result.repo_url })
      .eq('id', artifact.id);
    broadcast('github_published', { artifact_id: artifact.id, ...result });
  }

  res.json(result);
});

app.get('/api/github/repos', async (_req, res) => {
  const repos = await listPaperWorldsRepos();
  res.json({ repos });
});

// ── DOWNLOAD AS ZIP ────────────────────────────────────────────────────────────

app.get('/api/artifacts/:id/zip', async (req, res) => {
  const { data: artifact } = await supabase
    .from('pw_artifacts').select('*').eq('id', req.params.id).single();
  if (!artifact) { res.status(404).json({ error: 'Not found' }); return; }

  const safeName = artifact.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.append(artifact.html || artifact.content || '', { name: 'index.html' });
  archive.append(JSON.stringify({
    name: artifact.name, signature: artifact.signature,
    address_22t: artifact.address_22t, gate: artifact.gate,
    dimension: artifact.dimension, created_at: artifact.created_at,
  }, null, 2), { name: 'manifest.json' });
  archive.append(`# ${artifact.name}\n\nOntological address: ${artifact.signature}\n22T position: ${artifact.address_22t}\n`, { name: 'README.md' });
  await archive.finalize();
});

// ── TRIDENT ───────────────────────────────────────────────────────────────────

app.get('/api/trident/:userId', async (req, res) => {
  const trident = await getTrident(req.params.userId);
  res.json({ trident: trident ?? null });
});

app.post('/api/trident/:userId', async (req, res) => {
  const trident = await upsertTrident(req.params.userId, req.body);
  await syncTridentToSynthia(trident);
  broadcast('trident_updated', { user_id: req.params.userId, stage: trident.agent_stage });
  res.json({ trident });
});

// ── SYNTHIA PROXY ─────────────────────────────────────────────────────────────

app.get('/api/synthia/status', async (_req, res) => {
  const status = await checkSynthiaStatus();
  res.json(status);
});

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3002', 10);
http.listen({ port: PORT, host: '0.0.0.0' }, () => {
  log(`🌍 Paper Worlds Server running on port ${PORT}`);
  log(`📡 WebSocket: ws://localhost:${PORT}/ws`);
  log(`🧠 Synthia: ${process.env.SYNTHIA_URL}`);
  log(`🗄️  Supabase: ${process.env.SUPABASE_URL}`);
  log(`🐙 GitHub: ${process.env.GITHUB_TOKEN ? 'connected' : 'not configured'}`);
  checkSynthiaStatus().then(s => log(`✦ Synthia alive: ${s.alive}`));
});

export { app, broadcast };
