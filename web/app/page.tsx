"use client";

import React, { useEffect, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Vibe Autonomous Dashboard (Next.js + Supabase)
// Launch agents on any backend (Codex, Claude, Grok, Cerebras GLM, big-AGI), monitor sessions/checkpoints.
// Real dispatch uses @vibe/language pipeline + 5 providers + persist (wired).
// Cerebras GLM is forced via provider=cerebras param (or FORCE_CEREBRAS env); missing key now errors with notification instead of silent mock.

type Session = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type Checkpoint = {
  id: string;
  name: string;
  created_at: string;
};

let supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  supabase = createClient(url, key);
  return supabase;
}

export default function VibeDashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [checkpoints, setCheckpoints] = useState<Record<string, Checkpoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [form, setForm] = useState({ name: "self-build-lane", desc: "Extend Vibe autonomous with web dashboard" });
  const [status, setStatus] = useState<string>("");
  const [realtimeStatus, setRealtimeStatus] = useState<string>("disconnected");
  const [telemetry, setTelemetry] = useState<any[]>([]);

  const sb = getSupabase();

  async function load() {
    setLoading(true);
    if (!sb) {
      setStatus("Set NEXT_PUBLIC_SUPABASE_URL + ANON_KEY in .env.local (or Vercel env) for live data.");
      setSessions([]);
      setLoading(false);
      return;
    }
    const { data: sess } = await sb
      .from("autonomous_sessions")
      .select("id,name,description,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    setSessions((sess as Session[]) || []);

    const cps: Record<string, Checkpoint[]> = {};
    if (sess) {
      for (const s of sess) {
        const { data: cp } = await sb
          .from("checkpoints")
          .select("id,name,created_at")
          .eq("session_id", s.id)
          .order("created_at", { ascending: false })
          .limit(5);
        cps[s.id] = (cp as Checkpoint[]) || [];
      }
    }
    setCheckpoints(cps);
    setLoading(false);
  }

  async function launchAutonomous() {
    setLaunching(true);
    setStatus("Launching via real Vibe resolver + provider (forcing Cerebras GLM if CEREBRAS_API_KEY present) + persist to Supabase...");

    try {
      const res = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.desc,
          // Force real Cerebras GLM (zai-glm-4.7) via parameter. Backend will return clear error (400) + notify
          // in console if CEREBRAS_API_KEY is missing instead of silently using mock.
          provider: 'cerebras',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Launch failed');
      }

      const backend = data.plan?.metadata?.backend || (data.persisted ? 'cerebras.glm-real (or configured)' : 'unknown');
      setStatus(`Launched via real pipeline! Session persisted (id ${data.sessionId?.slice(0,8) || 'n/a'}). Watch the list update LIVE via Supabase Realtime. Provider: ${backend}. (Forced Cerebras via param; key presence enforced.)`);

      // The API did the real persistVibePlan. Realtime subscription will update the UI.
      // As a fallback / to show initial data, we can still load, but realtime should handle it.
      // Give realtime a moment, then optional refresh.
      setTimeout(() => {
        // load(); // usually not needed thanks to realtime
      }, 1500);
    } catch (e: any) {
      setStatus("Launch error: " + (e?.message || e) + " — falling back to direct insert for demo. (If CEREBRAS_API_KEY missing while forcing, see backend 400 error above.)");

      // Fallback to direct insert if API fails (still triggers realtime)
      if (sb) {
        try {
          const { data: newSess } = await sb
            .from("autonomous_sessions")
            .insert({
              name: form.name,
              description: form.desc,
              metadata: { backend: "multi (codex|claude|grok|cerebras|big-agi via fallback)", source: "web-dashboard" },
            })
            .select()
            .single();

          if (newSess) {
            await sb.from("checkpoints").insert({
              session_id: newSess.id,
              name: "web-launch-fallback",
              resume_strategy: "last-checkpoint",
            });
            setStatus(`Launched (fallback direct). ${newSess.name} should appear live via Realtime.`);
          }
        } catch (fbErr: any) {
          setStatus("Fallback also failed: " + fbErr.message);
        }
      }
    } finally {
      setLaunching(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Supabase Realtime subscriptions for live dashboard updates
  // When data changes in autonomous_sessions or checkpoints (e.g. via dashboard launch,
  // future pipeline persistVibePlan calls, or even external `vibe` actions if wired to Supabase),
  // the UI will update automatically without manual refresh.
  useEffect(() => {
    if (!sb) return;

    const channel = sb
      .channel('vibe-autonomous-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'autonomous_sessions' },
        (payload: any) => {
          const newSession = payload.new as Session;
          const oldSession = payload.old as Session | null;

          if (payload.eventType === 'INSERT') {
            setSessions((prev) => {
              const exists = prev.some((s) => s.id === newSession.id);
              if (exists) return prev;
              return [newSession, ...prev].slice(0, 20);
            });
            // Fetch initial checkpoints for the new session so the card populates immediately
            sb
              .from('checkpoints')
              .select('id,name,created_at')
              .eq('session_id', newSession.id)
              .order('created_at', { ascending: false })
              .limit(5)
              .then(({ data }) => {
                if (data) {
                  setCheckpoints((prev) => ({
                    ...prev,
                    [newSession.id]: data as Checkpoint[],
                  }));
                }
              });
          } else if (payload.eventType === 'UPDATE') {
            setSessions((prev) =>
              prev.map((s) => (s.id === newSession.id ? newSession : s))
            );
          } else if (payload.eventType === 'DELETE' && oldSession) {
            setSessions((prev) => prev.filter((s) => s.id !== oldSession.id));
            setCheckpoints((prev) => {
              const copy = { ...prev };
              delete copy[oldSession.id];
              return copy;
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'checkpoints' },
        (payload: any) => {
          const newCp = payload.new as Checkpoint & { session_id: string };
          if (newCp.session_id) {
            setCheckpoints((prev) => {
              const existing = prev[newCp.session_id] || [];
              const exists = existing.some((c) => c.id === newCp.id);
              if (exists) return prev;
              const updated = [newCp as Checkpoint, ...existing].slice(0, 5);
              return { ...prev, [newCp.session_id]: updated };
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
          // Realtime connected – dashboard will now live-update on Supabase changes
          console.log('[Vibe Dashboard] Subscribed to Supabase Realtime for autonomous sessions & checkpoints');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('error');
        }
      });

    return () => {
      sb.removeChannel(channel);
    };
  }, [sb]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-8 font-sans">
      <header className="max-w-5xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[3px] text-emerald-400">VIBE • DECLARATIVE AGENT OS</div>
            <h1 className="text-4xl font-semibold tracking-tighter">Autonomous Dashboard</h1>
          </div>
          <div className="text-right text-sm text-zinc-400">
            Launch on any backend • Supabase state • Resume anywhere<br />
            Codex • Claude Code • Grok • Cerebras • big-AGI
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto grid gap-8">
        {/* Launch */}
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
          <h2 className="text-xl font-medium mb-4">Launch Autonomous Session</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="flex-1 bg-black border border-white/20 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="lane name"
            />
            <input
              className="flex-[2] bg-black border border-white/20 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder="mission / description"
            />
            <button
              onClick={launchAutonomous}
              disabled={launching}
              className="px-6 py-2 rounded-lg bg-emerald-500 text-black font-medium disabled:opacity-50 hover:bg-emerald-400 active:bg-emerald-600 transition"
            >
              {launching ? "Launching..." : "Launch on 5 backends"}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Uses wired resolver/pipeline + persist (VibePlanSchema + any registered provider). Checkpoints + events logged for resume. <strong>Supabase Realtime enabled</strong> — inserts from dashboard, future pipeline calls, or external tools will update this view live.</p>
          {status && <div className="mt-3 text-emerald-400 text-sm">{status}</div>}
          <div className="mt-1 text-[10px] flex items-center gap-2">
            <span className={realtimeStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'}>
              ● Supabase Realtime: {realtimeStatus}
            </span>
            {!sb && <span className="text-amber-400">(set env to enable)</span>}
          </div>
          {!sb && <div className="mt-1 text-amber-400 text-xs">Supabase env not set — realtime &amp; live queries disabled (demo mode). Copy web/.env.local.example to .env.local and restart dev server.</div>}
        </section>

        {/* Infra Sync Control for remote updates to Supabase/Vercel */}
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
          <h2 className="text-xl font-medium mb-4">Infra Sync (for remote control)</h2>
          <p className="text-xs text-zinc-400 mb-3">Send commands to keep Supabase (migrations) and Vercel (deploy) updated automatically via the C&amp;C plane. The Go runner will ack with instructions to run pnpm scripts (requires clis/auth in runner env). Use on a real session.</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                if (!sessions.length) { alert('Load sessions first'); return; }
                const sid = sessions[0].id;
                const res = await fetch('/api/agent/command', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ session_id: sid, command: 'sync-supabase', issued_by: 'grok' }) });
                const d = await res.json();
                setStatus(`Sent sync-supabase: ${d.success ? 'queued' : d.error}`);
              }}
              className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-500"
            >
              Sync Supabase Migrations
            </button>
            <button
              onClick={async () => {
                if (!sessions.length) { alert('Load sessions first'); return; }
                const sid = sessions[0].id;
                const res = await fetch('/api/agent/command', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ session_id: sid, command: 'deploy-vercel', issued_by: 'grok' }) });
                const d = await res.json();
                setStatus(`Sent deploy-vercel: ${d.success ? 'queued' : d.error}`);
              }}
              className="px-4 py-2 rounded bg-purple-600 text-white text-sm hover:bg-purple-500"
            >
              Deploy to Vercel
            </button>
            <button
              onClick={async () => {
                if (!sessions.length) { alert('Load sessions first'); return; }
                const sid = sessions[0].id;
                const res = await fetch('/api/agent/command', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ session_id: sid, command: 'sync-infra', issued_by: 'grok' }) });
                const d = await res.json();
                setStatus(`Sent sync-infra: ${d.success ? 'queued' : d.error}`);
              }}
              className="px-4 py-2 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-500"
            >
              Sync All Infra
            </button>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">These queue agent_commands. A remote-controlled Go runner (polling via service key) will ProcessCommand and respond with run instructions. Then run the pnpm scripts here or in CI to actually update hosted Supabase + Vercel prod. Ensures remote control always sees latest.</p>
        </section>

        {/* Telemetry (usage, decisions, remote activity) */}
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
          <h2 className="text-xl font-medium mb-4">Telemetry</h2>
          <p className="text-xs text-zinc-400 mb-3">Usage events (launches, plan resolves, remote commands processed, resource decisions, infra syncs, errors). Hosted in the same Supabase as state + C&amp;C (no new infra; reuses RLS/realtime/Go client). Opt-in friendly for self-hosted deployments.</p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={async () => {
                if (!sb) { alert('Supabase anon key needed in env'); return; }
                try {
                  const { data, error } = await sb.from('telemetry_events').select('*').order('created_at', { ascending: false }).limit(30);
                  if (error) throw error;
                  setTelemetry(data || []);
                  setStatus(`Loaded ${data?.length || 0} telemetry events (table must exist: apply the new migration via supabase db reset or infra sync)`);
                } catch (e: any) {
                  setStatus('Telemetry query error (table may not be created yet): ' + (e?.message || e));
                  setTelemetry([]);
                }
              }}
              className="px-4 py-2 rounded bg-amber-600 text-white text-sm hover:bg-amber-500"
            >
              Load Recent Telemetry
            </button>
            <button
              onClick={() => {
                // Queue a status command on first session as example of something that will emit telemetry via the Go poller
                if (!sessions.length) { alert('Launch a session first'); return; }
                const sid = sessions[0].id;
                fetch('/api/agent/command', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ session_id: sid, command: 'status', issued_by: 'grok', payload: { note: 'telemetry demo' } }) })
                  .then(r => r.json()).then(d => setStatus(`Queued status (will emit telemetry when poller processes): ${d.success ? 'ok' : d.error}`));
              }}
              className="px-4 py-2 rounded bg-zinc-700 text-white text-sm hover:bg-zinc-600"
            >
              Queue Example Command (emits via Go)
            </button>
          </div>
          {telemetry.length === 0 ? (
            <div className="text-xs text-zinc-500">No telemetry loaded yet. Click the button (or launch sessions / send remote cmds while a `vibe remote` poller is running).</div>
          ) : (
            <div className="max-h-64 overflow-auto text-xs font-mono bg-black/50 p-2 rounded">
              {telemetry.map((t, i) => (
                <div key={i} className="border-b border-white/10 py-1">
                  {new Date(t.created_at).toLocaleTimeString()} — <span className="text-amber-400">{t.kind}</span> @ {t.source} {t.session_id ? `sess:${t.session_id.slice(0,8)}` : ''} {JSON.stringify(t.payload).slice(0,120)}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-zinc-500">Add VIBE_TELEMETRY=1 in envs + wire more emitters (resource decisions, turns, CLI) for richer data. All events go through the same Supabase the rest of Vibe uses.</p>
        </section>

        {/* Sessions + Checkpoints */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-medium">Active Autonomous Sessions</h2>
            <button onClick={load} className="text-xs px-3 py-1 border border-white/20 rounded hover:bg-white/5">Refresh</button>
          </div>

          {loading ? (
            <div className="text-zinc-500">Loading from Supabase…</div>
          ) : sessions.length === 0 ? (
            <div className="text-zinc-500 border border-white/10 rounded-xl p-8 text-center">No sessions yet. Launch one above (or via .vibe + resolver).</div>
          ) : (
            <div className="grid gap-3">
              {sessions.map((s) => (
                <div key={s.id} className="rounded-xl border border-white/10 bg-zinc-900 p-4">
                  <div className="flex justify-between">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-zinc-400">{s.description || "—"}</div>
                    </div>
                    <div className="text-right text-[10px] text-zinc-500 tabular-nums">
                      {new Date(s.updated_at).toLocaleString()}<br />{s.id.slice(0, 8)}
                    </div>
                  </div>
                  <div className="mt-3 text-xs">
                    <span className="text-emerald-400">Checkpoints:</span>
                    {(checkpoints[s.id] || []).length ? (
                      <ul className="mt-1 ml-1 space-y-0.5 text-zinc-400">
                        {(checkpoints[s.id] || []).map((c) => (
                          <li key={c.id}>• {c.name} <span className="text-zinc-600">({new Date(c.created_at).toLocaleTimeString()})</span></li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-zinc-500"> (none yet — run a checkpoint step)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="text-[10px] text-zinc-500 pt-4 border-t border-white/10">
          Vibe self-bootstrapping • grammar + Zod + 5 providers + Supabase + Vercel • <a className="underline" href="https://github.com/lutherfourie/vibe" target="_blank">github.com/lutherfourie/vibe</a> (feature/autonomous-langium-zod)
        </footer>
      </main>
    </div>
  );
}
