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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<{commands: any[], events: any[], responses: any[]} | null>(null);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);

  // === Vibe Daemon / Loop Control (Windows startup service) ===
  const [daemonSessionId, setDaemonSessionId] = useState<string>("");
  const [daemonStatus, setDaemonStatus] = useState<any>(null);
  const [daemonLogs, setDaemonLogs] = useState<string[]>([]);
  const [daemonOnline, setDaemonOnline] = useState<string>("unknown");
  const [pwaInstallPrompt, setPwaInstallPrompt] = useState<any>(null);
  const [pushEnabled, setPushEnabled] = useState(false);

  // Try to restore daemon session from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vibe_daemon_session');
      if (saved) setDaemonSessionId(saved);
    } catch {}
  }, []);

  function saveDaemonSession(id: string) {
    setDaemonSessionId(id);
    try { localStorage.setItem('vibe_daemon_session', id); } catch {}
  }

  async function sendDaemonCommand(command: string, payload: any = {}) {
    if (!daemonSessionId) {
      alert('Set a Daemon Session ID first (create one via Launch or paste the uuid of your "vibe-daemon-loop" session)');
      return;
    }
    const res = await fetch('/api/agent/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: daemonSessionId, command, issued_by: 'grok', payload }),
    });
    const d = await res.json();
    setStatus(`Daemon: sent ${command} → ${d.success ? 'queued' : d.error}`);
    setTimeout(() => loadDaemonStatus(), 1200);
    // Also notify subscribers (PWA push)
    fetch('/api/push/send', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title: 'Vibe Loop', body: `Command: ${command}`, session_id: daemonSessionId }) }).catch(()=>{});
  }

  async function loadDaemonStatus() {
    if (!daemonSessionId) return;
    try {
      const r = await fetch(`/api/agent/status?session_id=${daemonSessionId}`);
      const data = await r.json();
      setDaemonStatus(data);

      // Derive "online" from recent heartbeat or command
      const recent = [...(data.events || []), ...(data.responses || [])].sort((a:any,b:any) => (b.created_at||'').localeCompare(a.created_at||''));
      const last = recent[0];
      if (last) {
        const ageMin = (Date.now() - new Date(last.created_at).getTime()) / 60000;
        setDaemonOnline(ageMin < 3 ? 'online' : ageMin < 15 ? 'recent' : 'stale');
      } else {
        setDaemonOnline('unknown');
      }

      // Pull logs from events if present
      const logs = (data.events || []).filter((e:any) => (e.kind||'').includes('daemon') || (e.kind||'').includes('loop')).slice(0,8).map((e:any)=> `${new Date(e.created_at).toLocaleTimeString()} ${e.kind}`);
      setDaemonLogs(logs);
    } catch (e) {
      setDaemonOnline('error');
    }

    // Best-effort: also hit the local control port if the daemon is on same machine as the browser
    try {
      const local = await fetch('http://127.0.0.1:3737/status', { cache: 'no-store' });
      if (local.ok) {
        const ls = await local.json();
        setDaemonStatus((prev:any) => ({ ...(prev||{}), local: ls }));
        if (ls.status) setDaemonOnline('local-ok');
      }
    } catch {}
  }

  // PWA install prompt capture
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setPwaInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function installPWA() {
    if (!pwaInstallPrompt) {
      alert('Install prompt not available. Use browser menu → Install app (or "Add to home screen").');
      return;
    }
    pwaInstallPrompt.prompt();
    const choice = await pwaInstallPrompt.userChoice;
    setStatus('PWA install choice: ' + choice.outcome);
    setPwaInstallPrompt(null);
  }

  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push not supported in this browser.');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          // Public VAPID key — override via env or dashboard prompt if you generated your own
          (window as any).VAPID_PUBLIC || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
        ),
      });
      const json = sub.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          session_id: daemonSessionId || null,
          user_agent: navigator.userAgent,
        }),
      });
      setPushEnabled(true);
      setStatus('Push notifications enabled for Vibe loop alerts (Supabase + web-push).');
      // Test notification path
      await fetch('/api/push/send', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({title:'Vibe PWA', body:'Push test – loop alerts ready'}) });
    } catch (e: any) {
      setStatus('Push enable failed: ' + (e?.message || e) + ' (provide VAPID key or run without for now)');
    }
  }

  function urlBase64ToUint8Array(base64String: string) {
    if (!base64String) return new Uint8Array(0);
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Auto-load daemon status when session chosen
  useEffect(() => {
    if (daemonSessionId) loadDaemonStatus();
  }, [daemonSessionId]);

  // Register service worker for PWA + push on first load
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const sb = getSupabase();
  const selectedCheckpoints = selectedId ? checkpoints[selectedId] || [] : [];
  const reasoningSteps = [...selectedCheckpoints].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  async function copyConsoleMessage(messageKey: string, message: string) {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedMessageKey(messageKey);
      window.setTimeout(() => {
        setCopiedMessageKey((current) => current === messageKey ? null : current);
      }, 1200);
    } catch (e: unknown) {
      setStatus("Copy failed: " + (e instanceof Error ? e.message : String(e)));
    }
  }

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

  async function loadSessionData(sid: string) {
    if (!sb) return;
    setConsoleLoading(true);
    try {
      const res = await fetch(`/api/agent/status?session_id=${sid}`);
      const data = await res.json();
      if (res.ok) {
        setSessionData({
          commands: data.commands || [],
          events: data.events || [],
          responses: data.responses || [],
        });
      }
      // also refresh telemetry for this session
      const { data: telem } = await sb.from('telemetry_events').select('*').eq('session_id', sid).order('created_at', { ascending: false }).limit(20);
      setTelemetry(telem || []);
      // ensure checkpoints for this sid (in case loaded after initial global load)
      if (!checkpoints[sid] || checkpoints[sid].length === 0) {
        const { data: cp } = await sb.from('checkpoints').select('id,name,created_at').eq('session_id', sid).order('created_at', { ascending: false }).limit(5);
        if (cp) {
          setCheckpoints((prev) => ({ ...prev, [sid]: cp as Checkpoint[] }));
        }
      }
    } catch (e) {
      console.error(e);
    }
    setConsoleLoading(false);
  }

  function selectSession(sid: string) {
    setSelectedId(sid);
    loadSessionData(sid);
  }

  async function sendCommand(command: string, payload: any = {}) {
    if (!selectedId) { alert('Select a session first'); return; }
    const res = await fetch('/api/agent/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: selectedId, command, issued_by: 'grok', payload }),
    });
    const d = await res.json();
    setStatus(`Sent ${command}: ${d.success ? 'queued' : d.error}`);
    // refresh console after short delay (poller will process)
    setTimeout(() => loadSessionData(selectedId), 1500);
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

  // Console realtime for selected session (agent events + telemetry) - Claude live feel
  useEffect(() => {
    if (!sb || !selectedId) return;
    const ch = sb
      .channel(`console-${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_events', filter: `session_id=eq.${selectedId}` }, () => {
        loadSessionData(selectedId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'telemetry_events', filter: `session_id=eq.${selectedId}` }, () => {
        loadSessionData(selectedId);
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, selectedId]);

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

        {/* Windows Self-Build Daemon / Grok Build Loop — the reliable startup service */}
        <section className="rounded-2xl border border-emerald-500/30 bg-zinc-900 p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-medium">Windows Self-Build Daemon (vibe daemon)</h2>
              <div className="text-[10px] text-emerald-400">Boots with Windows • zero-CPU idle until triggered • remote from chat / PWA / dashboard • auto git pull + restart on update</div>
            </div>
            <div className="text-right text-xs">
              <div className={daemonOnline === 'online' || daemonOnline === 'local-ok' ? 'text-emerald-400' : 'text-amber-400'}>
                ● {daemonOnline}
              </div>
              <button onClick={loadDaemonStatus} className="mt-1 text-[10px] px-2 py-0.5 border border-white/20 rounded">Refresh</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3 items-end">
            <input
              className="flex-1 min-w-[280px] bg-black border border-white/20 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-emerald-500"
              placeholder="Daemon session UUID (create via Launch or paste from dashboard)"
              value={daemonSessionId}
              onChange={(e) => saveDaemonSession(e.target.value)}
            />
            <button onClick={() => { if (sessions[0]) saveDaemonSession(sessions[0].id); }} className="px-3 py-1.5 rounded border border-white/20 text-xs">Use first session</button>
            <button onClick={loadDaemonStatus} className="px-3 py-1.5 rounded bg-zinc-800 text-xs">Load status</button>
          </div>

          {/* Exact requested triggers */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => sendDaemonCommand('loop:start')} className="px-4 py-2 rounded-lg bg-emerald-600 text-black font-medium text-sm hover:bg-emerald-500">vibe: start loop</button>
            <button onClick={() => sendDaemonCommand('loop:full-transpiler', {instruction: 'full transpiler'})} className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm hover:bg-emerald-600">vibe: next: full transpiler</button>
            <button onClick={() => sendDaemonCommand('loop:status')} className="px-3 py-2 rounded border border-white/20 text-sm">vibe: status</button>
            <button onClick={() => sendDaemonCommand('loop:update')} className="px-3 py-2 rounded border border-amber-500/40 text-sm">vibe: update</button>
            <button onClick={() => sendDaemonCommand('pause')} className="px-3 py-2 rounded border border-white/20 text-sm">pause</button>
            <button onClick={() => sendDaemonCommand('resume')} className="px-3 py-2 rounded border border-white/20 text-sm">resume</button>
            <button onClick={() => sendDaemonCommand('loop:next', {instruction: 'continue current lane'})} className="px-3 py-2 rounded border border-white/20 text-sm">next step</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded border border-white/10 bg-black/40 p-3 font-mono">
              <div className="text-emerald-400 mb-1">Daemon state (from Supabase + local :3737)</div>
              <pre className="text-[10px] text-zinc-300 whitespace-pre-wrap">{daemonStatus ? JSON.stringify({ online: daemonOnline, ...(daemonStatus.local||{}), last: (daemonStatus.events||[]).slice(0,1) }, null, 2).slice(0, 900) : 'No daemon session selected or no events yet.'}</pre>
            </div>
            <div className="rounded border border-white/10 bg-black/40 p-3">
              <div className="text-emerald-400 mb-1">Recent daemon / loop activity</div>
              {daemonLogs.length ? daemonLogs.map((l,i)=><div key={i} className="py-0.5 text-zinc-400">{l}</div>) : <div className="text-zinc-500">Trigger a command above (or from chat). Events appear via realtime.</div>}
              <div className="mt-2 text-[10px] text-zinc-500">Local control (same machine): <span className="font-mono">POST http://127.0.0.1:3737/control {"{"}"command":"loop:start"{"}"}</span></div>
            </div>
          </div>

          <p className="mt-3 text-[10px] text-zinc-500">The daemon (started at boot via Task Scheduler) runs `vibe daemon --session &lt;id&gt;`. It is idle until a command arrives over Supabase (or localhost). On "update" it does git pull + graceful restart. Full remote from phone, laptop, or this chat.</p>
        </section>

        {/* PWA Install + Push Notifications */}
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
          <h2 className="text-xl font-medium mb-2">Mobile PWA + Push Alerts</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            <button onClick={installPWA} className="px-4 py-2 rounded bg-sky-600 text-white text-sm">Install PWA (Add to Home Screen)</button>
            <button onClick={enablePush} className="px-4 py-2 rounded bg-violet-600 text-white text-sm">Enable Push Notifications (loop alerts)</button>
            <a href="https://github.com/lutherfourie/vibe" target="_blank" className="px-3 py-2 rounded border border-white/20 text-sm self-center">Open on GitHub</a>
          </div>
          <div className="text-[10px] text-zinc-500">
            Install from dashboard on phone → "Add to home screen". Push uses Supabase + web-push (set VAPID_* in Vercel / .env for real delivery). Android shortcut opens straight to live status.
            After enabling push, "vibe: start loop" or daemon events will notify you.
          </div>
          <div className="text-[10px] mt-1 text-amber-400">Tip: Generate VAPID once: npx web-push generate-vapid-keys (store as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)</div>
        </section>

        {/* Telemetry (usage, decisions, remote activity) */}
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
          <h2 className="text-xl font-medium mb-4">Telemetry {telemetry.length > 0 ? `(${telemetry.length} recent)` : ''}</h2>
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
            <button
              onClick={async () => {
                if (!sb) { alert('Supabase anon key needed in env for direct telemetry insert demo'); return; }
                try {
                  const { error } = await sb.from('telemetry_events').insert({
                    kind: 'telemetry_example_queued',
                    source: 'dashboard',
                    payload: { note: 'manual queue example from UI', via: 'grok-codex-parallel' },
                    session_id: sessions[0]?.id || null,
                  });
                  if (error) throw error;
                  setStatus('Queued direct telemetry example (will appear on next Load Recent)');
                } catch (e: any) {
                  setStatus('Telemetry queue error: ' + (e?.message || e));
                }
              }}
              className="px-4 py-2 rounded bg-emerald-700 text-white text-sm hover:bg-emerald-600"
            >
              Queue Telemetry Example
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

        {/* Sessions list (Claude Projects inspired sidebar) + Agent Console (chat + artifacts) */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-medium">Autonomous Sessions (select for console)</h2>
            <button onClick={load} className="text-xs px-3 py-1 border border-white/20 rounded hover:bg-white/5">Refresh</button>
          </div>

          {loading ? (
            <div className="text-zinc-500">Loading from Supabase…</div>
          ) : sessions.length === 0 ? (
            <div className="text-zinc-500 border border-white/10 rounded-xl p-8 text-center">No sessions yet. Launch one above (or via .vibe + resolver).</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Sessions sidebar - like Claude projects/chats */}
              <div className="lg:col-span-1 space-y-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectSession(s.id)}
                    className={`w-full text-left rounded-xl border p-3 transition ${selectedId === s.id ? 'border-emerald-500 bg-zinc-950' : 'border-white/10 bg-zinc-900 hover:bg-zinc-800'}`}
                  >
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{s.id.slice(0,8)} • {new Date(s.updated_at).toLocaleTimeString()}</div>
                    <div className="mt-1 text-xs text-zinc-400 line-clamp-1">{s.description || '—'}</div>
                  </button>
                ))}
              </div>

              {/* Main console area - Claude chat + artifacts hybrid */}
              <div className="lg:col-span-2 border border-white/10 rounded-2xl bg-zinc-950 p-4 min-h-[420px] flex flex-col">
                {!selectedId ? (
                  <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">Select a session to open the agent console (chat for remote commands + artifacts for plans, checkpoints, telemetry).</div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                      <div>
                        <div className="font-semibold">Console for {sessions.find(s => s.id === selectedId)?.name}</div>
                        <div className="text-[10px] text-zinc-500">{selectedId}</div>
                      </div>
                      <button onClick={() => loadSessionData(selectedId!)} disabled={consoleLoading} className="text-xs px-2 py-1 border border-white/20 rounded hover:bg-white/5 disabled:opacity-50">Refresh</button>
                    </div>

                    {/* Chat-like message stream (Claude-inspired: clean bubbles, user right, system left, timestamps, kind labels. Feels like chatting with the autonomous agent via C&C.) */}
                    <div className="flex-1 overflow-auto space-y-2 text-sm mb-3 pr-1 max-h-[280px] bg-black/40 p-3 rounded border border-white/5">
                      {reasoningSteps.length > 0 && (
                        <details className="rounded-xl border border-white/10 bg-zinc-900/70 p-2 text-zinc-300 shadow-sm" open>
                          <summary className="cursor-pointer select-none text-[11px] font-medium text-zinc-300">
                            Reasoning <span className="font-normal text-zinc-500">/ Autonomous steps ({reasoningSteps.length})</span>
                          </summary>
                          <div className="mt-2 space-y-1 border-l border-white/10 pl-3">
                            {reasoningSteps.map((checkpoint, stepIdx) => (
                              <div key={checkpoint.id} className="rounded-md bg-white/[0.03] px-2 py-1.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[11px] text-zinc-300">Step {stepIdx + 1}: {checkpoint.name}</span>
                                  <span className="shrink-0 text-[10px] text-zinc-500">{new Date(checkpoint.created_at).toLocaleTimeString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {sessionData && (sessionData.commands.length + sessionData.events.length + sessionData.responses.length > 0) ? (
                        [...(sessionData.commands || []), ...(sessionData.events || []), ...(sessionData.responses || [])]
                          .sort((a,b) => new Date(a.created_at || a.created_at).getTime() - new Date(b.created_at || b.created_at).getTime())
                          .map((item, idx) => {
                            const isUser = !!item.issued_by;
                            const kind = item.command || item.kind || (item.status ? 'response' : 'event');
                            const msg = item.message || (item.payload ? JSON.stringify(item.payload) : (item.result ? JSON.stringify(item.result) : '(no details)'));
                            const time = new Date(item.created_at || item.created_at).toLocaleTimeString();
                            const messageKey = item.id || `${kind}-${item.created_at || idx}-${idx}`;
                            const isInstruct = kind === 'instruct';
                            const bubbleClass = isInstruct
                              ? 'bg-amber-400/10 border border-amber-300/30 text-amber-50'
                              : isUser
                                ? 'bg-emerald-600 text-black'
                                : 'bg-zinc-800 border border-white/10 text-zinc-200';
                            return (
                              <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                <div className={`group/message relative max-w-[80%] rounded-2xl px-3 py-1.5 pr-9 shadow-sm ${bubbleClass}`}>
                                  <button
                                    type="button"
                                    aria-label="Copy message"
                                    onClick={() => copyConsoleMessage(messageKey, msg)}
                                    className="absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] opacity-0 transition hover:bg-white/10 focus:opacity-100 group-hover/message:opacity-70"
                                  >
                                    {copiedMessageKey === messageKey ? '✓' : 'Copy'}
                                  </button>
                                  <div className="flex items-center gap-2 text-[9px] opacity-70 mb-0.5">
                                    <span>{isUser ? 'You' : 'Agent'}</span>
                                    <span className="font-mono">· {kind}</span>
                                    <span>{time}</span>
                                  </div>
                                  <div className="whitespace-pre-wrap break-words text-xs leading-snug">{msg.slice(0, 220)}{msg.length > 220 ? '…' : ''}</div>
                                </div>
                              </div>
                            );
                          })
                      ) : (
                        <div className="text-zinc-500 text-xs italic">No activity yet. Use the composer below to send remote commands (like Claude chat). The live poller (if active for this session) will process & emit telemetry/events for the stream to update live via realtime.</div>
                      )}
                      {consoleLoading && <div className="text-[10px] text-amber-400 animate-pulse">Loading console…</div>}
                    </div>

                    {/* Artifacts (Claude Artifacts inspiration): side-panel style live/structured views for the session's declarative state. Checkpoints as "steps", telemetry as "insights". Can be extended to preview plans, render interactive previews, etc. */}
                    <div className="mb-2 p-2 bg-zinc-900/60 rounded border border-white/10 text-[10px]">
                      <div className="font-medium mb-1 flex items-center gap-1">📦 Artifacts for this session <span className="text-emerald-400">(Claude-like live previews)</span></div>
                      <div className="mb-2">
                        <div className="mb-1 text-zinc-400">Checkpoints</div>
                        {(checkpoints[selectedId] || []).length ? (
                          <div className="space-y-1">
                            {(checkpoints[selectedId] || []).map((c) => (
                              <div key={c.id} className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/30 px-2 py-1">
                                <span className="truncate text-zinc-200">{c.name}</span>
                                <button
                                  onClick={() => {
                                    const input = document.querySelector('#console-input') as HTMLInputElement;
                                    if (input) {
                                      input.value = `refine the description and add success criteria for checkpoint: ${c.name}`;
                                      input.focus();
                                      alert('Refine prompt added to the console. Press Send when ready.');
                                    }
                                  }}
                                  className="shrink-0 rounded border border-white/20 px-1.5 py-0.5 text-[9px] hover:bg-white/5"
                                >
                                  Refine
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-zinc-500">none yet</div>
                        )}
                        {/* Grok-direct small enhancement for recommended generative artifacts (while Codex parallel tasks enhance stream + full artifacts interactivity). In real would call /api/launch or resolver for live plan preview. */}
                        <button
                          onClick={() => {
                            const input = document.querySelector('#console-input') as HTMLInputElement;
                            if (input) {
                              input.value = 'suggest and add a new checkpoint for the current lane progress with success criteria';
                              input.focus();
                              // Local "generative" stub: could push a temp UI suggestion here in future.
                            }
                          }}
                          className="mt-1 w-full rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/10"
                        >
                          + Suggest checkpoint (Grok + Codex parallel)
                        </button>
                      </div>
                      <div className="mb-2 text-amber-400">Telemetry events for session: see global Telemetry section or refresh console (loads per-session).</div>
                      <div className="rounded border border-emerald-500/20 bg-black/30 p-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div>
                            <div className="uppercase tracking-[2px] text-emerald-400">Live preview</div>
                            <div className="text-xs text-zinc-200">Plan artifact</div>
                          </div>
                          <button
                            onClick={() => {
                              const input = document.querySelector('#console-input') as HTMLInputElement;
                              if (input) {
                                input.value = 'update the plan artifact to include telemetry summary';
                                input.focus();
                                alert('Edit prompt added to the console. Press Send when ready.');
                              }
                            }}
                            className="shrink-0 rounded border border-white/20 px-2 py-1 text-[9px] hover:bg-white/5"
                          >
                            Edit in chat
                          </button>
                        </div>
                        <div className="rounded border border-white/10 bg-zinc-950/80 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate font-medium text-zinc-100">{sessions.find(s => s.id === selectedId)?.name || 'Selected session'}</div>
                            <div className="shrink-0 text-zinc-500">{(checkpoints[selectedId] || []).length} checkpoints</div>
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {(checkpoints[selectedId] || []).length ? (
                              (checkpoints[selectedId] || []).map((c) => (
                                <div key={c.id} className="rounded border border-white/10 bg-zinc-900 px-2 py-1">
                                  <div className="truncate text-zinc-200">{c.name}</div>
                                  <div className="text-zinc-500">{new Date(c.created_at).toLocaleTimeString()}</div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded border border-dashed border-white/10 bg-zinc-900/70 px-2 py-1 text-zinc-500">Waiting for checkpoints</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Composer - natural language command input, Claude style */}
                    <div className="mt-auto">
                      <div className="flex gap-2 mb-2">
                        <button onClick={() => sendCommand('status')} className="text-[10px] px-2 py-0.5 border border-white/20 rounded hover:bg-white/5">status</button>
                        <button onClick={() => sendCommand('instruct', {instruction: 'continue the main lane work'})} className="text-[10px] px-2 py-0.5 border border-white/20 rounded hover:bg-white/5">instruct: continue</button>
                        <button onClick={() => sendCommand('sync-infra')} className="text-[10px] px-2 py-0.5 border border-white/20 rounded hover:bg-white/5">sync-infra</button>
                        {/* Added via Grok + Codex parallel for recommended remote C&C depth */}
                        <button onClick={() => sendCommand('checkpoint')} className="text-[10px] px-2 py-0.5 border border-emerald-500/40 rounded hover:bg-emerald-500/10">checkpoint (via vibe bin)</button>
                        <button onClick={() => sendCommand('pause')} className="text-[10px] px-2 py-0.5 border border-white/20 rounded hover:bg-white/5">pause</button>
                        <button onClick={() => sendCommand('resume')} className="text-[10px] px-2 py-0.5 border border-white/20 rounded hover:bg-white/5">resume</button>
                        <button onClick={() => sendCommand('launch')} className="text-[10px] px-2 py-0.5 border border-white/20 rounded hover:bg-white/5">launch</button>
                      </div>
                      {/* Daemon shortcuts when a daemon session is active */}
                      <div className="flex gap-2 mb-1 opacity-80">
                        <button onClick={() => daemonSessionId && sendDaemonCommand('loop:start')} className="text-[9px] px-2 py-px border border-emerald-500/30 rounded">daemon:start</button>
                        <button onClick={() => daemonSessionId && sendDaemonCommand('loop:full-transpiler')} className="text-[9px] px-2 py-px border border-emerald-500/30 rounded">daemon:transpiler</button>
                        <button onClick={() => daemonSessionId && sendDaemonCommand('loop:update')} className="text-[9px] px-2 py-px border border-amber-500/30 rounded">daemon:update</button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          id="console-input"
                          type="text"
                          placeholder="Type command (status, instruct, pause, resume, sync-supabase...) or natural instruction"
                          className="flex-1 bg-black border border-white/20 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                              const val = (e.target as HTMLInputElement).value;
                              const cmd = val.startsWith('instruct') || val.length > 20 ? 'instruct' : val;
                              const payload = cmd === 'instruct' ? { instruction: val.replace(/^instruct\s*/i, '') } : {};
                              sendCommand(cmd, payload);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }}
                        />
                        <button onClick={() => {
                          const input = document.querySelector('#console-input') as HTMLInputElement;
                          if (input && input.value) {
                            const val = input.value;
                            const cmd = val.startsWith('instruct') || val.length > 20 ? 'instruct' : val;
                            const payload = cmd === 'instruct' ? { instruction: val.replace(/^instruct\s*/i, '') } : {};
                            sendCommand(cmd, payload);
                            input.value = '';
                          }
                        }} className="px-4 py-1.5 rounded bg-emerald-600 text-sm">Send</button>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1">Sends via /api/agent/command → live Go poller (if running for this session) processes with ProcessCommand + telemetry emission.</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Sessions + Checkpoints (kept for overview, now secondary) */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-medium">All Sessions Overview</h2>
            <button onClick={load} className="text-xs px-3 py-1 border border-white/20 rounded hover:bg-white/5">Refresh</button>
          </div>

          {loading ? (
            <div className="text-zinc-500">Loading from Supabase…</div>
          ) : sessions.length === 0 ? (
            <div className="text-zinc-500 border border-white/10 rounded-xl p-8 text-center">No sessions yet. Launch one above (or via .vibe + resolver).</div>
          ) : (
            <div className="grid gap-3">
              {sessions.map((s) => (
                <div key={s.id} onClick={() => selectSession(s.id)} className="rounded-xl border border-white/10 bg-zinc-900 p-4 cursor-pointer hover:border-emerald-500/50">
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
