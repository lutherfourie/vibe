---
name: vibe-orient
description: Use when Codex needs to orient on the active Vibe repository, inspect the current Vibe work loop, or summarize repo/plugin surfaces before planning changes.
---

# Vibe Orient

Use this skill from the active Vibe repository before broad Vibe planning, plugin work, lane work, or handoff work.

## Start Here

1. Read `plugins/vibe-workbench/shared/vibe-contract.md`.
2. Run the repo snapshot:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_repo_snapshot.ps1
```

3. Run the lane inventory:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_lane_inventory.ps1
```

## Response Shape

Report:

- Current branch and dirty state.
- Available or missing local tools.
- Self-plan source/generated timestamp relationship.
- Detected Codex, Claude Code, MCP, GitHub, and IDE/plugin surfaces.
- The safest next slice, with write scope and verification.

Do not treat missing tools as install permission. Report first, then wait for the user to choose installation or credential changes.
