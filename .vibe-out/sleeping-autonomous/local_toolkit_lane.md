# Vibe Lane Handoff: local_toolkit_lane

Repo: C:/vibe
Self-plan source: examples/vibe-self.vibe
Target surface: surface.codex.local
Write scope: docs/local-toolkit.md go/** packages/**

Read first:
- README.md
- docs/fresh-start.md
- examples/vibe-self.vibe

Goal:
small vibe CLI plan for doctor, lanes, handoff, verify, and memory

Verification:
- pnpm run self:plan
- pnpm test
- pnpm run build

Approval: human.before_commit

Operating constraints:
- Keep edits inside the declared write scope.
- Regenerate docs/examples/vibe-self-plan.json with `pnpm run self:plan` only when examples/vibe-self.vibe changes.
- Run the lane verification commands before handoff.
