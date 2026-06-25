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
export declare function laneTreeItemsFromSelfPlan(plan: VibeSelfPlan): VibeLaneTreeItem[];
export declare function readVibeLaneTreeItems(workspaceRoot: string): Promise<VibeLaneTreeItem[]>;
//# sourceMappingURL=vibe-lanes.d.ts.map