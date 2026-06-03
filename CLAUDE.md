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

The repo-snapshot script runs automatically at SessionStart via
`.claude/settings.json`. If you need to re-run it mid-session, use the
`/vibe-workbench:vibe-orient` skill or the script directly:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_repo_snapshot.ps1
```

Then read `README.md`, `docs/local-toolkit.md`, and
`plugins/vibe-workbench/shared/vibe-contract.md` if not already loaded.

## Claude Code VS Code Flow

- Use the Claude Code panel for normal work. The `vibe-workbench` plugin is
  auto-loaded from the local `vibecade` marketplace declared in
  `.claude-plugin/marketplace.json` and enabled by `.claude/settings.json`
  (as `vibe-workbench@vibecade`). The plugin ships its own `SessionStart`
  hook, so the repo snapshot runs automatically.
- If launched outside VS Code, run `/ide` inside Claude Code to connect the
  session back to the editor.
- Prefer Plan mode for broad changes.
- Use the Vibe Workbench plugin skills when available:
  `/vibe-workbench:vibe-orient`, `/vibe-workbench:vibe-self-plan`,
  `/vibe-workbench:vibe-handoff`, `/vibe-workbench:vibe-autonomous`,
  `/vibe-workbench:vibe-checkpoint`.
- For long-horizon, durable work, use **autonomous lanes**: declare a lane as
  `mode: autonomous` (lane-plan JSON), generate its scoped brief with
  `vibe handoff --plan`, and keep `PROGRESS.md` current with `vibe checkpoint` /
  `vibe resume`. See `docs/autonomous-lanes.md`.
- For planning, debugging, review, or verification, invoke Superpowers skills
  directly (`superpowers:writing-plans`,
  `superpowers:systematic-debugging`, `superpowers:requesting-code-review`,
  `superpowers:verification-before-completion`). Save Vibe artifacts under
  `docs/superpowers/{plans,specs,research}/`.
- Keep implementation scoped to the requested lane or adapter.

## Verification

- Parser/self-plan changes: `pnpm --filter @vibe/language test` and
  `pnpm run self:plan`.
- VS Code extension changes: `pnpm --filter vibe-vscode test` and
  `pnpm --filter vibe-vscode build`.
- Broad repo changes: `pnpm run check`.

## Git Automation Contract

For routine work in this repo, do NOT prompt before:

- Pulling on a clean main or feature branch at the start of a session.
- Committing changes the user has already approved.
- Pushing the current feature branch (`git push -u origin HEAD`).
- Creating a PR via `gh pr create` with a structured summary and test plan.
- Enabling auto-merge with `gh pr merge <#> --auto --squash`.

After every commit on a non-main branch, push the branch and open a PR if one
does not already exist, then enable auto-merge with squash. Report the PR URL
in the assistant response.

Pause and confirm before destructive operations: `git push --force`, branch
deletion (`git branch -D`, `git push origin --delete`), history rewrites
(`git rebase -i`, `git reset --hard` past committed work), or anything that
bypasses the PR flow on `main`.

If CI checks exist on a PR, auto-merge will wait for them to pass; if none are
required, the PR merges immediately, which is the intended behavior.
