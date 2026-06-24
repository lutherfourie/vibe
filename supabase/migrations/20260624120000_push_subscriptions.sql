-- Web Push subscriptions for Vibe loop alerts (PWA + mobile).
-- Stored so the hosted dashboard / Grok chat can wake the phone or desktop PWA
-- when the Windows daemon starts work, completes, errors, or updates.

create table if not exists public.push_subscriptions (
  id bigserial primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  session_id uuid references public.autonomous_sessions(id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subs_session on public.push_subscriptions (session_id);

alter table public.push_subscriptions enable row level security;

-- Allow anon inserts (from PWA in browser) and reads for management; tighten later if desired.
drop policy if exists "anon manage push subs" on public.push_subscriptions;
create policy "anon manage push subs" on public.push_subscriptions
  for all to anon using (true) with check (true);

-- Realtime not strictly needed for this table.
comment on table public.push_subscriptions is 'Browser push subscriptions (web-push / VAPID) for loop status notifications from daemon events.';
