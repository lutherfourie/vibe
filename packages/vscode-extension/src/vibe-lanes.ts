import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface VibeSelfPlan {
  lanes?: VibeSelfPlanLane[];
}

export interface VibeSelfPlanLane {
  name: string;
  target?: string;
  reads?: string[];
  owns?: string;
  verify?: string[];
  approval?: string;
  emits?: string;
}

export interface VibeLaneTreeItem {
  id: string;
  label: string;
  description?: string;
  detail?: string;
  target?: string;
  reads: string[];
  owns?: string;
  verify: string[];
  approval?: string;
}

export function laneTreeItemsFromSelfPlan(plan: VibeSelfPlan): VibeLaneTreeItem[] {
  return (plan.lanes ?? []).map((lane) => ({
    id: lane.name,
    label: lane.name,
    description: lane.target,
    detail: lane.emits,
    target: lane.target,
    reads: lane.reads ?? [],
    owns: lane.owns,
    verify: lane.verify ?? [],
    approval: lane.approval,
  }));
}

export async function readVibeLaneTreeItems(
  workspaceRoot: string,
): Promise<VibeLaneTreeItem[]> {
  const selfPlanPath = path.join(
    workspaceRoot,
    "docs",
    "examples",
    "vibe-self-plan.json",
  );
  const raw = await fs.readFile(selfPlanPath, "utf8");
  return laneTreeItemsFromSelfPlan(JSON.parse(raw) as VibeSelfPlan);
}
