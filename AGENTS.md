# Vibe Agent Guide

Use this file as the repo-local contract for OpenAI Codex, especially from the
Codex VS Code extension.

## Source Of Truth

- Active repo: `C:\vibe`.
- Reference-only repo: `C:\Hive\vibe`, unless the user explicitly asks for a
  comparison.
- Self-plan source: `examples/vibe-self.vibe`.
- Generated self-plan: `docs/examples/vibe-self-plan.json`. Regenerate it with
  `pnpm run self:plan`; do not hand-edit it.
- Shared adapter contract: `plugins/vibe-workbench/shared/vibe-contract.md`.

## First Moves

1. Run `git status --short --branch`.
2. Read `README.md`, `docs/local-toolkit.md`, and
   `plugins/vibe-workbench/shared/vibe-contract.md`.
3. For a visible workspace check, run:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_repo_snapshot.ps1
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_lane_inventory.ps1
```

## Codex VS Code Flow

- Use `/local` for edits in this workspace.
- Use `/cloud` only when the user wants remote execution.
- Use `/review` for uncommitted changes or branch comparison.
- Use Command Palette command `Vibe: Admin Workspace` from the local Vibe VS
  Code extension to run repo snapshot, lane inventory, self-plan checks, and
  `pnpm run check`.
- Keep work scoped to the requested lane or adapter.
- Prefer report-only checks before adding installation, authentication, hooks,
  or external-service side effects.

## Verification

- Parser/self-plan changes: `pnpm --filter @vibe/language test` and
  `pnpm run self:plan`.
- VS Code extension changes: `pnpm --filter vibe-vscode test` and
  `pnpm --filter vibe-vscode build`.
- Broad repo changes: `pnpm run check`.
