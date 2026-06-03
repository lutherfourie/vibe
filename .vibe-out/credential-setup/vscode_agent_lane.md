# Vibe Lane Handoff: vscode_agent_lane

Repo: C:/vibe
Self-plan source: examples/vibe-self.vibe
Target surface: surface.vscode.agent_admin
Write scope: AGENTS.md CLAUDE.md .vscode/** packages/vscode-extension/** docs/vscode-agent-workflow.md

Read first:
- AGENTS.md
- CLAUDE.md
- .vscode/tasks.json
- packages/vscode-extension/src/extension.ts

Goal:
VS Code command palette and Codex/Claude extension administration loop

Verification:
- pnpm --filter vibe-vscode test
- pnpm --filter vibe-vscode build
- pnpm run check

Approval: human.before_commit

Operating constraints:
- Keep edits inside the declared write scope.
- Regenerate docs/examples/vibe-self-plan.json with `pnpm run self:plan` only when examples/vibe-self.vibe changes.
- Run the lane verification commands before handoff.
