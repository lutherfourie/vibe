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
```

Regenerate the self-plan only when intended:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_self_plan_check.ps1 -Regenerate
```

## Claude Code Local Test

```powershell
claude --plugin-dir .\plugins\vibe-workbench
```

Then try:

```text
/vibe-workbench:vibe-orient
/vibe-workbench:vibe-self-plan
/vibe-workbench:vibe-handoff local toolkit lane
```

The `vibe-lane-reviewer` agent should also appear in `/agents`.
