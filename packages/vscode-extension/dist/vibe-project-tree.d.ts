import * as vscode from "vscode";
import { type VibeProjectTreeItem } from "./vibe-project.js";
type VibeProjectTreeNode = VibeProjectTreeItem;
export declare class VibeProjectTreeDataProvider implements vscode.TreeDataProvider<VibeProjectTreeNode> {
    private readonly getWorkspaceRoot;
    private readonly didChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<VibeProjectTreeItem | undefined>;
    constructor(getWorkspaceRoot: () => string | undefined);
    refresh(): void;
    getTreeItem(element: VibeProjectTreeNode): vscode.TreeItem;
    getChildren(element?: VibeProjectTreeNode): Promise<VibeProjectTreeNode[]>;
}
export {};
//# sourceMappingURL=vibe-project-tree.d.ts.map