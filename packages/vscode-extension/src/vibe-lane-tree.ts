import * as vscode from "vscode";
import {
  readVibeLaneTreeItems,
  type VibeLaneTreeItem,
} from "./vibe-lanes.js";

type VibeLaneTreeNode =
  | {
      kind: "lane";
      lane: VibeLaneTreeItem;
    }
  | {
      kind: "detail";
      label: string;
      value: string;
    };

export class VibeLaneTreeDataProvider
  implements vscode.TreeDataProvider<VibeLaneTreeNode>
{
  private readonly didChangeTreeData = new vscode.EventEmitter<
    VibeLaneTreeNode | undefined
  >();

  readonly onDidChangeTreeData = this.didChangeTreeData.event;

  constructor(private readonly getWorkspaceRoot: () => string | undefined) {}

  refresh(): void {
    this.didChangeTreeData.fire(undefined);
  }

  getTreeItem(element: VibeLaneTreeNode): vscode.TreeItem {
    if (element.kind === "lane") {
      const item = new vscode.TreeItem(
        element.lane.label,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.id = element.lane.id;
      item.description = element.lane.description;
      item.tooltip = element.lane.detail;
      item.contextValue = "vibeLane";
      return item;
    }

    const item = new vscode.TreeItem(
      element.label,
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = element.value;
    item.tooltip = element.value;
    return item;
  }

  async getChildren(element?: VibeLaneTreeNode): Promise<VibeLaneTreeNode[]> {
    if (element?.kind === "lane") {
      return laneDetails(element.lane);
    }
    if (element) return [];

    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) return [];

    return (await readVibeLaneTreeItems(workspaceRoot)).map((lane) => ({
      kind: "lane",
      lane,
    }));
  }
}

function laneDetails(lane: VibeLaneTreeItem): VibeLaneTreeNode[] {
  const details: VibeLaneTreeNode[] = [];
  if (lane.target) {
    details.push({ kind: "detail", label: "target", value: lane.target });
  }
  if (lane.owns) {
    details.push({ kind: "detail", label: "owns", value: lane.owns });
  }
  if (lane.reads.length > 0) {
    details.push({ kind: "detail", label: "reads", value: lane.reads.join(", ") });
  }
  if (lane.verify.length > 0) {
    details.push({
      kind: "detail",
      label: "verify",
      value: lane.verify.join(" && "),
    });
  }
  if (lane.approval) {
    details.push({ kind: "detail", label: "approval", value: lane.approval });
  }
  return details;
}
