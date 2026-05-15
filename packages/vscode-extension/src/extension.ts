/**
 * vibe-vscode — extension entry point.
 *
 * Phase 1 scaffold: starts the Langium-emitted language server over node-ipc
 * so VS Code gets parse diagnostics and syntax highlighting for `.vibe`
 * files. Tree view, commands, and hover-based LLM resolver preview land in
 * later commits — the activate function stays intentionally minimal.
 */

import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node.js";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(
    path.join(
      "node_modules",
      "@vibe",
      "language",
      "dist",
      "language-server.js",
    ),
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "vibe" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.vibe"),
    },
  };

  client = new LanguageClient(
    "vibe",
    "Vibe Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();
  context.subscriptions.push({ dispose: () => void client?.stop() });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
