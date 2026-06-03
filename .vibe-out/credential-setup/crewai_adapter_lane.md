# Vibe Lane Handoff: crewai_adapter_lane

Repo: C:/vibe
Self-plan source: examples/vibe-self.vibe
Target surface: surface.crewai.local
Write scope: docs/superpowers/research/2026-05-16-vibe-crewai-integration-notes.md examples/vibe-self.vibe

Read first:
- docs/superpowers/research/2026-05-15-vibe-agentic-iac-framework-map.md
- docs/superpowers/research/2026-05-16-vibe-crewai-integration-notes.md
- examples/vibe-self.vibe

Goal:
report-only CrewAI adapter shape; no credentials, install, or runtime MCP changes

Verification:
- pnpm run self:plan
- pnpm run vibe:lanes
- pnpm run check

Approval: human.before_runtime

Operating constraints:
- Keep edits inside the declared write scope.
- Regenerate docs/examples/vibe-self-plan.json with `pnpm run self:plan` only when examples/vibe-self.vibe changes.
- Run the lane verification commands before handoff.
