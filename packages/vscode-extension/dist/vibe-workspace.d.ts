import { type VibeSelfPlan } from "./vibe-project.js";
export type VibeProjectKind = "generic" | "gamespree";
export declare function createVibeProjectFiles(workspaceRoot: string, kind: VibeProjectKind): Promise<string[]>;
export declare function parseVibeFileToState(workspaceRoot: string, filePath: string, source: string): Promise<VibeSelfPlan>;
export declare function buildAgentsPreview(workspaceRoot: string): Promise<string>;
export declare function projectSummary(workspaceRoot: string): Promise<string>;
//# sourceMappingURL=vibe-workspace.d.ts.map