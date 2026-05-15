---
name: vibe-handoff
description: Prepare a Vibe lane handoff or continuation prompt with source files, write scope, verification, stop conditions, and target assistant surface.
allowed-tools: Bash(powershell *), Bash(git *)
---

# Vibe Handoff

Lane inventory:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_SKILL_DIR}/../../scripts/vibe_lane_inventory.ps1"`

## Instructions

Create a handoff for `$ARGUMENTS`. If no argument is supplied, infer the lane from the user request and current repo state.

Include:

- Goal.
- Starting branch and dirty-state warning.
- Source files to read first.
- Owned write scope.
- Explicit out-of-scope files.
- Required verification commands.
- Stop conditions and human approval point.
- Target surface: Claude Code, Codex, MCP, GitHub, IDE, local CLI, cloud agent, or unspecified.

Keep the handoff direct enough that another assistant can execute it without reinterpreting the lane.
