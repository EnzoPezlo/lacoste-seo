-- Enable RLS on all tables
alter table keywords enable row level security;
alter table runs enable row level security;
alter table serp_results enable row level security;
alter table snapshots enable row level security;
alter table analyses enable row level security;
alter table run_logs enable row level security;

-- Anon role: read-only access to all tables
create policy "anon_read_keywords" on keywords for select to anon using (true);
create policy "anon_read_runs" on runs for select to anon using (true);
create policy "anon_read_serp_results" on serp_results for select to anon using (true);
create policy "anon_read_snapshots" on snapshots for select to anon using (true);
create policy "anon_read_analyses" on analyses for select to anon using (true);
create policy "anon_read_run_logs" on run_logs for select to anon using (true);

-- Service role bypasses RLS automatically — no policies needed.
-- The pipeline (GitHub Actions) uses the service_role key.
