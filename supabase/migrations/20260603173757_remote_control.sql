-- Remote control plane for autonomous Vibe agents via Supabase.
-- Allows external operators (Grok, Claude, Codex, etc.) to send commands
-- to running autonomous sessions/agents.
-- Commands are processed by the Go autonomous runner(s).
-- Responses and events provide feedback/monitoring.
-- Mirrors/extends the autonomous_state tables.
-- RLS: anon limited reads for dashboards; service_role for runner + API writes.

create table if not exists public.agent_commands (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.autonomous_sessions(id) on delete cascade,
  command text not null, -- 'launch', 'pause', 'resume', 'instruct', 'checkpoint', 'self-review', 'stop', 'status'
  payload jsonb not null default '{}'::jsonb, -- e.g. { "instruction": "...", "lane": "main" }
  issued_by text not null, -- 'grok', 'claude', 'codex', 'user', 'system'
  status text not null default 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.agent_responses (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references public.agent_commands(id) on delete cascade,
  session_id uuid references public.autonomous_sessions(id) on delete cascade,
  status text not null, -- 'ok', 'error'
  result jsonb not null default '{}'::jsonb,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_events (
  id bigserial primary key,
  session_id uuid references public.autonomous_sessions(id) on delete cascade,
  command_id uuid references public.agent_commands(id) on delete set null,
  kind text not null, -- 'command_received', 'command_executed', 'status', 'progress', 'error', 'instruction_received'
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_agent_commands_session_status on public.agent_commands (session_id, status, created_at desc);
create index if not exists idx_agent_commands_pending on public.agent_commands (status, created_at) where status = 'pending';
create index if not exists idx_agent_responses_command on public.agent_responses (command_id, created_at desc);
create index if not exists idx_agent_events_session on public.agent_events (session_id, created_at desc);

-- updated_at for commands (optional, but useful)
DROP TRIGGER IF EXISTS set_agent_commands_updated_at ON public.agent_commands;
CREATE TRIGGER set_agent_commands_updated_at
BEFORE UPDATE ON public.agent_commands
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
alter table public.agent_commands enable row level security;
alter table public.agent_responses enable row level security;
alter table public.agent_events enable row level security;

-- Anon (public dashboards, external viewers): read only
DROP POLICY IF EXISTS "anon read agent_commands" ON public.agent_commands;
create policy "anon read agent_commands" on public.agent_commands
  for select to anon using (true);

DROP POLICY IF EXISTS "anon read agent_responses" ON public.agent_responses;
create policy "anon read agent_responses" on public.agent_responses
  for select to anon using (true);

DROP POLICY IF EXISTS "anon read agent_events" ON public.agent_events;
create policy "anon read agent_events" on public.agent_events
  for select to anon using (true);

-- Allow anon to insert commands? For simplicity in remote (e.g. Grok calling public API that proxies), but better through API.
-- For now, allow inserts from anon/auth for demo/remote ease; in prod tighten with JWT claims.
DROP POLICY IF EXISTS "anon insert commands" ON public.agent_commands;
create policy "anon insert commands" on public.agent_commands
  for insert to anon with check (true);

DROP POLICY IF EXISTS "auth insert commands" ON public.agent_commands;
create policy "auth insert commands" on public.agent_commands
  for insert to authenticated with check (true);

-- Service role (Go runner, web server API routes) get full via key (bypasses RLS).
-- Go runner will poll/update with service key.
-- API routes in Next will use service key for writes.

-- Realtime: add to publication so dashboards and external can subscribe to changes.
-- (Assumes supabase_realtime publication exists as in prior migration.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_commands'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_commands;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_responses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_responses;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_events;
  END IF;
END $$;

comment on table public.agent_commands is 'Remote commands sent to autonomous agents (from Grok/Claude/Codex/etc via API). Polled/processed by Go runner.';
comment on table public.agent_responses is 'Responses/results from the autonomous runner back to the command issuer.';
comment on table public.agent_events is 'Real-time events from agents for monitoring (status, progress, logs).';