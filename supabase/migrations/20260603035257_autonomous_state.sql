-- Vibe autonomous state tables (for shared persistence across backends/surfaces).
-- Mirrors Zod AutonomousSession/Lane/Checkpoint/SelfReview/ResearchStep + Go progress contract.
-- + lane_events for append-only history.
-- Enable RLS + policies; use service_role for daemon, anon/auth for dashboard where appropriate.

-- Sessions (top level autonomous run)
create table if not exists public.autonomous_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  resume_on_restart boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lanes within a session (from AutonomousSession.lanes)
create table if not exists public.lanes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.autonomous_sessions(id) on delete cascade,
  name text not null,
  skills text[] default array[]::text[],
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Checkpoints (durable resume points)
create table if not exists public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.autonomous_sessions(id) on delete cascade,
  name text not null,
  after text,
  contract text,
  resume_strategy text check (resume_strategy in ('last-checkpoint','latest-plan','explicit')) default 'last-checkpoint',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Self reviews (quality steps)
create table if not exists public.self_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.autonomous_sessions(id) on delete cascade,
  perspective text,
  criteria text[] not null default array[]::text[],
  required boolean not null default true,
  created_at timestamptz not null default now()
);

-- Research steps
create table if not exists public.research_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.autonomous_sessions(id) on delete cascade,
  topic text not null,
  depth text check (depth in ('shallow','deep','xhigh')) default 'deep',
  sources text[] default array[]::text[],
  tools text[] default array[]::text[],
  created_at timestamptz not null default now()
);

-- Append-only events (turns, dispatches, checkpoints applied, errors) for audit + dashboard
create table if not exists public.lane_events (
  id bigserial primary key,
  session_id uuid references public.autonomous_sessions(id) on delete cascade,
  lane_id uuid references public.lanes(id) on delete cascade,
  kind text not null, -- e.g. 'checkpoint', 'dispatch', 'self_review', 'research', 'error', 'commit'
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- updated_at trigger for sessions
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_autonomous_sessions_updated_at on public.autonomous_sessions;
create trigger set_autonomous_sessions_updated_at
before update on public.autonomous_sessions
for each row execute function public.set_updated_at();

-- Indexes for common queries (dashboard, resume)
create index if not exists idx_autonomous_sessions_updated on public.autonomous_sessions (updated_at desc);
create index if not exists idx_checkpoints_session on public.checkpoints (session_id, created_at desc);
create index if not exists idx_lane_events_session on public.lane_events (session_id, created_at desc);
create index if not exists idx_lanes_session on public.lanes (session_id);

-- RLS: enable on all; policies for service (daemon) full, authenticated read/write own?, anon limited for public dashboard.
alter table public.autonomous_sessions enable row level security;
alter table public.lanes enable row level security;
alter table public.checkpoints enable row level security;
alter table public.self_reviews enable row level security;
alter table public.research_steps enable row level security;
alter table public.lane_events enable row level security;

-- Service role (go daemon, vercel server) bypasses RLS or full access via key.
-- For anon (public dashboard read): allow select on sessions + recent events/checkpoints.
create policy "anon read autonomous public" on public.autonomous_sessions
  for select to anon using (true);

create policy "anon read lanes" on public.lanes
  for select to anon using (true);

create policy "anon read checkpoints" on public.checkpoints
  for select to anon using (true);

create policy "anon read events" on public.lane_events
  for select to anon using (true);

-- Authenticated users can insert events / checkpoints for sessions (extend later with owner).
create policy "auth insert events" on public.lane_events
  for insert to authenticated with check (true);

create policy "auth insert checkpoints" on public.checkpoints
  for insert to authenticated with check (true);

-- Note: full service access via supabase service_role key (bypasses RLS). Use for resolver dispatch persist.
-- Later: add user_id / org scoping + policies.

comment on table public.autonomous_sessions is 'Top-level durable autonomous agent sessions (cross-backend).';
comment on table public.lane_events is 'Append-only log for autonomous work (checkpoints, dispatches, reviews). Single source for resume + dashboard.';
