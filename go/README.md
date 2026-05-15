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

Go is not installed in the current development environment, so this spike is
checked in as source only until a Go toolchain is available.

## Commands

```powershell
go test ./...
go run ./cmd/vibe-doctor --json
go run ./cmd/vibe-make plan --repo C:\vibe --out .out\self-plan.json
go run ./cmd/vibe-coord emit --plan path\to\lanes.json --out .out
```

## Binaries

- `vibe-doctor`: environment checks for bootstrap dependencies.
- `vibe-make`: self-making lane-plan generation.
- `vibe-coord`: lane validation and handoff generation.
