---
name: vibe-self-plan
description: Use when asked about Vibe's self-plan state, when docs/examples/vibe-self-plan.json may be stale relative to examples/vibe-self.vibe, or when explicitly told to regenerate the self-plan.
allowed-tools: Bash(powershell *), Bash(pnpm *), Bash(git *)
---

# Vibe Self-Plan

Use this for the Vibe dogfood loop. `examples/vibe-self.vibe` is source; `docs/examples/vibe-self-plan.json` is generated output.

Current self-plan state:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/vibe_self_plan_check.ps1"`

## Instructions

- If the user only asks for status, explain the drift state and do not regenerate.
- If the user asks to update or regenerate the self-plan, run:

```powershell
powershell -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/vibe_self_plan_check.ps1" -Regenerate
```

- After regenerating, inspect the diff before reporting.
- Use broader checks only when code changed: `pnpm test`, `pnpm run build`, or `pnpm run check`.
