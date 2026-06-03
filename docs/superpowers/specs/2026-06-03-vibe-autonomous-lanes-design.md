# Vibe Autonomous Lanes — design

**Date:** 2026-06-03
**Status:** APPROVED (self-approved for autonomous execution; proceeding TDD)
**Repo:** `C:\vibe` (module `github.com/lutherfourie/vibe/go`, Go 1.22)
**Informed by:** `docs/superpowers/research/2026-06-03-autonomous-long-horizon-survey.md`

## Goal & north star

Make **long-horizon, durable, resume-from-checkpoint work a first-class lane
kind in Vibe.** Today a `.vibe`/lane-plan declares *who* and *where*; after this
change it can also declare *"this lane runs the autonomous long-horizon loop"* —
and Vibe generates the complete, scoped operating brief plus the durable-state
contract (`PROGRESS.md`) that makes the work recoverable across sessions.

The litmus test: a user should be able to declare one `autonomous` lane and get,
with no hand-pasting, (a) a paste-ready brief embedding the full Explore →
Research → Plan → Implement → Verify → Test → Commit loop scoped to that lane,
and (b) a `PROGRESS.md` discipline (`vibe checkpoint` / resume) that survives
session boundaries.

## Non-goals (M1)

- Executing the loop autonomously inside the daemon (`vibe serve` already has the
  agent SDK; wiring autonomous lanes to it is a later milestone).
- Changing the TS self-plan extractor or `.vibe` grammar. M1 lives in the
  **lane-plan** IR (the Go execution contract). `.vibe` `autonomous` syntax is a
  documented future seam.
- A scheduler/cron for checkpoints. `vibe checkpoint` is a verb the agent (or a
  hook) calls; cadence is advisory.

## The split (from the research note)

- **Text the executing agent reads** → a new lane **mode** `autonomous` that
  renders the long-horizon operating contract (`prompts.AutonomousHandoff`).
- **State & structure** → a lane-IR `autonomous` config object + a Vibe-owned
  **`PROGRESS.md` contract** with an emit/parse round-trip and a `checkpoint`
  verb.

## 1. Lane-plan schema additions (`schemas/vibe-lane-plan.schema.json`)

Extend the `mode` enum and add one optional, namespaced config object on the
lane. `additionalProperties:false` is preserved at every level.

```jsonc
"mode": { "enum": ["codex.web", "local", "autonomous"] },

// new, optional, on each lane:
"autonomous": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "progress":        { "type": "string" },                       // PROGRESS.md path (default "PROGRESS.md")
    "horizon":         { "type": "string" },                       // freeform: "long", "multi-session"
    "checkpointEvery": { "type": "string" },                       // cadence hint, e.g. "every major step or 30-60 min"
    "roles":           { "type": "array", "items": { "type": "string" } },
    "research":        { "type": "string" }                        // research-notes dir the lane appends to
  }
}
```

Rationale: namespacing keeps the generic lane lean; the object is meaningful only
when `mode == "autonomous"`, but the schema allows it generally (harmless if set
on other modes, ignored by their generators). The TS and Go mirrors stay in
sync; `schemas:check` and the contract tests gate drift.

## 2. Go IR (`go/internal/lanes/types.go`)

```go
type Lane struct {
    // ...existing fields...
    Autonomous *Autonomous `json:"autonomous,omitempty"`
}

// Autonomous carries the long-horizon config for a mode=="autonomous" lane.
type Autonomous struct {
    Progress        string   `json:"progress,omitempty"`
    Horizon         string   `json:"horizon,omitempty"`
    CheckpointEvery string   `json:"checkpointEvery,omitempty"`
    Roles           []string `json:"roles,omitempty"`
    Research        string   `json:"research,omitempty"`
}
```

Defaults (applied by the prompt generator, not the schema): `Progress` →
`PROGRESS.md`; `Roles` → `[architect, implementer, researcher, tester,
reviewer, devops]`; `CheckpointEvery` → `every major step or 30–60 minutes`.

## 3. Prompt generator (`go/internal/prompts/autonomous.go`)

`func AutonomousHandoff(planName, repo string, lane Lane) string` — mirrors the
shape of `CodexWebHandoff`/`LocalChecklist` and reuses `writeSection`. The
`prompts.Lane` view gains an `Autonomous` struct (dependency-free mirror) so the
prompts package stays free of the `lanes` import.

Rendered sections (in order):

1. **Header** — `# Autonomous Lane: <name>`, Plan, Repo, Branch/worktree,
   `Mode: autonomous`, Horizon (if set).
2. **Read Scope / Write Scope / Required Gates** — reuse `writeSection`.
3. **Autonomous Operating Contract** — the heart, scoped to this lane:
   - *Core Authorization* — full git/file/tool access **within the write
     scope**; spend generously; high-effort reasoning; recoverable via git +
     files.
   - *Startup & Resumption Protocol* — `git pull` → `git status` → read
     `<progress>` (create if missing) → read README/arch/recent commits/CLAUDE.md
     → resume from the last checkpoint, never restart.
   - *Structured Workflow Loop* — Explore → Research → Plan → Implement →
     Verify → Test → Commit & Handoff, with the lane's `requires` named as the
     Verify/Test gates.
   - *Multi-Agent Roles* — rotate through `roles`; use native sub-agents for
     independent research/review; merge findings back into `<progress>`.
   - *Branching & Experimentation* — keep main shippable; short-lived branch
     `<branch>`; push for backup; merge after self-review + gates.
   - *Persistence & Long-Horizon Rules* — checkpoint cadence; `<progress>` is
     the single source of truth; leave it clean at every natural boundary.
   - *PROGRESS.md Contract* — the required section set (see §4), so the agent
     writes a parseable file.
