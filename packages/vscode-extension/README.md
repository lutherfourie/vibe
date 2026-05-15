# vibe-vscode

VS Code extension for [Vibe](../..) — the unified vibecode language.

**Status:** stub. v0 scope per the architecture spec ([`docs/superpowers/specs/2026-05-13-vibe-architecture.md`](../../docs/superpowers/specs/2026-05-13-vibe-architecture.md) §2.4):

- TextMate grammar for `.vibe` syntax highlighting (currently a placeholder; will be revisited per library survey — likely tree-sitter for live/incremental highlighting)
- `.vibe/` tree view in sidebar
- Diagnostics sourced from `vibe build`
- Command palette: `Vibe: Init Project`, `Vibe: Build`, `Vibe: Sync`, `Vibe: Open Vault in Obsidian`
- Hover-based LLM resolver preview with variance metadata

Full LSP, autocomplete, and webview graph view defer to Phase 3+.

Real implementation lands after the library survey at [`docs/superpowers/research/2026-05-13-library-survey.md`](../../docs/superpowers/research/2026-05-13-library-survey.md) confirms the parser + LSP toolkit (likely Langium or Lezer + custom LSP).
