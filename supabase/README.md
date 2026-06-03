# Vibe — Supabase

Supabase project for Vibe (`project_id = "vibe"`). `config.toml` is
version-controlled; local working state (`.temp`, `.branches`, `.env`) is
gitignored.

- **Hosted project:** `vibe` — ref `gknrdzkdgmuozhtaonst`, region `eu-west-2`,
  org `lutherfourie's Org` (`yvqutoqvuzwueqcuhesb`). $10/mo.
  Dashboard: <https://supabase.com/dashboard/project/gknrdzkdgmuozhtaonst>
- **Local stack:** runs on the **544xx** port range (see below) so it coexists
  with other local Supabase projects (e.g. `cockpit`).

The unrelated **cockpit** hosted project (`vipejmtmnqahjbwyezdj`) is a separate
app and is not linked from here.

## Prerequisites

- Docker (the local stack runs in containers). Verified available on this machine.
- Supabase CLI (`supabase --version`).

## Everyday commands

```bash
supabase start            # boot the local stack (Postgres, Studio, Auth, Storage, …)
supabase status           # show local URLs + keys (API :54421, DB :54422, Studio :54423)
supabase stop             # stop the stack (use `--no-backup` to drop local data)

supabase migration new <name>   # create supabase/migrations/<ts>_<name>.sql
supabase db reset               # re-apply all migrations + seed.sql to the local DB
supabase db diff -f <name>      # capture schema changes you made via Studio/SQL into a migration
```

Studio runs at <http://localhost:54423> once `supabase start` is up.

Vibe uses the **544xx** port range (api 54421, db 54422, studio 54423, inbucket
54424, analytics 54427, pooler 54429) so its local stack coexists with other
local Supabase projects on the default 543xx range (e.g. `cockpit`).

## Making schema changes (workflow)

1. Iterate with `execute_sql` (MCP) or `psql` against the local DB — do **not**
   use `apply_migration` for local iteration (it writes history on every call).
2. When happy, capture it: `supabase db diff -f <name>` (or hand-write a file via
   `supabase migration new <name>`).
3. `supabase db reset` to verify migrations + seed apply cleanly from scratch.
4. Enable RLS on every table in an exposed schema (`public`) and add policies
   that match the real access model. Views: `WITH (security_invoker = true)`.

## Hosted project (created, billed)

The hosted `vibe` project already exists (ref `gknrdzkdgmuozhtaonst`). To work
against it from this repo:

```bash
supabase link --project-ref gknrdzkdgmuozhtaonst   # enter the DB password when asked
supabase db push                                   # apply local migrations to the hosted DB
supabase db pull                                   # or import the hosted schema as a migration
```

The DB password is set during project creation; reset it anytime in the
dashboard (Settings → Database) if you don't have it.

## Next steps (schema is intentionally empty)

Vibe has no committed schema yet. The natural first use, if/when wanted, is to
let the Go daemon (`go/`, `vibe serve` + the `go/agent` SDK) **persist agent
sessions, turns, and events** instead of holding them in memory — mirroring how
the `cockpit` project stores `cockpit_sessions` / `cockpit_chat_messages` /
`cockpit_assistant_events`. Define that with a first migration when the
daemon-side integration is on the table.
