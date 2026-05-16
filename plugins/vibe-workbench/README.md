# Vibe Workbench

Assistant integrations for `C:\vibe`.

This directory packages the same Vibe workflow contract for both Codex and Claude Code. The goal is practical copilot integration, not a generic placeholder plugin.

## What It Provides

- Codex plugin metadata in `.codex-plugin/plugin.json`.
- Codex skills in `codex-skills/`:
  - `vibe-orient`
  - `vibe-self-plan`
  - `vibe-handoff`
  - `vibe-superpowers`
- Claude Code plugin metadata in `.claude-plugin/plugin.json`.
- Claude Code skills in `claude-skills/`, namespaced as `/vibe-workbench:<skill>` when loaded as a plugin.
- A read-only Claude Code subagent in `claude-agents/vibe-lane-reviewer.md`.
- Shared rules in `shared/vibe-contract.md`.
- Report-only helper scripts in `scripts/`.

## Useful Commands

From `C:\vibe`:

```powershell
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_repo_snapshot.ps1
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_lane_inventory.ps1
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_self_plan_check.ps1
powershell -ExecutionPolicy Bypass -File plugins\vibe-workbench\scripts\vibe_superpowers_check.ps1
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
/vibe-workbench:vibe-superpowers plan the next local toolkit slice
```

The `vibe-lane-reviewer` agent should also appear in `/agents`.
