---
name: vibe-autonomous
description: Use to start or resume a long-horizon autonomous Vibe lane — run the startup/resumption protocol, read the PROGRESS.md resume brief, and follow the Explore→Verify→Commit loop with checkpoints.
allowed-tools: Bash(powershell *), Bash(git *), Bash(go *)
---

# Vibe Autonomous Lane

Current autonomous status:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/vibe_autonomous_status.ps1"`

## What an autonomous lane is

A long-horizon, durable, resume-from-checkpoint unit of Vibe work. It runs the
full Explore → Research → Plan → Implement → Verify → Test → Commit loop and
survives across sessions via git + `PROGRESS.md`. See `docs/autonomous-lanes.md`
in the active Vibe repo.

## Startup & resumption protocol (always first)

1. `git pull` and `git status`.
2. Read the resume brief and `PROGRESS.md`:
   ```powershell
   cd go ; go run ./cmd/vibe resume    # or `vibe resume` if a binary is on PATH
   ```
   Then read `README.md`, key architecture docs, recent commits, and `CLAUDE.md`.
3. Resume from the last checkpoint — never restart from scratch if state exists.

## If a lane-plan declares the lane

Generate the scoped operating brief instead of pasting a prompt:

```powershell
cd go ; go run ./cmd/vibe handoff --plan <path-to-lane-plan.json> --out .\.vibe-out
```

The `# Autonomous Lane: <name>` brief embeds Core Authorization, the loop,
multi-agent roles, branching discipline, and the PROGRESS.md contract — scoped to
that lane's read/write scope and gates.

## Run the loop

For every slice: **Explore → Research → Plan → Implement → Verify → Test →
Commit & Handoff.** Stay inside the lane's write scope. Use sub-agents for
independent research or review and merge findings back into `PROGRESS.md`.

## Checkpoint and stop cleanly

Checkpoint at every natural boundary (slice complete, blocker, phase end) and
before stopping — use the `vibe-checkpoint` skill or:

```powershell
cd go ; go run ./cmd/vibe checkpoint --summary "<what changed>" --note "<next>" --status "<state>"
```

Leave `PROGRESS.md` current: it is the single source of truth for the next
session. Then push the branch and open a PR per the repo's git-automation
contract.
