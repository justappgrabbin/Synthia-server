/**
 * GAP FILLER ENGINE
 * Scans every artifact for missing pieces:
 * - Missing routes / nav links
 * - Orphaned artifacts (no edges)
 * - Broken asset references
 * - Missing mobile viewport
 * - Missing error boundaries
 * - Missing API connections to Synthia/Supabase
 * - Structural gaps across the graph
 *
 * For each gap found, generates a minimal scaffold that fills it.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase, logGap, createEdge } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface Gap {
  type: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  artifact_id: string;
  artifact_name: string;
  can_autofill: boolean;
  scaffold?: string;
}

// ── STATIC ANALYSIS ─────────────────────────────────────────────────────────

export function analyzeArtifact(artifact: any): Gap[] {
  const gaps: Gap[] = [];
  const html: string = artifact.html || artifact.content || '';
  const id = artifact.id;
  const name = artifact.name;

  // 1. Missing mobile viewport
  if (html && !html.includes('viewport')) {
    gaps.push({
      type: 'missing_viewport',
      description: 'No mobile viewport meta tag — will not render correctly on phones',
      severity: 'critical',
      artifact_id: id, artifact_name: name,
      can_autofill: true,
      scaffold: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`
    });
  }

  // 2. Missing charset
  if (html && !html.includes('charset')) {
    gaps.push({
      type: 'missing_charset',
      description: 'No charset declaration — special characters may break',
      severity: 'warning',
      artifact_id: id, artifact_name: name,
      can_autofill: true,
      scaffold: `<meta charset="UTF-8">`
    });
  }

  // 3. Broken external refs (http:// on https page)
  const httpLinks = html.match(/http:\/\/(?!localhost)[a-z]/g);
  if (httpLinks && httpLinks.length > 0) {
    gaps.push({
      type: 'insecure_resources',
      description: `${httpLinks.length} insecure http:// references — will be blocked on HTTPS`,
      severity: 'warning',
      artifact_id: id, artifact_name: name,
      can_autofill: true,
    });
  }

  // 4. Missing error handling (for apps with fetch)
  if (html.includes('fetch(') && !html.includes('catch(') && !html.includes('.catch')) {
    gaps.push({
      type: 'missing_error_handling',
      description: 'fetch() calls with no .catch() — network errors will be silent',
      severity: 'warning',
      artifact_id: id, artifact_name: name,
      can_autofill: false,
    });
  }

  // 5. Missing Supabase connection (if it references auth/data but has no supabase)
  const needsSupabase = html.includes('user') && html.includes('auth') && !html.includes('supabase');
  if (needsSupabase) {
    gaps.push({
      type: 'missing_supabase',
      description: 'References auth/user data but has no Supabase connection',
      severity: 'info',
      artifact_id: id, artifact_name: name,
      can_autofill: false,
    });
  }

  // 6. Missing Synthia bridge (consciousness apps without Synthia)
  const isConsciousness = html.includes('gate') || html.includes('resonance') || html.includes('consciousness');
  const hasSynthia = html.includes('synthia-server') || html.includes('synthia_server');
  if (isConsciousness && !hasSynthia && html.length > 2000) {
    gaps.push({
      type: 'missing_synthia_bridge',
      description: 'Consciousness-themed app has no Synthia server connection',
      severity: 'info',
      artifact_id: id, artifact_name: name,
      can_autofill: false,
    });
  }

  // 7. No title
  if (html && !html.match(/<title>/i)) {
    gaps.push({
      type: 'missing_title',
      description: 'No <title> tag — shows as blank tab',
      severity: 'info',
      artifact_id: id, artifact_name: name,
      can_autofill: true,
      scaffold: `<title>${name}</title>`
    });
  }

  return gaps;
}

// ── GRAPH-LEVEL GAP ANALYSIS ─────────────────────────────────────────────────

export async function analyzeGraphGaps(): Promise<Gap[]> {
  const gaps: Gap[] = [];

  const { data: artifacts } = await supabase
    .from('pw_artifacts')
    .select('id, name, type, gate, dimension, html, content');

  const { data: edges } = await supabase
    .from('pw_edges')
    .select('from_id, to_id');

  if (!artifacts) return gaps;

  const connectedIds = new Set<string>();
  edges?.forEach(e => { connectedIds.add(e.from_id); connectedIds.add(e.to_id); });

  // Orphaned artifacts
  artifacts.forEach(a => {
    if (!connectedIds.has(a.id) && artifacts.length > 1) {
      gaps.push({
        type: 'orphaned_artifact',
        description: `"${a.name}" has no connections to other artifacts`,
        severity: 'info',
        artifact_id: a.id, artifact_name: a.name,
        can_autofill: false,
      });
    }
  });

  // Gate clusters missing their pair gates
  // In HD, certain gates naturally pair (channels)
  const CHANNELS: [number, number][] = [
    [1,8],[2,14],[3,60],[4,63],[5,15],[6,59],[7,31],[9,52],[10,20],
    [11,56],[12,22],[13,33],[17,62],[18,58],[19,49],[21,45],[23,43],
    [24,61],[25,51],[26,44],[27,28],[29,46],[30,41],[32,54],[34,57],
    [35,36],[37,40],[38,28],[39,55],[42,53],[47,64],[48,16],[50,27],
  ];

  const gateSet = new Set(artifacts.map((a: any) => a.gate));
  CHANNELS.forEach(([g1, g2]) => {
    const has1 = gateSet.has(g1);
    const has2 = gateSet.has(g2);
    if (has1 && !has2) {
      gaps.push({
        type: 'missing_channel_pair',
        description: `Gate ${g1} exists but its channel pair Gate ${g2} is missing — incomplete channel ${g1}-${g2}`,
        severity: 'info',
        artifact_id: artifacts.find((a: any) => a.gate === g1)?.id ?? '',
        artifact_name: `Gate ${g1}`,
        can_autofill: false,
      });
    }
  });

  return gaps;
}

// ── AI-POWERED GAP FILL ──────────────────────────────────────────────────────

export async function fillGapWithAI(
  artifact: any,
  gap: Gap
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const prompt = `You are a gap filler for a consciousness app platform called Paper Worlds.

An artifact called "${gap.artifact_name}" has this gap:
TYPE: ${gap.type}
DESCRIPTION: ${gap.description}
SEVERITY: ${gap.severity}

Here is the current HTML (first 3000 chars):
\`\`\`html
${(artifact.html || artifact.content || '').slice(0, 3000)}
\`\`\`

Generate a MINIMAL fix — only the missing piece, not the whole file.
Return ONLY the HTML/JS/CSS fragment that fills this specific gap.
No explanations. No markdown fences. Just the raw code fragment.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });
    return (msg.content[0] as any).text?.trim() ?? null;
  } catch (e) {
    console.warn('fillGapWithAI error:', e);
    return null;
  }
}

// ── APPLY STATIC GAPS (inject simple fixes directly) ─────────────────────────

export function applyStaticGap(html: string, gap: Gap): string {
  if (!gap.scaffold) return html;

  switch (gap.type) {
    case 'missing_viewport':
      return html.replace('<head>', `<head>\n  ${gap.scaffold}`);
    case 'missing_charset':
      return html.replace('<head>', `<head>\n  ${gap.scaffold}`);
    case 'missing_title':
      return html.replace('</head>', `  ${gap.scaffold}\n</head>`);
    case 'insecure_resources':
      return html.replace(/http:\/\/(?!localhost)/g, 'https://');
    default:
      return html;
  }
}

// ── MAIN ENTRY: run full analysis on one artifact ────────────────────────────

export async function runGapAnalysis(artifact: any): Promise<Gap[]> {
  const staticGaps = analyzeArtifact(artifact);

  // Store gaps in DB
  for (const gap of staticGaps) {
    await logGap(
      artifact.id, gap.type, gap.description, gap.severity,
      gap.scaffold
    );
  }

  // Update artifact gap_status
  await supabase.from('pw_artifacts')
    .update({
      gaps_detected: staticGaps,
      gap_status: staticGaps.some(g => g.severity === 'critical') ? 'critical'
                : staticGaps.length > 0 ? 'has_gaps' : 'clean',
    })
    .eq('id', artifact.id);

  return staticGaps;
}

// ── AUTO-FILL RUNNER ─────────────────────────────────────────────────────────

export async function autoFillArtifact(artifact: any): Promise<string> {
  let html = artifact.html || artifact.content || '';
  const gaps = analyzeArtifact(artifact);

  // Apply all static fixes inline
  for (const gap of gaps) {
    if (gap.can_autofill && gap.scaffold) {
      html = applyStaticGap(html, gap);
    }
  }

  // Update in DB
  await supabase.from('pw_artifacts')
    .update({ html, gaps_filled: gaps.filter(g => g.can_autofill), gap_status: 'filled' })
    .eq('id', artifact.id);

  return html;
}
