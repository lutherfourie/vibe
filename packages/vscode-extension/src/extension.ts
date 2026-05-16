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
import {
  findVibeAdminAction,
  terminalCommandForAction,
  VIBE_ADMIN_ACTIONS,
  type VibeAdminAction,
} from "./vibe-admin.js";
import { VibeLaneTreeDataProvider } from "./vibe-lane-tree.js";

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
  const laneTree = new VibeLaneTreeDataProvider(getWorkspaceRoot);
  context.subscriptions.push(
    { dispose: () => void client?.stop() },
    vscode.window.createTreeView("vibe.lanes", {
      treeDataProvider: laneTree,
      showCollapseAll: true,
    }),
    vscode.commands.registerCommand("vibe.admin", () => showVibeAdminPicker()),
    vscode.commands.registerCommand("vibe.refreshLanes", () => laneTree.refresh()),
    vscode.commands.registerCommand("vibe.showCliLanes", () => runVibeAdminAction("cli-lanes")),
    vscode.commands.registerCommand("vibe.generateLaneGraph", () => runVibeAdminAction("lane-graph")),
    vscode.commands.registerCommand("vibe.serveAdmin", () => runVibeAdminAction("local-admin-host")),
    vscode.commands.registerCommand("vibe.init", () => openWorkspaceFile("examples/vibe-self.vibe")),
    vscode.commands.registerCommand("vibe.build", () => runWorkspaceCommand("pnpm run build")),
    vscode.commands.registerCommand("vibe.sync", () => runVibeAdminAction("regenerate-self-plan")),
    vscode.commands.registerCommand("vibe.openVaultInObsidian", () => {
      void vscode.window.showInformationMessage(
        "Vibe does not have an Obsidian vault command yet. Use Vibe: Admin Workspace for the active repo loop.",
      );
    }),
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

async function showVibeAdminPicker(): Promise<void> {
  const selected = await vscode.window.showQuickPick(
    VIBE_ADMIN_ACTIONS.map((action) => ({
      label: action.label,
      detail: action.detail,
      action,
    })),
    {
      title: "Vibe Admin Workspace",
      placeHolder: "Run a Vibe workspace command",
    },
  );

  if (!selected) return;
  runVibeAdminAction(selected.action);
}

function runVibeAdminAction(actionOrId: VibeAdminAction | string): void {
  const action =
    typeof actionOrId === "string" ? findVibeAdminAction(actionOrId) : actionOrId;
  runWorkspaceCommand((workspaceRoot) =>
    terminalCommandForAction(action, workspaceRoot),
  );
}

function runWorkspaceCommand(
  commandOrFactory: string | ((workspaceRoot: string) => string),
): void {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return;

  const command =
    typeof commandOrFactory === "string"
      ? commandOrFactory
      : commandOrFactory(workspaceRoot);
  const terminal = vscode.window.createTerminal({
    name: "Vibe Admin",
    cwd: workspaceRoot,
  });
  terminal.show();
  terminal.sendText(command);
}

async function openWorkspaceFile(relativePath: string): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return;

  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(workspaceRoot, relativePath)),
  );
  await vscode.window.showTextDocument(document);
}

function getWorkspaceRoot(): string | undefined {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    void vscode.window.showErrorMessage("Open the C:\\vibe workspace first.");
    return undefined;
  }

  return workspaceRoot;
}
