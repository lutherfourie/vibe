# VS Code Agent Workflow

**Status:** First working bridge
**Date:** 2026-05-16

This is the smallest useful path for administering `C:\vibe` from VS Code with
OpenAI Codex and Anthropic Claude Code.

## What The Official Docs Imply

- Codex has a VS Code extension that can run side by side in the IDE or
  delegate to Codex Cloud. It also exposes command-palette commands, `/local`,
  `/cloud`, `/review`, and shared Codex CLI configuration.
- Claude Code has a VS Code extension with a panel, permissions, diffs,
  terminal integration, MCP management, git workflows, and a CLI bridge through
  `claude` or `/ide`.

The practical Vibe layer should therefore be repo-local:

- `AGENTS.md` for Codex.
- `CLAUDE.md` for Claude Code.
- `.vscode/extensions.json` for recommended agent extensions.
- `.vscode/tasks.json` and `Vibe: Admin Workspace` for visible checks.
- `plugins/vibe-workbench/` for portable Codex and Claude workflow skills.

Source links:

- OpenAI Codex IDE extension: https://developers.openai.com/codex/ide
- OpenAI Codex IDE commands: https://developers.openai.com/codex/ide/commands
- OpenAI Codex IDE settings: https://developers.openai.com/codex/ide/settings
- Claude Code VS Code integration: https://code.claude.com/docs/en/ide-integrations

## First Visible Demo

1. Open `C:\vibe` in VS Code.
2. Install the recommended extensions when VS Code prompts:
   `openai.chatgpt` and `anthropic.claude-code`.
3. Run `Run Vibe VS Code Extension` from Run and Debug. This starts an
   Extension Development Host for `packages/vscode-extension`.
4. Open Command Palette and run `Vibe: Admin Workspace`.
5. Choose `Vibe: Lane Inventory`.

Expected result: a `Vibe Admin` terminal opens and prints the lanes from
`examples/vibe-self.vibe`, including `target`, `reads`, `owns`, `verify`, and
`approval` where present.

## Prompts To Try

Codex extension:

```text
/local
Use AGENTS.md. Run the Vibe repo snapshot and explain the safest next workspace
administration slice.
```

Claude Code extension:

```text
Use CLAUDE.md. Run the Vibe lane inventory and tell me which lane should be
implemented next from VS Code.
```

## Boundaries

- Do not put credentials in repo files.
- Do not enable hooks, MCP servers, or global config as a side effect of opening
  the workspace.
- Keep Vibe-level concepts portable. VS Code, Codex, Claude Code, MCP, GitHub,
  and cloud agents are adapter surfaces.
