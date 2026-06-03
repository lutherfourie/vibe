---
name: vibe-autonomous
description: Use to start or resume a long-horizon autonomous Vibe lane — run the startup/resumption protocol, read the PROGRESS.md resume brief, and follow the Explore→Verify→Commit loop with checkpoints.
---

# Vibe Autonomous Lane

A long-horizon, durable, resume-from-checkpoint unit of Vibe work that survives
across sessions via git + `PROGRESS.md`. See `docs/autonomous-lanes.md`.

## Status snapshot

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_autonomous_status.ps1
```

## Startup & resumption protocol (always first)

1. `git pull` and `git status`.
2. Read the resume brief and `PROGRESS.md`:
   ```powershell
   cd go ; go run ./cmd/vibe resume
   ```
   Then read `README.md`, key architecture docs, recent commits, and `AGENTS.md`.
3. Resume from the last checkpoint — never restart from scratch if state exists.

## Generate the scoped brief (if a lane-plan declares the lane)

```powershell
cd go ; go run ./cmd/vibe handoff --plan <path-to-lane-plan.json> --out .\.vibe-out
```

The `# Autonomous Lane: <name>` brief embeds Core Authorization, the
Explore → Research → Plan → Implement → Verify → Test → Commit loop, multi-agent
roles, branching discipline, and the PROGRESS.md contract — scoped to the lane's
read/write scope and gates.

## Run the loop, then checkpoint

Work the loop inside the lane's write scope. Checkpoint at every natural boundary
and before stopping (see the `vibe-checkpoint` skill), and leave `PROGRESS.md`
current as the single source of truth for the next session.
