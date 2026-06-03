# Local Vibe Toolkit

**Status:** First working local bridge
**Date:** 2026-05-16

The local toolkit should make `C:\vibe` easier to dogfood without building a
large self-hosting system. It should wrap existing repo checks first, then grow
only where the `.vibe` source loop proves a need.

## Current Commands

These commands are exposed through the root `package.json`, `.vscode/tasks.json`,
and the `Vibe: Admin Workspace` command palette picker.

### `vibe doctor`

Implemented as `pnpm run vibe:doctor`.

Checks local readiness:

- Required tools: `git`, `node`, `pnpm`, `go`.
- Optional agent tools: `codex`, `claude`, `obsidian`.

### `vibe lanes`

Implemented as `pnpm run vibe:lanes`.

Reads `docs/examples/vibe-self-plan.json` and reports lane names, targets, and
verification commands.

### `vibe graph`

Implemented as `pnpm run vibe:graph`.

Writes `docs/examples/vibe-lanes.mmd`, a Mermaid lane graph generated from the
same self-plan JSON used by the VS Code lane tree.

### `vibe handoff`

Implemented in the unified Go binary as:

```powershell
vibe handoff --plan <lane-plan.json>
vibe handoff --self-plan docs/examples/vibe-self-plan.json --out .vibe-out/handoffs
```

Produces agent-ready prompts from the older lane-plan JSON shape:

- Codex Web/cloud handoffs.
- Local Codex handoffs.
- GitHub issue or PR handoff text.
- Explicit repo, branch, write scope, verification, and stop conditions.
- Surface-aware targets such as `surface.codex.local`,
  `surface.codex.cloud`, and `surface.codex.github_pr`.

For the generated self-plan JSON, it exports one markdown handoff per lane using
the same lane body shown in the dashboard. `vibe serve` exposes the same
handoffs as `/handoffs/<lane>.md` downloads.

### `vibe verify`

Implemented as `pnpm run vibe:verify`.

Runs the repo verification command from the repo root:

- `pnpm run check`

### `vibe serve`

Implemented as `pnpm run vibe:serve`.

Hosts the current admin surface at `http://127.0.0.1:8787` with:

- `/` local HTML dashboard.
- `/self-plan.json` machine-readable self-plan.
- `/vibe-lanes.mmd` Mermaid lane graph.
- Visual lane graph cards rendered from the same self-plan.
- Copyable lane handoff panels with read scope, write scope, target surface,
  verification commands, and approval point.
- Raw Mermaid source in a collapsible debugging panel.

### `vibe memory`

Still proposed. It should record durable project decisions:

- `C:\vibe` is the source of truth.
- `C:\Hive\vibe` is reference material.
- The spec is fluid until decisions are recorded.
- Long-horizon agents are execution targets, not bootstrap dependencies.
- Phone, web, IDE, GitHub, local desktop, and cloud agents are explicit
  execution surfaces.

## Hosting Strategy

The current best local host is the stdlib Go HTTP server in `vibe serve`.

Containers, Kubernetes, Puppet, Chef, or heavier IaC are not the first move for
this repo because the useful artifact is still a local, repo-derived admin
surface. The first invariant should be "can Codex, Claude Code, and VS Code all
see the same lanes and verification gates from the same source file?" The Go
server gives that without introducing registry, image build, cluster, or secret
management overhead.

Add Docker only when Vibe needs a repeatable remote preview artifact. Add
Kubernetes only when there are multiple independently deployed services. Puppet
or Chef are not a fit for this first slice; Vibe should express repo and agent
coordination before it manages host fleets.

## Remote Setup Path

Vercel is the right remote target once the local dashboard needs sharing or
preview URLs. Keep the first Vercel shape static or serverless:

- Generate `docs/examples/vibe-self-plan.json` and
  `docs/examples/vibe-lanes.mmd` during build.
- Serve a read-only dashboard from Vercel.
- Use Vercel AI Gateway or AI SDK only when Vibe adds a hosted model-facing
  route; keep local Codex and Claude extension administration local for now.

Supabase becomes useful when Vibe needs durable shared state:

- `vibe_runs` for verification and lane-run history.
- `lane_events` for append-only agent progress.
- `agent_handoffs` for generated prompts and ownership records.
- `memory_entries` later, potentially with `pgvector`, if semantic project
  memory moves out of repo docs.
- `telemetry_events` for usage/metrics (launches, provider choices via resource dispatcher, remote C&C processing, infra syncs, errors). Hosted on the *same* Supabase instance (no new services) so remote/Go agents, web dashboard, and resolver all use the existing client + RLS + realtime without extra auth or billing. Opt-in, best-effort emission.

