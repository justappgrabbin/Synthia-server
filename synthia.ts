/**
 * SYNTHIA BRIDGE
 * Connects Paper Worlds backend to your existing Synthia server
 * so consciousness state, artifact events, and Trident data flow between them.
 */

import dotenv from 'dotenv';
dotenv.config();

const SYNTHIA = process.env.SYNTHIA_URL ?? 'https://synthia-server.onrender.com';

async function synthiaPost(path: string, body: any): Promise<any> {
  try {
    const res = await fetch(`${SYNTHIA}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  } catch (e: any) {
    console.warn(`[Synthia bridge] ${path} failed:`, e.message);
    return null;
  }
}

async function synthiaGet(path: string): Promise<any> {
  try {
    const res = await fetch(`${SYNTHIA}${path}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch (e: any) {
    console.warn(`[Synthia bridge] GET ${path} failed:`, e.message);
    return null;
  }
}

export async function checkSynthiaStatus(): Promise<{ alive: boolean; data?: any }> {
  const data = await synthiaGet('/api/consciousness/status');
  return { alive: data !== null, data };
}

export async function notifyArtifactCreated(artifact: any): Promise<void> {
  await synthiaPost('/api/consciousness/perceive', {
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
  await synthiaPost('/api/consciousness/perceive', {
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
  await synthiaPost('/api/consciousness/perceive', {
    type:        'gaps_filled',
    source:      'paper_worlds_gap_filler',
    artifact_id: artifactId,
    gaps_count:  gaps.length,
    gap_types:   gaps.map(g => g.type),
    timestamp:   new Date().toISOString(),
  });
}

export async function requestSynthiaGuidance(context: any): Promise<string | null> {
  const result = await synthiaPost('/api/consciousness/guide', { context });
  return result?.message ?? result?.guidance ?? null;
}

export async function syncTridentToSynthia(trident: any): Promise<void> {
  await synthiaPost('/api/consciousness/sync', {
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
