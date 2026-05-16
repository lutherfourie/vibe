import * as vscode from "vscode";
import {
  projectTreeItemsFromSelfPlan,
  readVibeProjectState,
  type VibeProjectTreeItem,
} from "./vibe-project.js";

type VibeProjectTreeNode = VibeProjectTreeItem;

export class VibeProjectTreeDataProvider
  implements vscode.TreeDataProvider<VibeProjectTreeNode>
{
  private readonly didChangeTreeData = new vscode.EventEmitter<
    VibeProjectTreeNode | undefined
  >();

  readonly onDidChangeTreeData = this.didChangeTreeData.event;

  constructor(private readonly getWorkspaceRoot: () => string | undefined) {}

  refresh(): void {
    this.didChangeTreeData.fire(undefined);
  }

  getTreeItem(element: VibeProjectTreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      element.children?.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.detail ?? element.description;
    item.contextValue = element.children?.length ? "vibeSection" : "vibeItem";
    return item;
  }

  async getChildren(element?: VibeProjectTreeNode): Promise<VibeProjectTreeNode[]> {
    if (element) return element.children ?? [];

    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) return [];

    return projectTreeItemsFromSelfPlan(await readVibeProjectState(workspaceRoot));
  }
}