The web autonomous dashboard (the main live surface) was evolved with strong inspiration from Claude.ai (artifacts side panels for live structured content like plans/checkpoints/telemetry, chat-style console for natural/remote command input to agents via the C&C bus, projects-style sidebar for sessions, honest realtime streaming of events, clean minimalist cards). This hybrid (conversational control + declarative artifacts) is better than pure chat or pure dashboard for an agent OS. See web/app/page.tsx console + artifacts. The `vibe serve` HTML surface remains for self-plan lanes/handoffs.

Do not introduce Supabase just to read the self-plan. The repo file is still the
source of truth.

Reference docs used for this direction:

- OpenAI Codex configuration: https://developers.openai.com/codex/config-reference
- Vercel AI Gateway: https://vercel.com/docs/ai-gateway
- Vercel plugin for Codex: https://vercel.com/docs/agent-resources/vercel-plugin
- Supabase AI and Vectors: https://supabase.com/docs/guides/ai
- Supabase `pgvector`: https://supabase.com/docs/guides/database/extensions/pgvector

## Current Slice

`vibe serve` now keeps the raw Mermaid endpoint but renders a local visual lane
graph, copyable handoff panels, and downloadable markdown handoffs directly from
the self-plan. The CLI can also export those handoffs with
`vibe handoff --self-plan docs/examples/vibe-self-plan.json --out .vibe-out/handoffs`.

It intentionally does not pull Mermaid from a CDN or add a browser dependency
yet; the dashboard must stay useful from a local checkout without external
service assumptions.

## Next Slice

The next useful slice is to wire this local-toolkit output into the VS Code
dogfood loop: make `Vibe: Init Project` create a useful `.vibe/` workspace,
parse it into `.vibe/state.json`, and show it in the Vibe tree. Keep
installation side effects out of the CLI until the report format and human
approval flow are clearer.

## Infra Sync for Remote Control of Supabase + Vercel

To enable full remote control of Vibe (you can launch, instruct, pause, and also keep the backing infra current from external surfaces like this chat, Claude, or Codex), Supabase (hosted tables for autonomous_sessions, agent_commands etc) and Vercel (the dashboard + /api/launch + /api/agent/* ) must be updated when code/migrations change.

### Local / Runner Path (automatic when poller active)
- `pnpm run infra:sync-supabase` — runs `supabase db push --linked --yes` (applies new migrations to the gknrdzkdgmuozhtaonst hosted project).
- `pnpm run infra:deploy-vercel` — runs `npx vercel deploy --prod --yes` (deploys latest web/ code + APIs).
- `pnpm run infra:sync-supabase && pnpm run infra:deploy-vercel` for both.

From a running Go autonomous agent that has the CLIs + auth in its environment:

```powershell
vibe remote --session <session-uuid-from-dashboard-or-launch>
```

This starts `RemoteControl` poller (3s) that watches agent_commands for that session. When you (or Grok) POST to web `/api/agent/command` (or use the dashboard "Infra Sync" buttons which do exactly that for the first loaded session), the poller receives it and `ProcessCommand` **auto-execs** the matching pnpm infra script via os/exec. Output is captured, acked to agent_responses + agent_events (realtime visible), so remote control plane and dashboard stay current without you SSHing or running locally.

The infra commands are: `sync-supabase`, `deploy-vercel`, `sync-infra`.

See: go/agent/remote.go (ProcessCommand + runPnpmInfra), go/cmd/vibe/main.go (the remote subcommand), web/app/api/agent/command/route.ts, web/app/page.tsx (Infra Sync section).

### CI / Dispatch Path (no local runner needed)
`.github/workflows/infra-sync.yml` is triggered via `workflow_dispatch` (choice: sync-supabase | deploy-vercel | sync-infra).

From terminal (with gh auth):

```powershell
gh workflow run infra-sync.yml --repo lutherfourie/vibe -f action=sync-infra
```

The workflow checks out, installs CLIs, links supabase using `SUPABASE_ACCESS_TOKEN` secret, runs the pushes/deploys using `VERCEL_TOKEN` secret.

Configure in GitHub repo → Settings → Secrets and variables → Actions:
- SUPABASE_ACCESS_TOKEN (from supabase dashboard / access tokens, needs write on the project)
- VERCEL_TOKEN (vercel.com → tokens, scoped to the vibe project)

The remote command handlers and dashboard notes mention the gh command as fallback.

### Why this satisfies the request
You can now control Vibe remotely end-to-end: send a command (even "sync-infra") from outside, and (with a `vibe remote` poller running against the control session, or via GH dispatch) the hosted Supabase schema and Vercel deployment update at the right time automatically. New remote features, resource dispatcher, cerebras force logic etc are immediately live for the control plane without manual steps on the dev machine.

This was implemented as part of the autonomous lane for remote control + resource economy (self-recorded via checkpoints, self-plan, vibe handoff).
