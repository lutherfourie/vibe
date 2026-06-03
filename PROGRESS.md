# Vibe — Autonomous Long-Horizon Work

Status: in-progress — PR 2 verified locally; opening PR
Updated: 2026-06-03
Branch: feat/vibe-progress-checkpoint

## Mission

Make long-horizon, durable, resume-from-checkpoint work a **first-class lane
kind** in Vibe. A `.vibe`/lane-plan should be able to declare a lane as
`autonomous` and get, with no hand-pasting: (a) a generated, scoped operating
brief embedding the full Explore → Research → Plan → Implement → Verify → Test →
Commit loop, and (b) a durable `PROGRESS.md` discipline (`checkpoint`/`resume`)
that survives session boundaries. This file is both the project tracker and the
first dogfood of the `PROGRESS.md` contract the feature defines.

## Milestones

- [x] Explore the repo; locate the integration seam (lane modes → handoffs).
- [x] Research note: base autonomous prompt read as a contract; big-AGI fit.
- [x] Design spec: `autonomous` mode + lane IR + `PROGRESS.md` contract.
- [x] TDD plan (T1–T7) sliced into 3 PRs.
- [x] PR 1 (core): T1 schema, T2 IR, T3 prompt generator, T4 coordinator + smoke.
- [x] PR 2 (durable state): T5 `progress` package, T6 `checkpoint`/`resume` verbs.
- [ ] PR 3 (surfaces): T7 skills, templates, docs.

## Checkpoint Log

### 2026-06-03 — PR 2 complete: progress contract package + checkpoint/resume verbs
- go/internal/progress: Doc/Checkpoint, Render/Parse (idempotent round-trip), surgical AppendCheckpoint, Scaffold, ResumeBrief; clock injected
- vibe checkpoint + vibe resume verbs; smoke tests; verified surgical append on a copy of this file
- dogfood: this very entry was written by 'vibe checkpoint'

### 2026-06-03 — PR 1 core complete: autonomous lane mode end-to-end
- T1: schema gains `autonomous` mode + namespaced `autonomous` config object;
  `docs/examples/vibe-autonomous-lanes.json` fixture; `check-schemas.mjs` asserts
  it valid + rejects an unknown `autonomous.*` key. Fixed the ajv $id
  double-compile gotcha (shared schema across two fixtures). `schemas:check` 6/6.
- T2: `lanes.Lane.Autonomous` + `Autonomous` struct; round-trip test decodes the
  fixture and asserts non-autonomous lanes carry no block.
- T3: `prompts.AutonomousHandoff` renders the full operating contract (Core Auth,
  Startup/Resumption, Explore→…→Commit loop, Multi-Agent Roles, Branching,
  Persistence, PROGRESS.md Contract) with defaults; 3 tests incl. custom-role +
  defaults paths.
- T4: coordinator dispatches `ModeAutonomous`; `cmd/vibe` + coordinator emit
  smoke tests. Verified the real generated brief by eye — clean, paste-ready.
- Gates green: `go test ./...`, `go vet`, `gofmt -l` clean; `pnpm run schemas:check`.
- Next: open PR 1, auto-merge `--squash`; then PR 2 (the `progress` package +
  `checkpoint`/`resume` verbs).

### 2026-06-03 — Foundation: design artifacts + branch
- Startup protocol run: `git pull` (fast-forwarded onto the merged Go agent SDK,
  PR #18), `git status` clean. Discovered the runtime direction is now **Go**
  (the agent SDK daemon supersedes the stale TS LangGraph Phase-3 plan in
  memory).
- Located the integration seam: `go/internal/lanes` dispatches per-mode handoffs
  (`codex.web`, `local`); an `autonomous` mode is the first-class home for the
  long-horizon protocol.
- Wrote research note, design spec, and TDD plan under `docs/superpowers/`.
- Created/rebased branch `feat/vibe-autonomous-lanes` onto current main HEAD
  (e492805). Baseline `go test ./...` green before any change.
- Next: implement T1 (schema + fixture) red→green.

## Next Moves

1. Open PR 2 (durable state); confirm it lands on main.
2. T7 (PR 3) — skills (`vibe-autonomous`, `vibe-checkpoint` for Claude + Codex),
   `examples/autonomous-lane.vibe` template, and docs (`docs/autonomous-lanes.md`
   + README / CLAUDE.md / go/README.md / schemas/README.md / vibe-contract.md).
3. Future (M2): wire autonomous lanes to `vibe serve` so the daemon can *run* the
   loop (the agent SDK already exists); add a `.vibe` `autonomous` grammar seam.

## Decisions

- **Land in the lane-plan IR (Go), not the `.vibe` grammar, for M1.** The
  lane-plan is the execution contract; `.vibe` `autonomous` syntax is a
  documented future seam. Keeps M1 cohesive and avoids a TS grammar change.
- **Namespace autonomous config under a lane `autonomous` object** rather than
  flat fields — keeps the generic lane lean and the config clearly mode-scoped.
- **Split text vs. state.** The loop/protocol the agent *reads* → a generated
  handoff (new mode). Durable *state/structure* → the `PROGRESS.md` contract +
  `checkpoint` verb. Clean separation; testable independently.
- **Inject the clock** into the `progress` package so rendering stays
  deterministic and unit-testable; the CLI supplies real time.

## Risks / Blockers

- None blocking. Watch: schema `additionalProperties:false` means every new key
  must be declared in both the schema and the Go struct or contract tests fail —
  this is the intended guardrail.

## Resume

Read first:
- `docs/superpowers/specs/2026-06-03-vibe-autonomous-lanes-design.md` (the design)
- `docs/superpowers/plans/2026-06-03-vibe-autonomous-lanes-m1.md` (the tasks)
- this file (latest checkpoint = current position)

Commands:
- Orient: `git status` · `git log --oneline -8`
- Verify Go: `cd go && go test ./... && go vet ./... && gofmt -l .`
- Verify schemas: `pnpm run schemas:check`
- Branch: per-slice `feat/vibe-*`; `main` is unprotected so PRs land on merge.
  CI is billing-locked — verify gates locally (see memory `ci_billing_lock`).
