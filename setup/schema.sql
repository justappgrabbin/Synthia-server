-- Synthia OS Database Schema

create table if not exists code_drops (
  id uuid primary key default gen_random_uuid(),
  filename text,
  content_hash text,
  language text,
  ast_json jsonb default '{}',
  gnn_analysis jsonb default '{}',
  detected_capabilities text[] default '{}',
  recommended_mode text,
  confidence float,
  ontological_address text,
  status text default 'analyzed',
  created_at timestamp default now()
);

create table if not exists system_graph (
  id uuid primary key default gen_random_uuid(),
  code_drop_id uuid references code_drops,
  node_name text,
  node_type text,
  ontological_address text unique,
  capabilities text[] default '{}',
  endpoint_path text,
  health_status text default 'healthy',
  permissions_level int default 1,
  created_at timestamp default now()
);

create table if not exists intent_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  raw_intent text,
  gnn_plan jsonb,
  status text default 'pending',
  created_at timestamp default now()
);

create table if not exists governance_decisions (
  id uuid primary key default gen_random_uuid(),
  address text unique,
  actor text,
  action text,
  target text,
  justification text,
  confidence float,
  status text,
  created_at timestamp default now()
);

create table if not exists user_overlays (
  id uuid primary key default gen_random_uuid(),
  user_address text unique,
  overlay_address text unique,
  personal_agents jsonb default '[]',
  created_at timestamp default now()
);

-- Enable Realtime
alter publication supabase_realtime add table code_drops;
alter publication supabase_realtime add table system_graph;
alter publication supabase_realtime add table intent_queue;
alter publication supabase_realtime add table governance_decisions;
alter publication supabase_realtime add table user_overlays;
