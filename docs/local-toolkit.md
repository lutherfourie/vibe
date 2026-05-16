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

Implemented in the unified Go binary as `vibe handoff --plan <lane-plan.json>`.

Produces agent-ready prompts from the older lane-plan JSON shape:

- Codex Web/cloud handoffs.
- Local Codex handoffs.
- GitHub issue or PR handoff text.
- Explicit repo, branch, write scope, verification, and stop conditions.
- Surface-aware targets such as `surface.codex.local`,
  `surface.codex.cloud`, and `surface.codex.github_pr`.

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

Do not introduce Supabase just to read the self-plan. The repo file is still the
source of truth.

Reference docs used for this direction:

- OpenAI Codex configuration: https://developers.openai.com/codex/config-reference
- Vercel AI Gateway: https://vercel.com/docs/ai-gateway
- Vercel plugin for Codex: https://vercel.com/docs/agent-resources/vercel-plugin
- Supabase AI and Vectors: https://supabase.com/docs/guides/ai
- Supabase `pgvector`: https://supabase.com/docs/guides/database/extensions/pgvector

## Next Slice

The next useful slice is to make `vibe serve` render the Mermaid graph visually
instead of showing raw Mermaid text, then add a copyable handoff panel per lane.

Keep installation side effects out of the CLI until the report format and human
approval flow are clearer.
