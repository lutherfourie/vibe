---
name: vibe-superpowers
description: Apply Superpowers workflows to Vibe lane planning, implementation, debugging, review, or verification.
allowed-tools: Bash(powershell *), Bash(git *), Bash(pnpm *)
---

# Vibe Superpowers

Use this skill when the user asks for Superpowers in `C:\vibe`, or when a Vibe task needs disciplined planning, execution, debugging, review, or completion verification.

Shared contract:

```text
${CLAUDE_SKILL_DIR}/../../shared/vibe-contract.md
```

Superpowers status:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_SKILL_DIR}/../../scripts/vibe_superpowers_check.ps1"`

Lane inventory:

!`powershell -ExecutionPolicy Bypass -File "${CLAUDE_SKILL_DIR}/../../scripts/vibe_lane_inventory.ps1"`

## Instructions

Map the request to the relevant Superpowers workflow before editing:

- New multi-step feature or integration: `superpowers:writing-plans`, then `superpowers:subagent-driven-development` when available or `superpowers:executing-plans` inline.
- Existing plan: `superpowers:executing-plans`.
- Unexpected behavior or failing check: `superpowers:systematic-debugging`.
- Review or review feedback: `superpowers:requesting-code-review` or `superpowers:receiving-code-review`.
- Completion claim: `superpowers:verification-before-completion`.

Keep Vibe plans under `docs/superpowers/plans/`, specs under `docs/superpowers/specs/`, and research under `docs/superpowers/research/`. Preserve dirty work from other agents and do not commit unless explicitly asked.
