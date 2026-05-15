# Local Vibe Toolkit

**Status:** Proposal
**Date:** 2026-05-16

The local toolkit should make `C:\vibe` easier to dogfood without building a
large self-hosting system. It should wrap existing repo checks first, then grow
only where the `.vibe` source loop proves a need.

## Proposed Commands

### `vibe doctor`

Checks local readiness:

- Git repo state, branch, upstream, and dirty files.
- Tool availability: `git`, `gh`, `node`, `pnpm`, `go`, `jq`, `yq`, `fd`.
- Auth status for GitHub and supported provider surfaces.
- Playwright browser installation.
- Generated artifact freshness, especially `docs/examples/vibe-self-plan.json`.

### `vibe lanes`

Reads a lane plan and reports ownership:

- Lane names, modes, write scopes, and handoff targets.
- Overlapping write scopes.
- Missing gates or missing human approval points.

### `vibe handoff`

Produces agent-ready prompts:

- Codex Web/cloud handoffs.
- Local Codex handoffs.
- GitHub issue or PR handoff text.
- Explicit repo, branch, write scope, verification, and stop conditions.
- Surface-aware targets such as `surface.codex.local`,
  `surface.codex.cloud`, and `surface.codex.github_pr`.

### `vibe verify`

Runs relevant checks for the current slice:

- TypeScript/Langium generation, tests, and build.
- Go tests when Go is installed.
- Docs/example consistency checks.
- Self-plan regeneration and diff detection.

### `vibe memory`

Records durable project decisions:

- `C:\vibe` is the source of truth.
- `C:\Hive\vibe` is reference material.
- The spec is fluid until decisions are recorded.
- Long-horizon agents are execution targets, not bootstrap dependencies.
- Phone, web, IDE, GitHub, local desktop, and cloud agents are explicit
  execution surfaces.

## First Slice

Start with `vibe doctor` as a report-only command. It can initially be a thin
wrapper around the current repo checks and environment probes. Do not add
installation side effects until the report format and human approval flow are
clear.

The first Codex-aware slice should read `examples/vibe-self.vibe`, report the
declared `surface codex.*` entries, and show each lane's `target`, `reads`,
`owns`, `verify`, and `approval` fields when present.
