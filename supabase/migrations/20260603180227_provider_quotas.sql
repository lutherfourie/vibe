-- provider_quotas for tracking token/credit usage across providers for resource-aware dispatching.
-- Allows estimating costs and choosing economical providers (Claude, Codex, Grok, Cerebras, big-AGI).
create table if not exists public.provider_quotas (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique, -- 'claude', 'codex', 'grok', 'cerebras', 'big-agi'
  remaining numeric(18,2) not null default 0, -- tokens or credits remaining
  total_quota numeric(18,2), -- original quota if known
  cost_per_million numeric(10,4), -- USD per million tokens
  reset_at timestamptz, -- when quota resets
  priority int not null default 0, -- lower = preferred for tie breaks
  metadata jsonb not null default '{}'::jsonb,
  last_updated timestamptz not null default now()
);

create index if not exists idx_provider_quotas_provider on public.provider_quotas (provider);

-- RLS
alter table public.provider_quotas enable row level security;

create policy "anon read quotas" on public.provider_quotas
  for select to anon using (true);

-- service role full access for dispatcher updates.

comment on table public.provider_quotas is 'Tracks quotas and costs for smart multi-provider delegation in autonomous work.';
