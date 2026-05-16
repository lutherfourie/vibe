---
name: vibe-self-plan
description: Use when Codex is asked to check, regenerate, review, or update Vibe's examples/vibe-self.vibe self-plan loop.
---

# Vibe Self-Plan

Use this skill for the Vibe dogfood loop:

```text
examples/vibe-self.vibe
  -> pnpm run self:plan
  -> docs/examples/vibe-self-plan.json
  -> human/agent execution
  -> updated .vibe source
```

## Workflow

1. Read `plugins/vibe-workbench/shared/vibe-contract.md`.
2. Inspect `examples/vibe-self.vibe` before changing generated JSON.
3. Check current drift:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_self_plan_check.ps1
```

4. If the user asked to regenerate or the source changed, run:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_self_plan_check.ps1 -Regenerate
```

5. Review the diff before summarizing.

## Verification

Prefer `pnpm run self:plan` for self-plan-only changes. Use `pnpm test`, `pnpm run build`, or `pnpm run check` when parser, resolver, provider, or shared package code changed.
