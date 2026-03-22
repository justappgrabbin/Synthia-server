/**
 * MIXER ENGINE
 * Automatically detects artifacts that share gates/patterns/themes
 * and blends them into a new seamless app with its own address.
 *
 * Trigger: any new artifact upload → scan all others → if resonance > threshold → mix
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase, upsertArtifact, createEdge } from './db.js';
import { resonance, createAddress } from './address.js';
import { runGapAnalysis } from './gapFiller.js';
import dotenv from 'dotenv';
dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RESONANCE_THRESHOLD = 0.65;
const MAX_AUTO_MIX = 3; // max mixes triggered per upload

export interface MixResult {
  mixed: boolean;
  reason: string;
  artifact?: any;
  resonanceScore?: number;
}

// ── FIND RESONANT PAIRS ───────────────────────────────────────────────────────

export async function findResonantPairs(newArtifact: any): Promise<any[]> {
  const { data: others } = await supabase
    .from('pw_artifacts')
    .select('*')
    .neq('id', newArtifact.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!others?.length) return [];

  const scored = others.map(other => ({
    artifact: other,
    score: resonance(newArtifact, other)
  }));

  return scored
    .filter(s => s.score >= RESONANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_AUTO_MIX)
    .map(s => ({ ...s.artifact, _resonanceScore: s.score }));
}

// ── CONTENT FINGERPRINTING ────────────────────────────────────────────────────

function extractPatterns(html: string): string[] {
  const patterns: string[] = [];
  const content = html.toLowerCase();

  // Consciousness themes
  if (content.includes('gate') || content.includes('resonance')) patterns.push('consciousness');
  if (content.includes('animate') || content.includes('canvas')) patterns.push('animation');
  if (content.includes('three') || content.includes('webgl')) patterns.push('3d');
  if (content.includes('fetch') || content.includes('api')) patterns.push('data');
  if (content.includes('supabase')) patterns.push('supabase');
  if (content.includes('chart') || content.includes('graph')) patterns.push('visualization');
  if (content.includes('form') || content.includes('input')) patterns.push('interactive');
  if (content.includes('agent') || content.includes('cynthia')) patterns.push('agents');
  if (content.includes('trident') || content.includes('realm')) patterns.push('trident');
  if (content.includes('tailwind') || content.includes('class=')) patterns.push('tailwind');
  if (content.includes('typescript') || content.includes('interface ')) patterns.push('typescript');

  return patterns;
}

// ── THE ACTUAL MIX ────────────────────────────────────────────────────────────

export async function mixArtifacts(
  a: any,
  b: any,
  resonanceScore: number
): Promise<MixResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { mixed: false, reason: 'No Anthropic API key' };
  }

  const patternsA = extractPatterns(a.html || a.content || '');
  const patternsB = extractPatterns(b.html || b.content || '');
  const sharedPatterns = patternsA.filter(p => patternsB.includes(p));
  const mixReason = `Resonance ${(resonanceScore * 100).toFixed(0)}% · Gate ${a.gate}↔${b.gate} · Shared: ${sharedPatterns.join(', ') || 'dimensional proximity'}`;

  console.log(`🔀 Mixing "${a.name}" + "${b.name}" — ${mixReason}`);

  const contentA = (a.html || a.content || '').slice(0, 4000);
  const contentB = (b.html || b.content || '').slice(0, 4000);

  const prompt = `You are the Paper Worlds Mixer. Two consciousness artifacts have been detected as resonant and should be seamlessly woven together.

ARTIFACT A: "${a.name}" (Gate ${a.gate}, ${a.dimension})
\`\`\`
${contentA}
\`\`\`

ARTIFACT B: "${b.name}" (Gate ${b.gate}, ${b.dimension})
\`\`\`
${contentB}
\`\`\`

RESONANCE: ${(resonanceScore * 100).toFixed(0)}%
SHARED PATTERNS: ${sharedPatterns.join(', ') || 'dimensional proximity'}
GATE A: ${a.gate} · GATE B: ${b.gate}

Create a SEAMLESS unified app that:
1. Preserves the best functionality of both artifacts
2. Combines their visual styles into one coherent aesthetic (dark, consciousness-themed, mobile-first)
3. Gives the result a unique combined identity
4. Uses the YOU-N-I-VERSE aesthetic: #070b18 bg, #7affef cyan, #a855f7 violet, #f59e0b amber
5. Is completely self-contained HTML
6. Has the mixed gate energy (Gate ${a.gate} + Gate ${b.gate}) expressed in the design

Return ONLY a complete self-contained HTML file. No explanations. No markdown fences.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    const mixedHtml = (msg.content[0] as any).text?.trim() ?? '';
    if (!mixedHtml || mixedHtml.length < 200) {
      return { mixed: false, reason: 'Mixer returned empty content' };
    }

    // Create address for the mixed artifact
    const mixedName = `${a.name} ✕ ${b.name}`;
    const addr = createAddress(mixedName, mixedHtml, 'mixed', 'Paper Worlds Mixer');

    // Store in Supabase
    const mixedArtifact = await upsertArtifact({
      name: mixedName,
      type: 'mixed',
      source: 'mixer',
      html: mixedHtml,
      size_bytes: mixedHtml.length,
      mime_type: 'text/html',
      parent_ids: [a.id, b.id],
      mixed_with: [a.id, b.id],
      resonance_score: resonanceScore,
      ...addr,
    });

    // Create graph edges
    await Promise.all([
      createEdge(a.id, mixedArtifact.id, 'mixed_with', resonanceScore, { mix_reason: mixReason }),
      createEdge(b.id, mixedArtifact.id, 'mixed_with', resonanceScore, { mix_reason: mixReason }),
    ]);

    // Log the mix
    await supabase.from('pw_mixes').insert({
      artifact_ids: [a.id, b.id],
      result_id: mixedArtifact.id,
      resonance_score: resonanceScore,
      mix_reason: mixReason,
    });

    // Run gap analysis on the mix
    await runGapAnalysis(mixedArtifact);

    return {
      mixed: true,
      reason: mixReason,
      artifact: mixedArtifact,
      resonanceScore,
    };
  } catch (e: any) {
    console.error('mixArtifacts error:', e.message);
    return { mixed: false, reason: e.message };
  }
}

// ── MAIN ENTRY: check new upload for mix opportunities ────────────────────────

export async function checkAndMix(newArtifact: any): Promise<MixResult[]> {
  const pairs = await findResonantPairs(newArtifact);
  if (!pairs.length) return [];

  const results: MixResult[] = [];
  for (const partner of pairs) {
    // Check if this pair was already mixed
    const { data: existing } = await supabase
      .from('pw_mixes')
      .select('id')
      .contains('artifact_ids', [newArtifact.id, partner.id])
      .limit(1);

    if (existing?.length) continue; // already mixed

    const result = await mixArtifacts(newArtifact, partner, partner._resonanceScore);
    results.push(result);
  }

  return results;
}