4. **Task** — `lane.Prompt`.
5. **Boundaries** — stay in write scope; treat the rest as read-only; no
   provider/toolchain/architecture changes unless the task requires them; report
   verification + residual risk; **update `<progress>` before stopping.**

The generator is pure (string in, string out), deterministic, and table-tested.

## 4. PROGRESS.md contract (`go/internal/progress/progress.go`)

A Vibe-owned structured shape so durable state is parseable, not just prose.

**Canonical sections** (H2), in order:

- `# <Title>` (H1) + a short front-block: `Status:`, `Updated:`, `Branch:`.
- `## Mission` — the durable north star.
- `## Status` — one-line current state + phase.
- `## Milestones` — checkbox list.
- `## Checkpoint Log` — reverse-or-forward chronological timestamped entries.
- `## Next Moves` — ordered list.
- `## Decisions` — decision → rationale.
- `## Risks / Blockers` — list (may be empty).
- `## Resume` — exact files to read first + commands to run.

**Go surface:**

```go
type Doc struct {
    Title      string
    Status     string
    Updated    string
    Branch     string
    Mission    string
    Milestones []string
    Checkpoints []Checkpoint   // each: Time, Summary, Detail lines
    NextMoves  []string
    Decisions  []string
    Risks      []string
    Resume     []string
}
type Checkpoint struct { Time, Summary string; Notes []string }

func Render(doc Doc) string                 // Doc -> canonical markdown
func Parse(md string) (Doc, error)          // markdown -> Doc (tolerant)
func AppendCheckpoint(md string, cp Checkpoint) (string, error)  // insert into Checkpoint Log
func Scaffold(title, mission string) Doc     // a fresh, valid Doc
```

`AppendCheckpoint` is the engine behind `vibe checkpoint`: it parses an existing
`PROGRESS.md` (or scaffolds one), inserts the new checkpoint at the top of the
`## Checkpoint Log`, refreshes the `Status:`/`Updated:` front-block, and
re-renders. Time is **injected** (not `time.Now()` inside the package) so the
renderer stays deterministic and testable — the CLI passes the clock.

## 5. CLI verbs (`go/cmd/vibe`)

- `vibe checkpoint --summary "<text>" [--note "<n>" ...] [--progress PROGRESS.md] [--status "<s>"]`
  — append a timestamped checkpoint to `PROGRESS.md` (scaffolding it if absent).
  Prints the path. The clock is real here; the package stays pure.
- `vibe resume [--progress PROGRESS.md]` — parse `PROGRESS.md`, combine with live
  git state, and print a lane-grain resume brief (reuse the continuation report
  shape: Read First, Resume Commands, Next Moves, Checkpoints tail).
- `vibe handoff` already routes `autonomous` via the coordinator (see §6); no new
  flag needed — the mode drives it.

(M1 may land `checkpoint`/`resume` in a follow-up slice; the mode + handoff +
PROGRESS contract package are the core.)

## 6. Coordinator wiring (`go/internal/lanes/coordinator.go`)

Add `ModeAutonomous = "autonomous"`. In `emitLane`, map the lane's `Autonomous`
config into `prompts.Lane.Autonomous` and dispatch
`case ModeAutonomous: body = prompts.AutonomousHandoff(...)`. `EmitHandoffs`,
`ValidatePlan` (write-scope overlap), and the worker pool are unchanged.

## 7. Example & tests

- Fixture: `docs/examples/vibe-autonomous-lanes.json` — a schema-valid lane-plan
  with one `autonomous` lane (+ one `local` lane to show coexistence). Doubles as
  a `cmd/vibe` smoke-test input and a `schemas:check` example.
- `prompts/autonomous_test.go` — asserts the operating-contract sections, the
  loop, the PROGRESS contract, the roles, and write-scope text are present.
- `lanes/coordinator_test.go` — emitting an `autonomous` lane writes a file with
  the autonomous header; bad-mode rejection already covered.
- `progress/progress_test.go` — Render/Parse round-trip; AppendCheckpoint inserts
  at the log head and refreshes the front-block; Scaffold is valid.
- `cmd/vibe/main_test.go` — `handoff --plan <fixture>` emits the autonomous
  filename/header (table-driven, `captureStdout`).

## 8. Verification gates

- `cd go && go test ./... && go vet ./... && gofmt -l .` (empty).
- `pnpm run schemas:check` (fixtures valid; enum still rejects bad modes).
- `pnpm run check` for any TS-touching change (none expected in M1).

## 9. Rollout

One feature branch `feat/vibe-autonomous-lanes`; focused commits (schema → IR →
prompt → wiring → example/tests → progress pkg → CLI → docs/skills). PR with
auto-merge `--squash` once CI is green, per the repo git-automation contract.

## Supersedes / relates

- Extends the lane-plan IR established by the 2026-05-27 go-runtime-harden work.
- Complements (does not replace) `continuation` (repo-grain resume) with
  `progress` (lane-grain durable state).
