import { createClient } from "@supabase/supabase-js";
let _client = null;
/** Build the telemetry rows a successful persist would emit (for tests + dry-run). */
export function buildPersistTelemetryRows(plan, sessionId) {
    const session = plan.session;
    const rows = [
        {
            session_id: sessionId,
            kind: "plan_resolved",
            source: "resolver",
            payload: {
                version: plan.version,
                sourceFile: plan.sourceFile,
                generatedAt: plan.generatedAt,
            },
        },
        {
            session_id: sessionId,
            kind: "session_persisted",
            source: "resolver",
            payload: { name: session.name, resumeOnRestart: session.resumeOnRestart },
        },
    ];
    for (const lane of session.lanes ?? []) {
        rows.push({
            session_id: sessionId,
            kind: "lane_persisted",
            source: "resolver",
            payload: { laneId: lane.id, name: lane.name },
        });
    }
    for (const checkpoint of session.checkpoints ?? []) {
        rows.push({
            session_id: sessionId,
            kind: "checkpoint_persisted",
            source: "resolver",
            payload: { checkpointId: checkpoint.id, name: checkpoint.name },
        });
    }
    const backend = session.metadata?.backend;
    if (typeof backend === "string" && backend.trim()) {
        rows.push({
            session_id: sessionId,
            kind: "provider_used",
            source: "resolver",
            payload: { provider: backend },
        });
    }
    return rows;
}
export function getSupabaseClient() {
    if (_client)
        return _client;
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        return null;
    }
    _client = createClient(url, key, { auth: { persistSession: false } });
    return _client;
}
/**
 * Persist a resolved VibePlan (autonomous session) + its checkpoints etc to Supabase.
 * Called from pipeline after successful resolve when kind=plan.
 * Idempotent on session id if present.
 * Falls back to no-op + console if no client (local dev without env).
 */
export async function persistVibePlan(plan) {
    const client = getSupabaseClient();
    const session = plan.session;
    if (!client) {
        console.log("[vibe persist] no supabase client (set SUPABASE_URL + KEY); would persist session:", session.name);
        return { persisted: false };
    }
    try {
        // upsert session
        const { data: sess, error: sessErr } = await client
            .from("autonomous_sessions")
            .upsert({
            id: session.id,
            name: session.name,
            description: session.description,
            resume_on_restart: session.resumeOnRestart,
            metadata: session.metadata ?? {},
        }, { onConflict: "id" })
            .select()
            .single();
        if (sessErr)
            throw sessErr;
        const sessionId = sess.id;
        // lanes
        if (session.lanes?.length) {
            const laneRows = session.lanes.map((l, i) => ({
                id: l.id,
                session_id: sessionId,
                name: l.name,
                skills: l.skills ?? [],
                config: l.config ?? {},
            }));
            await client.from("lanes").upsert(laneRows, { onConflict: "id" });
        }
        // checkpoints (required)
        if (session.checkpoints?.length) {
            const cpRows = session.checkpoints.map((c) => ({
                id: c.id,
                session_id: sessionId,
                name: c.name,
                after: c.after,
                contract: c.contract,
                resume_strategy: c.resumeStrategy,
                metadata: c.metadata ?? {},
            }));
            await client.from("checkpoints").upsert(cpRows, { onConflict: "id" });
        }
        // optional self reviews / research
        if (session.selfReviews?.length) {
            const rvRows = session.selfReviews.map((r) => ({
                id: r.id,
                session_id: sessionId,
                perspective: r.perspective,
                criteria: r.criteria ?? [],
                required: r.required,
            }));
            await client.from("self_reviews").upsert(rvRows, { onConflict: "id" });
        }
        if (session.researchSteps?.length) {
            const rsRows = session.researchSteps.map((r) => ({
                id: r.id,
                session_id: sessionId,
                topic: r.topic,
                depth: r.depth,
                sources: r.sources ?? [],
                tools: r.tools ?? [],
            }));
            await client.from("research_steps").upsert(rsRows, { onConflict: "id" });
        }
        // event for the plan
        await client.from("lane_events").insert({
            session_id: sessionId,
            kind: "plan_resolved",
            payload: { version: plan.version, sourceFile: plan.sourceFile, generatedAt: plan.generatedAt },
        });
        // Telemetry (best effort). Hosted in same Supabase as C&C/state (simplest + dogfoods the platform).
        // Opt-in can be added later via env or plan flag; for now emit on every resolved plan so we get data.
        const telem = client.from("telemetry_events").insert({
            session_id: sessionId,
            kind: "plan_resolved",
            source: "resolver",
            payload: { version: plan.version, sourceFile: plan.sourceFile, generatedAt: plan.generatedAt },
        });
        Promise.resolve(telem).catch(() => { });
        return { persisted: true, sessionId };
    }
    catch (e) {
        console.error("[vibe persist] error:", e?.message || e);
        return { persisted: false, error: String(e?.message || e) };
    }
}
//# sourceMappingURL=persist.js.map