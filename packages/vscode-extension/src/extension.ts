// vibe-vscode — extension entry point.
//
// Scaffold only. The thin v0 feature set (tree view, diagnostics, commands,
// hover resolver preview) lands after the library survey settles the LSP +
// syntax-highlighting toolkit choices.

// Forward-compat: matches VS Code's ExtensionContext shape without depending
// on the `vscode` module yet (kept dependency-free until library choices
// land). Real activation logic replaces this in Phase 1.

interface ExtensionContextLike {
  readonly subscriptions: { push(item: { dispose(): unknown }): void };
}

export function activate(_context: ExtensionContextLike): void {
  // no-op until Phase 1
}

export function deactivate(): void {
  // no-op
}
