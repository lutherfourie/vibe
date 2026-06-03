# Vibe Autonomous Lanes — M1 plan (TDD)

**Date:** 2026-06-03
**Spec:** `docs/superpowers/specs/2026-06-03-vibe-autonomous-lanes-design.md`
**Branch:** `feat/vibe-autonomous-lanes`
**Bar:** every task red→green→refactor; `go test ./...`, `go vet`, `gofmt -l`
clean; `pnpm run schemas:check` green. PR auto-merge `--squash` once CI passes.

## Task sequence

### T1 — Schema: `autonomous` mode + `autonomous` config object
- Add `"autonomous"` to the lane `mode` enum and the namespaced `autonomous`
  object (per spec §1) to `schemas/vibe-lane-plan.schema.json`.
- Add a schema-valid example fixture `docs/examples/vibe-autonomous-lanes.json`
  (one `autonomous` lane + one `local` lane; disjoint write scopes).
- Extend `scripts/check-schemas.mjs` (or its fixture list) so the new fixture is
  asserted valid, and add a negative case proving a bad `autonomous.*` key is
  rejected.
- **Gate:** `pnpm run schemas:check` green (valid fixture passes; bad key fails).

### T2 — Go IR: `Lane.Autonomous` + `Autonomous` struct
- Extend `go/internal/lanes/types.go` with `Autonomous *Autonomous` and the
  struct (spec §2).
- Test (`lanes/coordinator_test.go` or a new `types_test.go`): `ParsePlan` on the
  committed autonomous fixture decodes the `Autonomous` block (round-trips the
  fields); `ValidatePlan` still enforces disjoint write scopes across modes.
- **Gate:** `go test ./internal/lanes/...` green.

### T3 — Prompt generator: `prompts.AutonomousHandoff`
- New `go/internal/prompts/autonomous.go` + `prompts.Lane.Autonomous` mirror.
- Renders the operating contract (spec §3): Startup & Resumption Protocol, the
  Explore→…→Commit loop, Multi-Agent Roles, Branching, Persistence, the
  PROGRESS.md Contract section set, plus Read/Write/Gates and Task/Boundaries.
- Applies defaults (Progress→`PROGRESS.md`; default roles; default cadence).
- Test (`prompts/autonomous_test.go`): `requireAll` for the section headers, the
  loop phases, `PROGRESS.md`, the default roles, and the lane's write scope.
- **Gate:** `go test ./internal/prompts/...` green.

### T4 — Coordinator wiring + smoke test
- `coordinator.go`: `ModeAutonomous` const; map `lane.Autonomous` →
  `prompts.Lane.Autonomous`; dispatch in `emitLane`.
- `cmd/vibe/main_test.go`: table case — `handoff --plan <autonomous fixture>`
  writes the autonomous handoff (filename + `# Autonomous Lane:` header).
- **Gate:** `go test ./...` green; emitting the fixture produces the file.

### T5 — PROGRESS.md contract package
- New `go/internal/progress/progress.go`: `Doc`, `Checkpoint`, `Render`, `Parse`,
  `AppendCheckpoint`, `Scaffold` (spec §4). Time injected, never `time.Now()`
  inside the package.
- Test (`progress/progress_test.go`): Render/Parse round-trip; AppendCheckpoint
  inserts at the log head and refreshes `Status:`/`Updated:`; Scaffold valid;
  Parse tolerant of a hand-written file (this repo's own `PROGRESS.md`).
- **Gate:** `go test ./internal/progress/...` green.

### T6 — CLI verbs: `vibe checkpoint` + `vibe resume`
- `cmd/vibe`: `checkpoint` (real clock → `AppendCheckpoint`) and `resume`
  (`Parse` + git state → resume brief). Wire into `usage`.
- Smoke tests for both (temp dir, fake clock via flag or fixed input).
- **Gate:** `go test ./...` green.

### T7 — Skills, templates, docs
- `plugins/vibe-workbench/skills/vibe-autonomous/SKILL.md` (+ codex mirror) and
  `…/vibe-checkpoint/SKILL.md`; update the skills drift check if it enumerates.
- Template: `examples/autonomous-lane.vibe` (documented future syntax) and the
  JSON fixture already from T1.
- Docs: `docs/autonomous-lanes.md`; update `README.md`, `CLAUDE.md`,
  `go/README.md`, `schemas/README.md`, `plugins/vibe-workbench/shared/vibe-contract.md`.
- **Gate:** `pnpm run check` green if TS touched (none expected); markdownlint.

## Slicing into PRs

- **PR 1 (core):** T1–T4 + the design docs + root `PROGRESS.md`. A complete
  vertical slice: declare an autonomous lane → generate the brief.
- **PR 2 (durable state):** T5–T6. The `PROGRESS.md` contract + `checkpoint`/
  `resume` verbs.
- **PR 3 (surfaces):** T7. Skills, templates, docs.

Each PR: push, open, enable auto-merge `--squash`, report URL.
