export type VibeAdminAction = {
    id: string;
    label: string;
    detail: string;
    kind: "script";
    script: string[];
    args?: string[];
} | {
    id: string;
    label: string;
    detail: string;
    kind: "shell";
    command: string;
};
export declare const VIBE_ADMIN_ACTIONS: VibeAdminAction[];
export declare function findVibeAdminAction(id: string): VibeAdminAction;
export declare function terminalCommandForAction(action: VibeAdminAction, workspaceRoot: string): string;
//# sourceMappingURL=vibe-admin.d.ts.map