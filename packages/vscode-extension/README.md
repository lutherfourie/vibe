# vibe-vscode

VS Code extension for [Vibe](../..) — the unified vibecode language.

**Status:** thin but usable. v0 scope per the architecture spec ([`docs/superpowers/specs/2026-05-13-vibe-architecture.md`](../../docs/superpowers/specs/2026-05-13-vibe-architecture.md) §2.4):

- TextMate grammar for `.vibe` syntax highlighting (currently a placeholder; will be revisited per library survey — likely tree-sitter for live/incremental highlighting)
- Command palette: `Vibe: Admin Workspace`, `Vibe: Init Project`, `Vibe: Build`, `Vibe: Sync`, `Vibe: Open Vault in Obsidian`
- `Vibe: Admin Workspace` opens a picker that runs the Vibe Workbench repo snapshot, lane inventory, self-plan check, self-plan regeneration, or full repo check in a VS Code terminal.
- `.vibe/` tree view in sidebar
- Diagnostics sourced from `vibe build`
- Hover-based LLM resolver preview with variance metadata

Full LSP, autocomplete, and webview graph view defer to Phase 3+.

Real implementation lands after the library survey at [`docs/superpowers/research/2026-05-13-library-survey.md`](../../docs/superpowers/research/2026-05-13-library-survey.md) confirms the parser + LSP toolkit (likely Langium or Lezer + custom LSP).

## Local Admin Demo

1. Open this package in the VS Code Extension Development Host.
2. Open Command Palette.
3. Run `Vibe: Admin Workspace`.
4. Choose `Vibe: Lane Inventory`.

The command opens a `Vibe Admin` terminal and runs the same report-only script
used by the Codex and Claude Code workbench plugin.
