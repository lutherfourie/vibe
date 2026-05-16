/**
 * vibe-vscode — extension entry point.
 *
 * Phase 1 scaffold: starts the Langium-emitted language server over node-ipc
 * so VS Code gets parse diagnostics and syntax highlighting for `.vibe`
 * files, then layers a small local cockpit over the current repo contract.
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
import { VibeProjectTreeDataProvider } from "./vibe-project-tree.js";
import {
  buildAgentsPreview,
  createVibeProjectFiles,
  parseVibeFileToState,
  projectSummary,
} from "./vibe-workspace.js";
import { readVibeProjectState } from "./vibe-project.js";

let client: LanguageClient | undefined;
let statusBar: vscode.StatusBarItem | undefined;

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
  const projectTree = new VibeProjectTreeDataProvider(getWorkspaceRoot);
  const vibeStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar = vibeStatusBar;
  vibeStatusBar.name = "Vibe";
  vibeStatusBar.command = "vibe.showProjectSummary";
  vibeStatusBar.tooltip = "Show Vibe project summary";

  const stateWatcher = vscode.workspace.createFileSystemWatcher("**/.vibe/state.json");
  const refreshVisibleState = () => {
    projectTree.refresh();
    void refreshVibeStatusBar();
  };

  context.subscriptions.push(
    { dispose: () => void client?.stop() },
    vibeStatusBar,
    stateWatcher,
    stateWatcher.onDidChange(refreshVisibleState),
    stateWatcher.onDidCreate(refreshVisibleState),
    stateWatcher.onDidDelete(refreshVisibleState),
    vscode.window.createTreeView("vibe.now", {
      treeDataProvider: projectTree,
      showCollapseAll: true,
    }),
    vscode.commands.registerCommand("vibe.admin", () => showVibeAdminPicker()),
    vscode.commands.registerCommand("vibe.refreshLanes", () => projectTree.refresh()),
    vscode.commands.registerCommand("vibe.showCliLanes", () => runVibeAdminAction("cli-lanes")),
    vscode.commands.registerCommand("vibe.generateLaneGraph", () => runVibeAdminAction("lane-graph")),
    vscode.commands.registerCommand("vibe.serveAdmin", () => runVibeAdminAction("local-admin-host")),
    vscode.commands.registerCommand("vibe.init", () => createProject("generic", projectTree)),
    vscode.commands.registerCommand("vibe.createGameSpreeContract", () => createProject("gamespree", projectTree)),
    vscode.commands.registerCommand("vibe.createGameSpreeVibeFile", () => createProject("gamespree", projectTree)),
    vscode.commands.registerCommand("vibe.parseCurrentFile", () => parseCurrentFile(projectTree)),
    vscode.commands.registerCommand("vibe.showProjectSummary", () => showProjectSummary()),
    vscode.commands.registerCommand("vibe.buildAgentsPreview", () => buildAgentsPreviewCommand()),
    vscode.commands.registerCommand("vibe.build", () => buildAgentsPreviewCommand()),
    vscode.commands.registerCommand("vibe.sync", () => parseCurrentFile(projectTree)),
    vscode.commands.registerCommand("vibe.openVaultInObsidian", () => openWorkspaceFile(".vibe/notes.md")),
  );
  void refreshVibeStatusBar();
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

async function createProject(
  kind: "generic" | "gamespree",
  tree: VibeProjectTreeDataProvider,
): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return;

  const written = await createVibeProjectFiles(workspaceRoot, kind);
  tree.refresh();
  void refreshVibeStatusBar();
  await openWorkspaceFile(".vibe/project.vibe");
  void vscode.window.showInformationMessage(
    written.length > 0
      ? `Vibe project files created: ${written.length}`
      : "Vibe project files already exist.",
  );
}

async function parseCurrentFile(tree: VibeProjectTreeDataProvider): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  const editor = vscode.window.activeTextEditor;
  if (!workspaceRoot || !editor) return;

  if (editor.document.languageId !== "vibe") {
    void vscode.window.showErrorMessage("Open a .vibe file before parsing.");
    return;
  }

  try {
    await parseVibeFileToState(
      workspaceRoot,
      editor.document.uri.fsPath,
      editor.document.getText(),
    );
    tree.refresh();
    void refreshVibeStatusBar();
    void vscode.window.showInformationMessage("Vibe state updated at .vibe/state.json.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Vibe parse failed: ${message}`);
  }
}

async function showProjectSummary(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return;

  const document = await vscode.workspace.openTextDocument({
    content: await projectSummary(workspaceRoot),
    language: "markdown",
  });
  await vscode.window.showTextDocument(document);
}

async function buildAgentsPreviewCommand(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return;

  const outPath = await buildAgentsPreview(workspaceRoot);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(outPath));
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

async function refreshVibeStatusBar(): Promise<void> {
  if (!statusBar) return;

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    statusBar.hide();
    return;
  }

  try {
    const state = await readVibeProjectState(workspaceRoot);
    const routeCount = Object.keys(state.routes ?? {}).length;
    const laneCount = state.lanes?.length ?? 0;
    const gateCount = state.gates?.length ?? 0;
    statusBar.text = `$(symbol-misc) Vibe: ${state.name}`;
    statusBar.tooltip = [
      `Vibe project: ${state.name}`,
      `${routeCount} routes`,
      `${laneCount} lanes`,
      `${gateCount} gates`,
    ].join("\n");
    statusBar.show();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusBar.text = "$(warning) Vibe";
    statusBar.tooltip = `Vibe state unavailable: ${message}`;
    statusBar.show();
  }
}
