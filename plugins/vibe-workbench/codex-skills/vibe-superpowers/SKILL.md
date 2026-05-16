---
name: vibe-superpowers
description: Use when Codex should apply Superpowers workflows to a Vibe lane, implementation plan, debugging pass, review, or verification gate.
---

# Vibe Superpowers

Use this skill when the user asks for Superpowers in `C:\vibe`, or when a Vibe task needs disciplined planning, execution, debugging, review, or completion verification.

## Required Reads

1. `plugins/vibe-workbench/shared/vibe-contract.md`
2. Run:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_superpowers_check.ps1
```

3. If lane context matters, run:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_lane_inventory.ps1
```

## Workflow Mapping

- New multi-step feature or integration: use `superpowers:writing-plans`, then `superpowers:subagent-driven-development` when subagents are available or `superpowers:executing-plans` inline.
- Existing plan: use `superpowers:executing-plans` unless subagent-driven execution is available and appropriate.
- Unexpected behavior or failing check: use `superpowers:systematic-debugging`.
- Code review or lane boundary review: use `superpowers:requesting-code-review` or `superpowers:receiving-code-review` as appropriate.
- Before completion claims: use `superpowers:verification-before-completion`.

## Vibe-Specific Guardrails

- Plans belong in `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`.
- Specs belong in `docs/superpowers/specs/` when the work needs design before implementation.
- Research belongs in `docs/superpowers/research/`.
- Keep generated files generated: update `examples/vibe-self.vibe`, then run `pnpm run self:plan`.
- Preserve dirty work from other agents. Do not commit unless the user explicitly asks.
