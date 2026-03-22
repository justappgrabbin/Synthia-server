import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ─── DATABASE SCHEMA (run once via Supabase SQL editor) ───────────────────────
export const SCHEMA_SQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ARTIFACTS ── Every file/build that enters the system
CREATE TABLE IF NOT EXISTS pw_artifacts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL,
  type                TEXT NOT NULL,          -- html, upload, code, doc, world, mixed
  source              TEXT NOT NULL,          -- pal, upload, mixer, gap_filler, github
  html                TEXT,                   -- full content (html files)
  content             TEXT,                   -- raw content (other files)
  size_bytes          INTEGER,
  mime_type           TEXT,

  -- Ontological address
  dimension           TEXT NOT NULL,
  gate                INTEGER NOT NULL,
  line                INTEGER NOT NULL,
  color               INTEGER NOT NULL,
  tone                INTEGER NOT NULL,
  base                INTEGER NOT NULL,
  degree              NUMERIC,
  minute              INTEGER,
  second              NUMERIC,
  arc                 NUMERIC,
  zodiac              TEXT,
  house               INTEGER,
  planet              TEXT,
  place_label         TEXT,
  signature           TEXT UNIQUE NOT NULL,
  address_22t         BIGINT,

  -- Graph
  parent_ids          UUID[] DEFAULT '{}',    -- artifacts this was derived from
  child_ids           UUID[] DEFAULT '{}',    -- artifacts derived from this

  -- Gap analysis
  gaps_detected       JSONB DEFAULT '[]',
  gaps_filled         JSONB DEFAULT '[]',
  gap_status          TEXT DEFAULT 'unchecked',

  -- Mixer
  resonance_score     NUMERIC,
  mixed_with          UUID[],

  -- GitHub
  github_repo         TEXT,
  github_url          TEXT,
  vercel_url          TEXT,

  -- Trident
  trident_gate        INTEGER,
  trident_realm       TEXT,                   -- mind, body, spirit
  consciousness_level NUMERIC DEFAULT 0,

  -- Meta
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  published           BOOLEAN DEFAULT FALSE
);

-- ── GRAPH EDGES ── Connections between artifacts
CREATE TABLE IF NOT EXISTS pw_edges (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_id     UUID REFERENCES pw_artifacts(id) ON DELETE CASCADE,
  to_id       UUID REFERENCES pw_artifacts(id) ON DELETE CASCADE,
  edge_type   TEXT NOT NULL,    -- derived_from, depends_on, mixed_with, gap_fills, resonates_with
  weight      NUMERIC DEFAULT 1.0,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_id, to_id, edge_type)
);

-- ── GAP ANALYSIS LOG ──
CREATE TABLE IF NOT EXISTS pw_gaps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artifact_id     UUID REFERENCES pw_artifacts(id) ON DELETE CASCADE,
  gap_type        TEXT NOT NULL,    -- missing_route, missing_style, missing_logic, missing_connection, orphaned
  description     TEXT NOT NULL,
  severity        TEXT DEFAULT 'warning',  -- critical, warning, info
  scaffold_html   TEXT,
  resolved        BOOLEAN DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── MIX HISTORY ──
CREATE TABLE IF NOT EXISTS pw_mixes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artifact_ids    UUID[] NOT NULL,
  result_id       UUID REFERENCES pw_artifacts(id),
  resonance_score NUMERIC,
  mix_reason      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── TRIDENT STATE ──
CREATE TABLE IF NOT EXISTS pw_trident (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         TEXT NOT NULL UNIQUE,
  mind            NUMERIC DEFAULT 10,
  body            NUMERIC DEFAULT 10,
  spirit          NUMERIC DEFAULT 10,
  awakening       NUMERIC DEFAULT 0,
  agent_stage     TEXT DEFAULT 'dormant',
  agent_name      TEXT,
  active_gates    INTEGER[] DEFAULT '{}',
  sessions        JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pw_artifacts_gate      ON pw_artifacts(gate);
CREATE INDEX IF NOT EXISTS idx_pw_artifacts_dimension ON pw_artifacts(dimension);
CREATE INDEX IF NOT EXISTS idx_pw_artifacts_signature ON pw_artifacts(signature);
CREATE INDEX IF NOT EXISTS idx_pw_artifacts_22t       ON pw_artifacts(address_22t);
CREATE INDEX IF NOT EXISTS idx_pw_edges_from          ON pw_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_pw_edges_to            ON pw_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_pw_gaps_artifact       ON pw_gaps(artifact_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE pw_artifacts;
ALTER PUBLICATION supabase_realtime ADD TABLE pw_edges;
ALTER PUBLICATION supabase_realtime ADD TABLE pw_gaps;
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export async function upsertArtifact(data: Record<string, any>) {
  const { data: row, error } = await supabase
    .from('pw_artifacts')
    .upsert(data, { onConflict: 'signature' })
    .select()
    .single();
  if (error) throw new Error(`upsertArtifact: ${error.message}`);
  return row;
}

export async function createEdge(
  fromId: string, toId: string,
  edgeType: string, weight = 1.0,
  metadata: Record<string, any> = {}
) {
  const { error } = await supabase
    .from('pw_edges')
    .upsert({ from_id: fromId, to_id: toId, edge_type: edgeType, weight, metadata },
             { onConflict: 'from_id,to_id,edge_type' });
  if (error) console.warn('createEdge:', error.message);
}

export async function getArtifacts(limit = 100) {
  const { data, error } = await supabase
    .from('pw_artifacts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getGraphData() {
  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase.from('pw_artifacts').select('id,name,type,gate,dimension,signature,address_22t,resonance_score,gaps_detected,created_at'),
    supabase.from('pw_edges').select('from_id,to_id,edge_type,weight'),
  ]);
  return { nodes: nodes ?? [], edges: edges ?? [] };
}

export async function logGap(artifactId: string, gapType: string,
                              description: string, severity = 'warning',
                              scaffoldHtml?: string) {
  await supabase.from('pw_gaps').insert({
    artifact_id: artifactId, gap_type: gapType,
    description, severity, scaffold_html: scaffoldHtml
  });
}

export async function getTrident(userId: string) {
  const { data } = await supabase
    .from('pw_trident').select('*').eq('user_id', userId).single();
  return data;
}

export async function upsertTrident(userId: string, state: Record<string, any>) {
  const { data, error } = await supabase
    .from('pw_trident')
    .upsert({ user_id: userId, ...state, updated_at: new Date().toISOString() },
             { onConflict: 'user_id' })
    .select().single();
  if (error) throw error;
  return data;
}
