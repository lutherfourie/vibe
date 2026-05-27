---
name: vibe-orient
description: Use when starting a Vibe session, planning a lane, picking the next slice, or checking repo/branch/self-plan state before edits.
allowed-tools: Bash(powershell *), Bash(git *)
---

# Vibe Orient

Load the shared Vibe contract:

```text
${CLAUDE_PLUGIN_ROOT}/shared/vibe-contract.md
```

Current repo snapshot:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/vibe_repo_snapshot.ps1"`

Current lane inventory:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/vibe_lane_inventory.ps1"`

## Instructions

Summarize the current branch, dirty state, self-plan freshness, detected assistant surfaces, and safest next work slice. Do not install tools, edit credentials, or enable hooks unless the user explicitly asks.

When the user asks about Superpowers, planning, debugging, review, or verification: invoke the relevant Superpowers skill directly (`superpowers:writing-plans`, `superpowers:systematic-debugging`, `superpowers:requesting-code-review`, `superpowers:verification-before-completion`, etc.) and save Vibe artifacts under `docs/superpowers/{plans,specs,research}/` per the shared contract.
