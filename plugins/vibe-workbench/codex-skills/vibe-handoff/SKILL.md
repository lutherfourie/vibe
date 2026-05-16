---
name: vibe-handoff
description: Use when Codex needs to prepare a Vibe lane handoff, work prompt, continuation brief, or multi-agent scope for Codex, Claude Code, GitHub, local CLI, or cloud agents.
---

# Vibe Handoff

Use this skill to prepare concrete handoffs from the current Vibe repo state.

## Inputs

Run the lane inventory:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_lane_inventory.ps1
```

Then inspect the relevant source files for the requested lane.

## Handoff Template

Produce a handoff with:

- Goal.
- Starting branch and dirty-state warning.
- Source files to read first.
- Owned write scope.
- Explicit out-of-scope files.
- Required verification commands.
- Stop conditions and human approval point.
- Target adapter: Codex, Claude Code, MCP, GitHub, IDE, local CLI, cloud agent, or unspecified.

Keep the wording executable. The receiving assistant should be able to start work without guessing lane boundaries.
