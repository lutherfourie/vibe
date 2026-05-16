# Vibe Claude Code Guide

Use this file as the repo-local contract for Anthropic Claude Code in VS Code
or in the integrated terminal.

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
3. Run a report-only check:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_repo_snapshot.ps1
```

## Claude Code VS Code Flow

- Use the Claude Code panel for normal work.
- Use the integrated terminal for CLI-only features:

```powershell
claude --plugin-dir .\plugins\vibe-workbench
```

- If launched outside VS Code, run `/ide` inside Claude Code to connect the
  session back to the editor.
- Prefer Plan mode for broad changes.
- Use the Vibe Workbench plugin skills when available:
  `/vibe-workbench:vibe-orient`, `/vibe-workbench:vibe-self-plan`,
  `/vibe-workbench:vibe-handoff`, and `/vibe-workbench:vibe-superpowers`.
- Keep implementation scoped to the requested lane or adapter.

## Verification

- Parser/self-plan changes: `pnpm --filter @vibe/language test` and
  `pnpm run self:plan`.
- VS Code extension changes: `pnpm --filter vibe-vscode test` and
  `pnpm --filter vibe-vscode build`.
- Broad repo changes: `pnpm run check`.
