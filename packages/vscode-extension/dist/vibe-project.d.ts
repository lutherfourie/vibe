export interface VibeSelfPlan {
    name: string;
    source?: string;
    repo?: string;
    routes?: Record<string, string>;
    fallback?: string;
    surfaces?: VibeSurface[];
    agents?: VibeAgent[];
    lanes?: VibeLane[];
    gates?: VibeGate[];
    notes?: string[];
}
export interface VibeSurface {
    name: string;
    kind?: string;
    mode?: string;
}
export interface VibeAgent {
    name: string;
    persona?: string;
    memory?: string;
    harness?: string;
    uses?: string[];
}
export interface VibeLane {
    name: string;
    target?: string;
    reads?: string[];
    owns?: string;
    verify?: string[];
    approval?: string;
    emits?: string;
}
export interface VibeGate {
    name: string;
    owns?: string;
    emits?: string;
}
export interface VibeProjectTreeItem {
    id: string;
    label: string;
    description?: string;
    detail?: string;
    children?: VibeProjectTreeItem[];
}
export declare function projectTreeItemsFromSelfPlan(plan: VibeSelfPlan): VibeProjectTreeItem[];
export declare function readVibeProjectState(workspaceRoot: string): Promise<VibeSelfPlan>;
export declare function projectSummaryMarkdown(plan: VibeSelfPlan): string;
export declare function agentsPreviewMarkdown(plan: VibeSelfPlan): string;
export declare function genericProjectTemplate(projectName: string): string;
export declare function genericState(projectName: string, workspaceRoot: string): VibeSelfPlan;
export declare function gamespreeProjectTemplate(): string;
export declare function gamespreeState(workspaceRoot: string): VibeSelfPlan;
export declare function notesTemplate(projectName: string): string;
//# sourceMappingURL=vibe-project.d.ts.map