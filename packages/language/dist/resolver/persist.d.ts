import { SupabaseClient } from "@supabase/supabase-js";
import type { VibePlan } from "./schemas.js";
export type PersistTelemetryRow = {
    session_id: string;
    kind: string;
    source: string;
    payload: Record<string, unknown>;
};
/** Build the telemetry rows a successful persist would emit (for tests + dry-run). */
export declare function buildPersistTelemetryRows(plan: VibePlan, sessionId: string): PersistTelemetryRow[];
export declare function getSupabaseClient(): SupabaseClient | null;
/**
 * Persist a resolved VibePlan (autonomous session) + its checkpoints etc to Supabase.
 * Called from pipeline after successful resolve when kind=plan.
 * Idempotent on session id if present.
 * Falls back to no-op + console if no client (local dev without env).
 */
export declare function persistVibePlan(plan: VibePlan): Promise<{
    persisted: boolean;
    sessionId?: string;
    error?: string;
}>;
//# sourceMappingURL=persist.d.ts.map