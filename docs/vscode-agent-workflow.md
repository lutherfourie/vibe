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
- `docs/examples/vibe-self-plan.json` as the shared lane source for Codex,
  Claude Code, VS Code, and the local Go CLI.

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
4. Open Explorer and inspect the `Vibe` tree.
5. Open Command Palette and run `Vibe: Admin Workspace`.
6. Choose `Vibe: CLI Lanes`, `Vibe: Generate Lane Graph`, or
   `Vibe: Local Admin Host`.

Expected result: a `Vibe Admin` terminal opens and prints the lanes from
`examples/vibe-self.vibe`, including `target`, `reads`, `owns`, `verify`, and
`approval` where present. The graph command writes
`docs/examples/vibe-lanes.mmd`. The local host command serves
`http://127.0.0.1:8787`.

## Vibe Now Commands

The extension is intentionally useful before the full runtime exists:

- `Vibe: Init Project` creates `.vibe/project.vibe`, `.vibe/state.json`, and
  `.vibe/notes.md` for the current repo when they are missing.
- `Vibe: Create GameSpree/Pawfall Project Contract` creates an opinionated
  GameSpree starter contract with Pawfall truths, lanes, and gates.
- `Vibe: Create GameSpree Vibe File` is a shorter alias for the same starter
  contract workflow.
- `Vibe: Parse Current File` parses the active `.vibe` file and refreshes
  `.vibe/state.json`.
- `Vibe: Show Project Summary` opens a readable snapshot of routes, agents,
  lanes, and gates.
- `Vibe: Build AGENTS Preview` writes
  `.vibe/generated/AGENTS.preview.md` from the current state.
- The `Vibe` status bar entry shows the active project and opens the project
  summary.

This is the repo-cockpit layer from the research notes: VS Code should tell you
what the repo believes, which agents are allowed to do what, and which gates
protect the work.

## Mermaid Lane Graph

The current graph is generated, not hand-maintained:

```powershell
pnpm run vibe:graph
```

The output is `docs/examples/vibe-lanes.mmd`, and the same graph is exposed by
the local admin host at `/vibe-lanes.mmd`.

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
