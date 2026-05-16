---
name: vibe-orient
description: Orient on the C:\vibe repository, current Vibe self-plan loop, and available assistant/plugin surfaces. Use when starting Vibe work, planning a lane, or checking repo state.
allowed-tools: Bash(powershell *), Bash(git *)
---

# Vibe Orient

Load the shared Vibe contract:

```text
${CLAUDE_SKILL_DIR}/../../shared/vibe-contract.md
```

Current repo snapshot:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_SKILL_DIR}/../../scripts/vibe_repo_snapshot.ps1"`

Current lane inventory:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_SKILL_DIR}/../../scripts/vibe_lane_inventory.ps1"`

## Instructions

Summarize the current branch, dirty state, self-plan freshness, detected assistant surfaces, and safest next work slice. Do not install tools, edit credentials, or enable hooks unless the user explicitly asks.
