# Vibe — Autonomous Long-Horizon Work

Status: in-progress — autonomous-lanes M1, PR 1 (core) under construction
Updated: 2026-06-03
Branch: feat/vibe-autonomous-lanes

## Mission

Make long-horizon, durable, resume-from-checkpoint work a **first-class lane
kind** in Vibe. A `.vibe`/lane-plan should be able to declare a lane as
`autonomous` and get, with no hand-pasting: (a) a generated, scoped operating
brief embedding the full Explore → Research → Plan → Implement → Verify → Test →
Commit loop, and (b) a durable `PROGRESS.md` discipline (`checkpoint`/`resume`)
that survives session boundaries. This file is both the project tracker and the
first dogfood of the `PROGRESS.md` contract the feature defines.

## Status

Design artifacts written (research, spec, plan). Implementing PR 1 (core):
schema → IR → prompt generator → coordinator wiring → example/tests.

## Milestones

- [x] Explore the repo; locate the integration seam (lane modes → handoffs).
- [x] Research note: base autonomous prompt read as a contract; big-AGI fit.
- [x] Design spec: `autonomous` mode + lane IR + `PROGRESS.md` contract.
- [x] TDD plan (T1–T7) sliced into 3 PRs.
- [ ] PR 1 (core): T1 schema, T2 IR, T3 prompt generator, T4 coordinator + smoke.
- [ ] PR 2 (durable state): T5 `progress` package, T6 `checkpoint`/`resume` verbs.
- [ ] PR 3 (surfaces): T7 skills, templates, docs.

## Checkpoint Log

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

1. T1 — extend `schemas/vibe-lane-plan.schema.json` (`autonomous` mode + config
   object); add `docs/examples/vibe-autonomous-lanes.json`; wire into
   `scripts/check-schemas.mjs`. Gate: `pnpm run schemas:check`.
2. T2 — `Lane.Autonomous` + struct in `go/internal/lanes/types.go`; round-trip
   test.
3. T3 — `prompts.AutonomousHandoff` + test (operating contract sections).
4. T4 — coordinator dispatch + `cmd/vibe` smoke test; open PR 1, auto-merge.

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
- Branch: `feat/vibe-autonomous-lanes` (push + PR per the git-automation contract)
