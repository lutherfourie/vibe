# Vibe Continue

**Purpose:** give the next Codex, Claude Code, or human session one obvious
starting point.

## Start Here

Run:

```powershell
pnpm run vibe:continue
```

Then read, in order:

1. `docs/continue.md`
2. `docs/fresh-start.md`
3. `docs/bootstrap-todos.md`
4. `docs/local-toolkit.md`
5. `docs/examples/vibe-self-plan.json`

## Current Git Shape

- PRs #1-#4 have been merged to `main`.
- The current local-toolkit work is on `codex/vibe-self-plan-dashboard-gpt55`.
- Before starting broader work, open or update the PR for the current branch, or
  merge it if that has already been reviewed.

## Resume Commands

```powershell
pnpm install --frozen-lockfile
pnpm run vibe:continue
pnpm run vibe:doctor
pnpm run vibe:lanes
cd go
go run ./cmd/vibe handoff --self-plan docs/examples/vibe-self-plan.json --out .vibe-out/handoffs
cd ..
pnpm run check
cd go
go test ./...
```

In VS Code, run task `Vibe: Continue` for the same orientation card.

## Working Loop

1. Check branch and dirty state before editing.
2. Pick exactly one lane from `pnpm run vibe:lanes`.
3. Name the branch, write scope, and verification commands before changing
   files.
4. Update `docs/continue.md` when the recommended next move changes.
5. Run `pnpm run check` and `go test ./...` before pushing.

## Default Next Move

Finish the current local-toolkit branch, then make the first post-merge slice a
small VS Code dogfood improvement: make `Vibe: Init Project` create a useful
`.vibe/` workspace, parse it into `.vibe/state.json`, and show it in the Vibe
tree without requiring the full future runtime.

## Adapter Research Note

CrewAI is now represented as a report-only backend surface in
`examples/vibe-self.vibe`, with supporting notes in
`docs/superpowers/research/2026-05-16-vibe-crewai-integration-notes.md`.

Keep this lane non-invasive until a human asks for runtime generation: no
CrewAI install, no user-local MCP config edits, no credentials, and no runtime
agent execution. The useful first product move is still the VS Code cockpit and
local CLI unification.
