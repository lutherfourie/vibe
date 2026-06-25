import { type Project } from "../generated/ast.js";
export interface VibeSelfPlan {
    name: string;
    source: string;
    repo?: string;
    providers: SelfProvider[];
    routes: Record<string, string>;
    fallback?: string;
    surfaces: SelfSurface[];
    agents: SelfAgent[];
    lanes: SelfLane[];
    gates: SelfGate[];
    autonomousSessions: SelfAutonomousSession[];
    rules: SelfRule[];
    directors: SelfRule[];
    notes: string[];
}
export interface SelfGuard {
    condition: string;
    assignments: Record<string, unknown>;
}
export interface SelfRule {
    name: string;
    fields: Record<string, unknown>;
    guards: SelfGuard[];
}
export interface SelfAutonomousSession {
    name: string;
    description?: string;
    laneCount: number;
    checkpointCount: number;
    metadata: Record<string, unknown>;
}
export interface SelfSurface {
    name: string;
    kind?: string;
    mode?: string;
    metadata: Record<string, unknown>;
}
export interface SelfProvider {
    name: string;
    mode?: string;
    model?: string;
    metadata: Record<string, unknown>;
}
export interface SelfAgent {
    name: string;
    persona?: string;
    memory?: string;
    harness?: string;
    uses: string[];
}
export interface SelfLane {
    name: string;
    impl?: string;
    owns?: string;
    emits?: string;
    target?: string;
    reads?: string[];
    verify?: string[];
    approval?: string;
    metadata: Record<string, unknown>;
}
export interface SelfGate {
    name: string;
    impl?: string;
    owns?: string;
    emits?: string;
    metadata: Record<string, unknown>;
}
export declare function extractSelfPlanFromSource(source: string, options?: {
    sourceName?: string;
    uri?: string;
    name?: string;
}): Promise<VibeSelfPlan>;
export declare function extractSelfPlan(project: Project, options?: {
    sourceName?: string;
    name?: string;
}): VibeSelfPlan;
//# sourceMappingURL=self-plan.d.ts.map