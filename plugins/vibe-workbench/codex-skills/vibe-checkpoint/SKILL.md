---
name: vibe-checkpoint
description: Use to record a durable checkpoint in PROGRESS.md at a natural boundary (slice complete, blocker, phase end) so a long-horizon lane stays recoverable across sessions.
---

# Vibe Checkpoint

Append a `PROGRESS.md` checkpoint at every natural boundary: a slice is complete
and its gates pass, you hit a blocker, a phase ends, or you are about to stop
(always checkpoint before stopping). `PROGRESS.md` is the single source of truth
for handoff.

## How

```powershell
cd go ; go run ./cmd/vibe checkpoint `
  --summary "<one-line what changed>" `
  --note "<detail>" --note "<next step>" `
  --status "<new one-line Status + phase>"
```

- `--summary` (required) titles the entry under today's date.
- `--note` is repeatable — one per bullet.
- `--status` refreshes the front-block `Status:` line (optional).
- `--progress <path>` targets a non-default file; `--date YYYY-MM-DD` overrides
  the stamp.

The append is surgical: the new entry goes at the head of the `## Checkpoint Log`
and `Status:`/`Updated:` are refreshed, while everything else is preserved. An
absent `PROGRESS.md` is scaffolded.

## Then

Review the diff and commit `PROGRESS.md` with the related work; on a non-main
branch, push and open/refresh the PR per the repo's git-automation contract.
