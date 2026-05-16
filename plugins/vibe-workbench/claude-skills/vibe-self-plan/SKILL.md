---
name: vibe-self-plan
description: Check or regenerate Vibe's self-plan loop from examples/vibe-self.vibe to docs/examples/vibe-self-plan.json.
allowed-tools: Bash(powershell *), Bash(pnpm *), Bash(git *)
---

# Vibe Self-Plan

Use this for the Vibe dogfood loop. `examples/vibe-self.vibe` is source; `docs/examples/vibe-self-plan.json` is generated output.

Current self-plan state:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_SKILL_DIR}/../../scripts/vibe_self_plan_check.ps1"`

## Instructions

- If the user only asks for status, explain the drift state and do not regenerate.
- If the user asks to update or regenerate the self-plan, run:

```powershell
powershell -ExecutionPolicy Bypass -File "${CLAUDE_SKILL_DIR}/../../scripts/vibe_self_plan_check.ps1" -Regenerate
```

- After regenerating, inspect the diff before reporting.
- Use broader checks only when code changed: `pnpm test`, `pnpm run build`, or `pnpm run check`.
