/**
 * SYNTHIA BRIDGE — Fixed Version
 * Connects Paper Worlds backend to Synthia Python server
 * 
 * Changes from original:
 * - Paths now match Python server: /api/consciousness/* (with /api prefix)
 * - Added fallback to /consciousness/* if /api prefix fails
 * - Added retry logic with exponential backoff
 * - Added health check with detailed status
 */

import dotenv from 'dotenv';
dotenv.config();

const SYNTHIA = process.env.SYNTHIA_URL ?? 'https://synthia-server.onrender.com';
const TIMEOUT_POST = parseInt(process.env.SYNTHIA_TIMEOUT_POST ?? '8000', 10);
const TIMEOUT_GET = parseInt(process.env.SYNTHIA_TIMEOUT_GET ?? '5000', 10);
const MAX_RETRIES = parseInt(process.env.SYNTHIA_MAX_RETRIES ?? '2', 10);

// Track last known status for graceful degradation
let _lastKnownStatus: any = null;
let _statusTimestamp = 0;

async function synthiaPost(path: string, body: any, attempt = 0): Promise<any> {
  try {
    const res = await fetch(`${SYNTHIA}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_POST),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  } catch (e: any) {
    if (attempt < MAX_RETRIES && e.message?.includes('fetch')) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      return synthiaPost(path, body, attempt + 1);
    }
    console.warn(`[Synthia bridge] POST ${path} failed:`, e.message);
    return null;
  }
}

async function synthiaGet(path: string, attempt = 0): Promise<any> {
  try {
    const res = await fetch(`${SYNTHIA}${path}`, { 
      signal: AbortSignal.timeout(TIMEOUT_GET) 
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch (e: any) {
    if (attempt < MAX_RETRIES && e.message?.includes('fetch')) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      return synthiaGet(path, attempt + 1);
    }
    console.warn(`[Synthia bridge] GET ${path} failed:`, e.message);
    return null;
  }
}

// Try /api/consciousness first, fallback to /consciousness
async function consciousnessGet(path: string): Promise<any> {
  // Try with /api prefix first
  let data = await synthiaGet(`/api/consciousness${path}`);
  if (data !== null) return data;

  // Fallback to without /api prefix
  data = await synthiaGet(`/consciousness${path}`);
  return data;
}

async function consciousnessPost(path: string, body: any): Promise<any> {
  // Try with /api prefix first
  let data = await synthiaPost(`/api/consciousness${path}`, body);
  if (data !== null) return data;

  // Fallback to without /api prefix
  data = await synthiaPost(`/consciousness${path}`, body);
  return data;
}

// ── STATUS ─────────────────────────────────────────────────────────────────

export async function checkSynthiaStatus(): Promise<{ alive: boolean; data?: any }> {
  const now = Date.now();

  // Use cached status if < 30 seconds old
  if (_lastKnownStatus && (now - _statusTimestamp) < 30000) {
    return { alive: true, data: _lastKnownStatus };
  }

  const data = await consciousnessGet('/status');
  if (data !== null) {
    _lastKnownStatus = data;
    _statusTimestamp = now;
  }
  return { alive: data !== null, data };
}

// ── PERCEPTION ─────────────────────────────────────────────────────────────

export async function notifyArtifactCreated(artifact: any): Promise<void> {
  await consciousnessPost('/perceive', {
    type:      'artifact_created',
    source:    'paper_worlds',
    artifact: {
      id:          artifact.id,
      name:        artifact.name,
      gate:        artifact.gate,
      dimension:   artifact.dimension,
      address_22t: artifact.address_22t,
      signature:   artifact.signature,
      type:        artifact.type,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function notifyMixComplete(mixResult: any): Promise<void> {
  await consciousnessPost('/perceive', {
    type:      'artifacts_mixed',
    source:    'paper_worlds_mixer',
    result: {
      name:            mixResult.artifact?.name,
      resonance_score: mixResult.resonanceScore,
      address_22t:     mixResult.artifact?.address_22t,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function notifyGapFilled(artifactId: string, gaps: any[]): Promise<void> {
  await consciousnessPost('/perceive', {
    type:        'gaps_filled',
    source:      'paper_worlds_gap_filler',
    artifact_id: artifactId,
    gaps_count:  gaps.length,
    gap_types:   gaps.map(g => g.type),
    timestamp:   new Date().toISOString(),
  });
}

// ── GUIDANCE ─────────────────────────────────────────────────────────────────

export async function requestSynthiaGuidance(context: any): Promise<string | null> {
  const result = await consciousnessPost('/guide', { context });
  return result?.message ?? result?.guidance ?? null;
}

// ── TRIDENT SYNC ────────────────────────────────────────────────────────────

export async function syncTridentToSynthia(trident: any): Promise<void> {
  await consciousnessPost('/sync', {
    source:  'paper_worlds_trident',
    trident: {
      mind:         trident.mind,
      body:         trident.body,
      spirit:       trident.spirit,
      awakening:    trident.awakening,
      agent_stage:  trident.agent_stage,
      active_gates: trident.active_gates,
    },
    timestamp: new Date().toISOString(),
  });
}

// ── DIRECT TRIDENT API (bypass consciousness layer) ─────────────────────────

export async function tridentGenerate(prompt: string, options: any = {}): Promise<any> {
  return synthiaPost('/trident/generate', {
    prompt,
    head: options.head || null,
    max_tokens: options.maxTokens || 64,
    temperature: options.temperature || 0.8,
    rag_query: options.ragQuery || null,
  });
}

export async function tridentRouter(query: string): Promise<any> {
  return synthiaPost('/trident/router', { query });
}

export async function tridentRagAdd(text: string, headTag: string = 'any'): Promise<any> {
  return synthiaPost('/trident/rag/add', { text, head_tag: headTag });
}

export async function tridentRagSearch(query: string, topK: number = 3, headTag?: string): Promise<any> {
  return synthiaPost('/trident/rag/search', { query, top_k: topK, head_tag: headTag });
}

// ── CONSCIOUSNESS DIRECT API ────────────────────────────────────────────────

export async function consciousnessProfile(birthDate: string, birthTime: string, location: string = 'EARTH'): Promise<any> {
  return synthiaPost('/consciousness/profile', { birth_date: birthDate, birth_time: birthTime, location });
}

export async function consciousnessChart(birthDate: string, birthTime: string, location: string = 'EARTH'): Promise<any> {
  return synthiaPost('/consciousness/chart', { birth_date: birthDate, birth_time: birthTime, location });
}

export async function consciousnessWave(): Promise<any> {
  return synthiaGet('/consciousness/wave');
}

export async function consciousnessCoherence(addresses: string[]): Promise<any> {
  return synthiaPost('/consciousness/coherence', { addresses });
}

export async function consciousnessGate(gateNumber: number): Promise<any> {
  return synthiaGet(`/consciousness/gate/${gateNumber}`);
}

export async function consciousnessChannels(): Promise<any> {
  return synthiaGet('/consciousness/channels');
}
