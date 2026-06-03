# Vibe — Local Supabase

Local Supabase project for Vibe (`project_id = "vibe"`). This is a **local-only**
setup: there is no hosted/billed Supabase project for Vibe yet — the hosted
project ($10/mo) was intentionally skipped. `config.toml` is version-controlled;
local working state (`.temp`, `.branches`, `.env`) is gitignored.

The unrelated **cockpit** hosted project (`vipejmtmnqahjbwyezdj`) is a separate
app and is not linked from here.

## Prerequisites

- Docker (the local stack runs in containers). Verified available on this machine.
- Supabase CLI (`supabase --version`).

## Everyday commands

```bash
supabase start            # boot the local stack (Postgres, Studio, Auth, Storage, …)
supabase status           # show local URLs + keys (API :54321, DB :54322, Studio :54323)
supabase stop             # stop the stack (use `--no-backup` to drop local data)

supabase migration new <name>   # create supabase/migrations/<ts>_<name>.sql
supabase db reset               # re-apply all migrations + seed.sql to the local DB
supabase db diff -f <name>      # capture schema changes you made via Studio/SQL into a migration
```

Studio runs at <http://localhost:54323> once `supabase start` is up.

## Making schema changes (workflow)

1. Iterate with `execute_sql` (MCP) or `psql` against the local DB — do **not**
   use `apply_migration` for local iteration (it writes history on every call).
2. When happy, capture it: `supabase db diff -f <name>` (or hand-write a file via
   `supabase migration new <name>`).
3. `supabase db reset` to verify migrations + seed apply cleanly from scratch.
4. Enable RLS on every table in an exposed schema (`public`) and add policies
   that match the real access model. Views: `WITH (security_invoker = true)`.

## Going hosted later (optional, billed)

When a hosted project is wanted:

```bash
supabase projects create vibe --org <org> --region eu-west-2   # ~$10/mo
supabase link --project-ref <new-ref>
supabase db push                                               # apply local migrations to it
```

## Next steps (schema is intentionally empty)

Vibe has no committed schema yet. The natural first use, if/when wanted, is to
let the Go daemon (`go/`, `vibe serve` + the `go/agent` SDK) **persist agent
sessions, turns, and events** instead of holding them in memory — mirroring how
the `cockpit` project stores `cockpit_sessions` / `cockpit_chat_messages` /
`cockpit_assistant_events`. Define that with a first migration when the
daemon-side integration is on the table.
