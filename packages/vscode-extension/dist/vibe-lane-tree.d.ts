import * as vscode from "vscode";
import { type VibeLaneTreeItem } from "./vibe-lanes.js";
type VibeLaneTreeNode = {
    kind: "lane";
    lane: VibeLaneTreeItem;
} | {
    kind: "detail";
    label: string;
    value: string;
};
export declare class VibeLaneTreeDataProvider implements vscode.TreeDataProvider<VibeLaneTreeNode> {
    private readonly getWorkspaceRoot;
    private readonly didChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<VibeLaneTreeNode | undefined>;
    constructor(getWorkspaceRoot: () => string | undefined);
    refresh(): void;
    getTreeItem(element: VibeLaneTreeNode): vscode.TreeItem;
    getChildren(element?: VibeLaneTreeNode): Promise<VibeLaneTreeNode[]>;
}
export {};
//# sourceMappingURL=vibe-lane-tree.d.ts.map