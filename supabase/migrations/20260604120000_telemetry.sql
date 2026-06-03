-- Telemetry for Vibe autonomous usage, provider choices, remote commands, errors, infra syncs, etc.
-- Hosted on the same Supabase instance as the rest of the control plane (best fit: reuses existing Go client,
-- web client, RLS model, realtime publication, no new billing/infra/auth surface).
-- Opt-in via VIBE_TELEMETRY=1 (or equivalent in autonomous plans later).
-- Privacy: payloads should avoid PII; session_id links to existing autonomous_sessions for correlation only.
-- Anon can insert (for easy emission from public surfaces) + read (for dashboard); service for full access.
-- Realtime enabled so dashboards can live-subscribe to new telemetry.

create table if not exists public.telemetry_events (
  id bigserial primary key,
  session_id uuid references public.autonomous_sessions(id) on delete set null,
  kind text not null,  -- 'session_launched', 'plan_resolved', 'provider_used', 'remote_command_processed', 'infra_sync_executed', 'resource_decision', 'error', 'cli_command', 'turn_completed'
  source text not null default 'unknown', -- 'go', 'web', 'cli', 'resolver', 'dashboard'
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for common queries (per session, per kind, time range)
create index if not exists idx_telemetry_events_session on public.telemetry_events (session_id, created_at desc);
create index if not exists idx_telemetry_events_kind on public.telemetry_events (kind, created_at desc);
create index if not exists idx_telemetry_events_created on public.telemetry_events (created_at desc);

-- RLS
alter table public.telemetry_events enable row level security;

-- Anon: read for dashboards / external viewers; insert for emission (from API or direct in future)
DROP POLICY IF EXISTS "anon read telemetry_events" ON public.telemetry_events;
create policy "anon read telemetry_events" on public.telemetry_events
  for select to anon using (true);

DROP POLICY IF EXISTS "anon insert telemetry_events" ON public.telemetry_events;
create policy "anon insert telemetry_events" on public.telemetry_events
  for insert to anon with check (true);

-- Authenticated users can also insert (for future authenticated surfaces)
DROP POLICY IF EXISTS "auth insert telemetry_events" ON public.telemetry_events;
create policy "auth insert telemetry_events" on public.telemetry_events
  for insert to authenticated with check (true);

-- Service role (Go runners, web API routes using service key) bypass RLS automatically.

-- Add to realtime publication so dashboards can subscribe live (like agent_events)
-- (Assumes supabase_realtime publication exists as in prior migrations.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'telemetry_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_events;
  END IF;
END
$$;
