# Vibe Go Runtime Spike

**Status:** Spike plan.
**Date:** 2026-05-15
**Owner:** Luther

## Goal

Make Vibe useful before the full `vibe build` and provider-adapter runtime lands
by adding a small Go-based coordination runtime experiment.

This is not a rewrite of the TypeScript/Langium language work. It is a runtime
spike that consumes a simple lane-plan IR and performs safe mechanical work:
scope validation, prompt generation, local checklists, and later subprocess
supervision.

## Non-Goals

- Do not rewrite the Vibe parser in Go.
- Do not replace `packages/language`.
- Do not automate Codex web UI directly.
- Do not introduce a public `vlang` name.
- Do not claim LangGraph/CrewAI/OpenAI Agents/MCP are obsolete.

## Architecture

```text
Vibe Spec / .vibe source
  -> TS language package parses and resolves
  -> JSON lane-plan IR
  -> Go runtime coordinates lanes
  -> Codex web prompts, local checklists, later CLI subprocesses
```

## Initial File Layout

```text
go/
  go.mod
  README.md
  cmd/vibe-doctor/main.go
  cmd/vibe-make/main.go
  cmd/vibe-coord/main.go
  internal/bootstrap/
    self.go
  internal/doctor/
    doctor.go
  internal/lanes/
    coordinator.go
    types.go
  internal/prompts/
    codex_web.go
```

## Lane Plan IR v0

```json
{
  "name": "pawfall-feedback",
  "repo": "C:/GameSpree",
  "lanes": [
    {
      "name": "feedback-triage",
      "mode": "codex.web",
      "branch": "codex/pawfall-powerup-economy-director",
      "reads": [
        "cat-cafe/games/pawfall/docs/feedback/2026-05-15.md"
      ],
      "writes": [
        "cat-cafe/games/pawfall/docs/feedback/2026-05-15-action-plan.md"
      ],
      "prompt": "Read the feedback and produce a docs-only action plan.",
      "requires": ["human.review"]
    }
  ]
}
```

## Done For This Spike

- `go/` contains a minimal stdlib-only Go module.
- `vibe-doctor` reports local tool availability.
- `vibe-make` emits a self-making lane plan for this repo.
- The CLI can read a JSON plan and emit markdown handoffs.
- Scope validation rejects overlapping write scopes between lanes.
- The generated handoff makes lane boundaries explicit.
- The docs state that Go is the runtime layer, not the Vibe language.

## Verification

Go is not currently installed in this environment, so compile verification is
blocked until a Go toolchain is available. Once installed, run:

```powershell
cd C:\vibe\go
go test ./...
go run ./cmd/vibe-doctor --json
go run ./cmd/vibe-make plan --repo C:\vibe --out .\.out\self-plan.json
go run ./cmd/vibe-coord emit --plan ..\docs\examples\pawfall-feedback-lanes.json --out .\.out
```
