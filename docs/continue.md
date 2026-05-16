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

- PR #1 is the transfer-slice review:
  `codex/vibe-full-transfer-initialization` -> `codex/vibe-full-transfer-base`.
- PR #2 is the mainline integration PR:
  `codex/main-transfer-integration` -> `main`.
- Prefer PR #2 for the actual merge to `main`.
- After PR #2 merges, close PR #1 as superseded unless a reviewer needs the
  narrower transfer history.

## Resume Commands

```powershell
pnpm install --frozen-lockfile
pnpm run vibe:continue
pnpm run vibe:doctor
pnpm run vibe:lanes
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

Get PR #2 reviewed and merged to `main`. Then make the first post-merge slice a
small VS Code dogfood improvement: make `Vibe: Init Project` create a useful
`.vibe/` workspace, parse it into `.vibe/state.json`, and show it in the Vibe
tree without requiring the full future runtime.
