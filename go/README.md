# Vibe Go Runtime Spike

This directory is an experimental Go runtime for Vibe.

It does not replace `packages/language`. The TypeScript/Langium package remains
the Vibe language implementation. The Go runtime is a practical coordination
layer for lane plans, prompt handoffs, scope validation, and later local agent
subprocess supervision.

Current scope:

- Inspect local prerequisites.
- Generate a self-making Vibe lane plan.
- Read a JSON lane plan.
- Validate write-scope ownership.
- Emit Codex cloud handoff prompts.
- Emit local lane checklists.
- Emit autonomous long-horizon lane briefs (Explore→…→Commit loop + PROGRESS.md contract).
- Maintain PROGRESS.md durable state (`vibe checkpoint` / `vibe resume`).

The runtime builds and tests under Go 1.22+ (`go/go.mod`). Run `go test ./...`
from the `go/` directory. CI (`.github/workflows/ci.yml`) gates build, vet,
gofmt, and tests on every push and pull request.

## Commands

```powershell
go test ./...
go run ./cmd/vibe-doctor --json
go run ./cmd/vibe-make plan --repo C:\vibe --out .out\self-plan.json
go run ./cmd/vibe-coord emit --plan path\to\lanes.json --out .out

# Autonomous lanes (long-horizon, durable work)
go run ./cmd/vibe handoff --plan ..\docs\examples\vibe-autonomous-lanes.json --out .out
go run ./cmd/vibe checkpoint --summary "what changed" --note "next step" --status "phase"
go run ./cmd/vibe resume
```

## Binaries

- `vibe-doctor`: environment checks for bootstrap dependencies.
- `vibe-make`: self-making lane-plan generation.
- `vibe-coord`: lane validation and handoff generation.
