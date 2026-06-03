# Vibe Workbench

Assistant integrations for the Vibe repository.

This directory packages the same Vibe workflow contract for both Codex and Claude Code. The goal is practical copilot integration, not a generic placeholder plugin.

For disciplined planning, debugging, review, and verification, the plugin relies on the **Superpowers** plugin's skills directly (`superpowers:writing-plans`, `superpowers:systematic-debugging`, `superpowers:requesting-code-review`, `superpowers:verification-before-completion`, etc.) rather than mirroring them.

## What It Provides

- Claude Code plugin manifest in `.claude-plugin/plugin.json`.
- Claude Code skills in `skills/`, namespaced as `/vibe-workbench:<skill>` when loaded as a plugin:
  - `vibe-orient`
  - `vibe-self-plan`
  - `vibe-handoff`
  - `vibe-autonomous` — start or resume a long-horizon autonomous lane
  - `vibe-checkpoint` — record a durable `PROGRESS.md` checkpoint
- A read-only Claude Code subagent in `agents/vibe-lane-reviewer.md`.
- A `SessionStart` hook in `hooks/hooks.json` that runs the repo snapshot.
- Codex plugin manifest in `.codex-plugin/plugin.json` with mirrored skills in `codex-skills/`.
- Shared rules in `shared/vibe-contract.md`.
- Report-only helper scripts in `scripts/`.

## Useful Commands

From the active Vibe repository:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_repo_snapshot.ps1
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_lane_inventory.ps1
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_self_plan_check.ps1
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_skills_drift_check.ps1
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_autonomous_status.ps1
```

Regenerate the self-plan only when intended:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_self_plan_check.ps1 -Regenerate
```

## Claude Code Local Test

**Temporarily disabled** (claude CLI is being used by another local project; do not interfere from here).
See `.claude.disabled/`, commented entry in `.vscode/extensions.json`, disabled 'claude' provider registration in Go serve, and notes in `docs/local-toolkit.md`.

When re-enabled for this project, the test command will be:

```powershell
claude --plugin-dir .\plugins\vibe-workbench
```

Then try the /vibe-workbench:* skills etc.

**Preferred now: use Codex + Grok extensively** (codex-skills/ in the plugin, `codex exec`, and this Grok session for parallel development of recommended features per self-plan lanes).
Codex skills (vibe-orient, vibe-checkpoint, vibe-handoff, vibe-self-plan, vibe-autonomous) are available via Codex plugin surface.
