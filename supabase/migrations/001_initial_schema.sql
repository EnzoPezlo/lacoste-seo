-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- Table: keywords
-- ============================================================
create table keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text unique not null,
  category text not null,
  countries text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Table: runs
-- ============================================================
create table runs (
  id uuid primary key default gen_random_uuid(),
  run_label text unique not null,
  type text not null check (type in ('auto', 'manual')),
  status text not null default 'pending'
    check (status in ('pending', 'serp_done', 'scrap_done', 'analysis_done', 'completed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ============================================================
-- Table: serp_results
-- ============================================================
create table serp_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  keyword_id uuid not null references keywords(id) on delete cascade,
  country text not null,
  device text not null check (device in ('desktop', 'mobile')),
  position integer not null check (position between 1 and 20),
  url text not null,
  domain text not null,
  title text,
  snippet text,
  is_lacoste boolean not null default false,
  actor_name text,
  actor_category text,
  page_type text,
  serp_status text not null default 'ok' check (serp_status in ('ok', 'error')),
  scrap_status text not null default 'pending' check (scrap_status in ('pending', 'ok', 'error'))
);

create index idx_serp_results_run on serp_results(run_id);
create index idx_serp_results_keyword on serp_results(keyword_id);
create index idx_serp_results_lookup on serp_results(run_id, keyword_id, country, device);

-- ============================================================
-- Table: snapshots
-- ============================================================
create table snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  url text not null,
  markdown_content text,
  head_html text,
  structured_data jsonb,
  status text not null default 'ok' check (status in ('ok', 'error')),
  created_at timestamptz not null default now(),
  unique (run_id, url)
);

create index idx_snapshots_run_url on snapshots(run_id, url);

-- ============================================================
-- Table: analyses
-- ============================================================
create table analyses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  keyword_id uuid not null references keywords(id) on delete cascade,
  country text not null,
  device text not null,
  analysis_type text not null check (analysis_type in ('lacoste_gap', 'position_movement')),
  actor text,
  content text,
  tags text[] default '{}',
  lacoste_position integer,
  position_before integer,       -- NULL = "NR" (new entrant)
  position_after integer,
  variation integer,
  movement_type text,
  search_intent text,
  created_at timestamptz not null default now()
);

create index idx_analyses_run on analyses(run_id);
create index idx_analyses_type on analyses(run_id, analysis_type);

-- ============================================================
-- Table: run_logs (monitoring)
-- ============================================================
create table run_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  step text not null,
  status text not null check (status in ('running', 'done', 'error')),
  message text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index idx_run_logs_run on run_logs(run_id);

-- Enable realtime for monitoring
alter publication supabase_realtime add table run_logs;
alter publication supabase_realtime add table runs;
