# vibe-vscode

VS Code extension for [Vibe](../..) — the unified vibecode language.

**Status:** Vibe Now local extension. It is intentionally a repo cockpit before
the full runtime exists.

- TextMate grammar for `.vibe` syntax highlighting (currently a placeholder; will be revisited per library survey — likely tree-sitter for live/incremental highlighting)
- Command palette: `Vibe: Admin Workspace`, `Vibe: Init Project`, `Vibe: Parse Current File`, `Vibe: Show Project Summary`, `Vibe: Build AGENTS Preview`, `Vibe: Create GameSpree/Pawfall Project Contract`, `Vibe: Sync`, `Vibe: Open Vault in Obsidian`
- `Vibe: Admin Workspace` opens a picker that runs the Vibe Workbench repo snapshot, lane inventory, unified Go CLI lane report, Mermaid graph generation, local admin host, self-plan check, self-plan regeneration, or full repo check in a VS Code terminal.
- `Vibe` tree view in Explorer, sourced from `.vibe/state.json` when present and falling back to `docs/examples/vibe-self-plan.json`.
- `Vibe: Build AGENTS Preview` writes `.vibe/generated/AGENTS.preview.md` from the visible project state.
- `Vibe: Create GameSpree/Pawfall Project Contract` creates `.vibe/project.vibe`, `.vibe/state.json`, and `.vibe/notes.md` for the GameSpree/Pawfall contract.
- Diagnostics sourced from `vibe build`
- Hover-based LLM resolver preview with variance metadata

Full autocomplete, live LLM hovers, agent execution, Obsidian vault generation,
and marketplace packaging defer to later slices.

Real implementation lands after the library survey at [`docs/superpowers/research/2026-05-13-library-survey.md`](../../docs/superpowers/research/2026-05-13-library-survey.md) confirms the parser + LSP toolkit (likely Langium or Lezer + custom LSP).

## Local Admin Demo

1. Open this package in the VS Code Extension Development Host, or install it as
   a local extension junction.
2. Open a repo with `.vibe/project.vibe` or `docs/examples/vibe-self-plan.json`.
3. Inspect the `Vibe` tree in Explorer.
4. Run `Vibe: Show Project Summary`.
5. Run `Vibe: Build AGENTS Preview`.

The command opens a `Vibe Admin` terminal and runs the same report-only script
or unified Go CLI used by the Codex and Claude Code workbench plugin.
