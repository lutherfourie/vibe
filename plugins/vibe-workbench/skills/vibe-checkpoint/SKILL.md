---
name: vibe-checkpoint
description: Use to record a durable checkpoint in PROGRESS.md at a natural boundary (slice complete, blocker, phase end) so a long-horizon lane stays recoverable across sessions.
allowed-tools: Bash(powershell *), Bash(git *), Bash(go *)
---

# Vibe Checkpoint

Current autonomous status:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/vibe_autonomous_status.ps1"`

## When to checkpoint

Append a `PROGRESS.md` checkpoint at every natural boundary:

- a slice is complete and its gates pass,
- you hit a blocker you cannot clear now,
- a phase ends, or
- you are about to stop (always checkpoint before stopping).

`PROGRESS.md` is the single source of truth for handoff; keep it current.

## How

```powershell
cd go ; go run ./cmd/vibe checkpoint `
  --summary "<one-line what changed>" `
  --note "<detail>" --note "<next step>" `
  --status "<new one-line Status + phase>"
```

(Use `vibe checkpoint ...` directly if a built binary is on PATH.)

- `--summary` (required) titles the entry under today's date.
- `--note` is repeatable — one per bullet.
- `--status` refreshes the front-block `Status:` line (optional).
- `--progress <path>` targets a non-default file; `--date YYYY-MM-DD` overrides
  the stamp.

The append is **surgical**: the new entry goes at the head of the
`## Checkpoint Log` and `Status:`/`Updated:` are refreshed, while everything else
is preserved. An absent `PROGRESS.md` is scaffolded.

## Then

Review the diff, commit `PROGRESS.md` with the related work, and (on a non-main
branch) push and open/refresh the PR per the repo's git-automation contract.
