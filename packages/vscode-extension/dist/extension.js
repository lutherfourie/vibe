"use strict";
/**
 * vibe-vscode — extension entry point.
 *
 * Phase 1 scaffold: starts the Langium-emitted language server over node-ipc
 * so VS Code gets parse diagnostics and syntax highlighting for `.vibe`
 * files, then layers a small local cockpit over the current repo contract.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const node_js_1 = require("vscode-languageclient/node.js");
const vibe_admin_js_1 = require("./vibe-admin.js");
const vibe_project_tree_js_1 = require("./vibe-project-tree.js");
const vibe_workspace_js_1 = require("./vibe-workspace.js");
const vibe_project_js_1 = require("./vibe-project.js");
let client;
let statusBar;
function activate(context) {
    const serverModule = context.asAbsolutePath(path.join("node_modules", "@vibe", "language", "dist", "language-server.js"));
    const serverOptions = {
        run: { module: serverModule, transport: node_js_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_js_1.TransportKind.ipc,
            options: { execArgv: ["--nolazy", "--inspect=6009"] },
        },
    };
    const clientOptions = {
        documentSelector: [{ scheme: "file", language: "vibe" }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher("**/*.vibe"),
        },
    };
    client = new node_js_1.LanguageClient("vibe", "Vibe Language Server", serverOptions, clientOptions);
    client.start();
    const projectTree = new vibe_project_tree_js_1.VibeProjectTreeDataProvider(getWorkspaceRoot);
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
    context.subscriptions.push({ dispose: () => void client?.stop() }, vibeStatusBar, stateWatcher, stateWatcher.onDidChange(refreshVisibleState), stateWatcher.onDidCreate(refreshVisibleState), stateWatcher.onDidDelete(refreshVisibleState), vscode.window.createTreeView("vibe.now", {
        treeDataProvider: projectTree,
        showCollapseAll: true,
    }), vscode.commands.registerCommand("vibe.admin", () => showVibeAdminPicker()), vscode.commands.registerCommand("vibe.refreshLanes", () => projectTree.refresh()), vscode.commands.registerCommand("vibe.showCliLanes", () => runVibeAdminAction("cli-lanes")), vscode.commands.registerCommand("vibe.generateLaneGraph", () => runVibeAdminAction("lane-graph")), vscode.commands.registerCommand("vibe.serveAdmin", () => runVibeAdminAction("local-admin-host")), vscode.commands.registerCommand("vibe.init", () => createProject("generic", projectTree)), vscode.commands.registerCommand("vibe.createGameSpreeContract", () => createProject("gamespree", projectTree)), vscode.commands.registerCommand("vibe.createGameSpreeVibeFile", () => createProject("gamespree", projectTree)), vscode.commands.registerCommand("vibe.parseCurrentFile", () => parseCurrentFile(projectTree)), vscode.commands.registerCommand("vibe.showProjectSummary", () => showProjectSummary()), vscode.commands.registerCommand("vibe.buildAgentsPreview", () => buildAgentsPreviewCommand()), vscode.commands.registerCommand("vibe.build", () => buildAgentsPreviewCommand()), vscode.commands.registerCommand("vibe.sync", () => parseCurrentFile(projectTree)), vscode.commands.registerCommand("vibe.openVaultInObsidian", () => openWorkspaceFile(".vibe/notes.md")));
    void refreshVibeStatusBar();
}
function deactivate() {
    return client?.stop();
}
async function showVibeAdminPicker() {
    const selected = await vscode.window.showQuickPick(vibe_admin_js_1.VIBE_ADMIN_ACTIONS.map((action) => ({
        label: action.label,
        detail: action.detail,
        action,
    })), {
        title: "Vibe Admin Workspace",
        placeHolder: "Run a Vibe workspace command",
    });
    if (!selected)
        return;
    runVibeAdminAction(selected.action);
}
function runVibeAdminAction(actionOrId) {
    const action = typeof actionOrId === "string" ? (0, vibe_admin_js_1.findVibeAdminAction)(actionOrId) : actionOrId;
    runWorkspaceCommand((workspaceRoot) => (0, vibe_admin_js_1.terminalCommandForAction)(action, workspaceRoot));
}
function runWorkspaceCommand(commandOrFactory) {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot)
        return;
    const command = typeof commandOrFactory === "string"
        ? commandOrFactory
        : commandOrFactory(workspaceRoot);
    const terminal = vscode.window.createTerminal({
        name: "Vibe Admin",
        cwd: workspaceRoot,
    });
    terminal.show();
    terminal.sendText(command);
}
async function openWorkspaceFile(relativePath) {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot)
        return;
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(workspaceRoot, relativePath)));
    await vscode.window.showTextDocument(document);
}
async function createProject(kind, tree) {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot)
        return;
    const written = await (0, vibe_workspace_js_1.createVibeProjectFiles)(workspaceRoot, kind);
    tree.refresh();
    void refreshVibeStatusBar();
    await openWorkspaceFile(".vibe/project.vibe");
    void vscode.window.showInformationMessage(written.length > 0
        ? `Vibe project files created: ${written.length}`
        : "Vibe project files already exist.");
}
async function parseCurrentFile(tree) {
    const workspaceRoot = getWorkspaceRoot();
    const editor = vscode.window.activeTextEditor;
    if (!workspaceRoot || !editor)
        return;
    if (editor.document.languageId !== "vibe") {
        void vscode.window.showErrorMessage("Open a .vibe file before parsing.");
        return;
    }
    try {
        await (0, vibe_workspace_js_1.parseVibeFileToState)(workspaceRoot, editor.document.uri.fsPath, editor.document.getText());
        tree.refresh();
        void refreshVibeStatusBar();
        void vscode.window.showInformationMessage("Vibe state updated at .vibe/state.json.");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Vibe parse failed: ${message}`);
    }
}
async function showProjectSummary() {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot)
        return;
    const document = await vscode.workspace.openTextDocument({
        content: await (0, vibe_workspace_js_1.projectSummary)(workspaceRoot),
        language: "markdown",
    });
    await vscode.window.showTextDocument(document);
}
async function buildAgentsPreviewCommand() {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot)
        return;
    const outPath = await (0, vibe_workspace_js_1.buildAgentsPreview)(workspaceRoot);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(outPath));
    await vscode.window.showTextDocument(document);
}
function getWorkspaceRoot() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        void vscode.window.showErrorMessage("Open the C:\\vibe workspace first.");
        return undefined;
    }
    return workspaceRoot;
}
async function refreshVibeStatusBar() {
    if (!statusBar)
        return;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        statusBar.hide();
        return;
    }
    try {
        const state = await (0, vibe_project_js_1.readVibeProjectState)(workspaceRoot);
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        statusBar.text = "$(warning) Vibe";
        statusBar.tooltip = `Vibe state unavailable: ${message}`;
        statusBar.show();
    }
}
//# sourceMappingURL=extension.js.map