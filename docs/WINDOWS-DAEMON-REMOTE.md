# Windows Startup Daemon for Vibe Self-Build / Grok Build Loop (Reliable + Remote)

## Goals (exact)
- Starts on Windows boot as true background service.
- Zero CPU / idle until explicitly triggered.
- Trigger from:
  - Vibe dashboard (web on Vercel)
  - Mobile PWA (installable + push)
  - This chat: "vibe: start loop", "vibe: next: full transpiler", "vibe: status", "vibe: update", "vibe: pause"
- Live status everywhere.
- Auto `git pull` + graceful restart on "vibe: update" without losing state.
- Uses existing Supabase (agent_commands + telemetry) + Vercel dashboard.
- Self-healing.

## Architecture (light + robust)
- `vibe daemon --session <UUID>` (new subcommand in Go binary).
  - Tiny localhost HTTP server on 127.0.0.1:3737 (idle listeners = zero work).
  - Starts RemoteControl poller (15s) against your daemon control session → receives commands from chat/dashboard/PWA.
  - On trigger: runs self:plan + grok-build + full-transpiler etc in a mutex-guarded worker.
  - "update" does git pull + spawns replacement process + exits (graceful).
- Launcher: `scripts/vibe-daemon.ps1` (restarts on crash).
- Boot: Task Scheduler (built-in, no extra deps) or NSSM.

Everything else (Supabase C&C, realtime, push) is already wired.

## 1. One-time setup on the Windows box (copy-paste)

```powershell
# 1. In repo
cd C:\vibe

# 2. Build the binary (once)
go build -o vibe.exe ./cmd/vibe

# 3. (Recommended) Create a dedicated daemon control session.
#    Option A: use the hosted dashboard → Launch a session named "vibe-daemon-loop", copy its UUID.
#    Option B: direct via API (replace URL if using local supabase):
#    (run from any machine with the service key or use the dashboard)

# 4. Store the session id (system or user env — log off/on after)
[Environment]::SetEnvironmentVariable("VIBE_DAEMON_SESSION", "<paste-uuid-here>", "User")

# 5. Install the startup task (run elevated PowerShell once)
powershell -ExecutionPolicy Bypass -File .\scripts\install-vibe-daemon-task.ps1 -Session $env:VIBE_DAEMON_SESSION

# 6. Start it immediately (no reboot required)
schtasks /run /tn VibeDaemon

# 7. Verify
schtasks /query /tn VibeDaemon /fo LIST /v
Get-Content .\logs\vibe-daemon-wrapper.log -Tail 20
Invoke-RestMethod http://127.0.0.1:3737/status
```

## 2. Trigger commands (anywhere)

**From this chat (Grok):**
- "vibe: start loop"
- "vibe: next: full transpiler"
- "vibe: status"
- "vibe: update"
- "vibe: pause"

(Implementation: Grok / any caller POSTs to the hosted `/api/agent/command` targeting the daemon session. The running daemon poller sees it and acts.)

**From dashboard / PWA (hosted):**
Open https://your-vercel-vibe-deployment.vercel.app → find the "Windows Self-Build Daemon" card → paste the session UUID (or use "Use first session") → hit the big green buttons.

**Direct local (same box, for testing):**
```powershell
Invoke-RestMethod -Method POST http://127.0.0.1:3737/control `
  -Body (@{command="loop:start"} | ConvertTo-Json) -ContentType "application/json"

Invoke-RestMethod http://127.0.0.1:3737/status
```

## 3. PWA + Push (phone / laptop)

1. Open the dashboard in Chrome/Edge on phone.
2. Tap "Install PWA (Add to Home Screen)" in the Mobile PWA section.
3. Tap "Enable Push Notifications".
4. Add the icon to home screen. It behaves like a status widget (opens to live daemon state).
5. When you (or Grok) send "vibe: start loop", you get a push even if the PWA is closed.

Push requires VAPID keys on the host (Vercel):
```bash
npx web-push generate-vapid-keys
# Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + (optionally NEXT_PUBLIC_VAPID_PUBLIC_KEY)
```

## 4. Update mechanism (no downtime for state)

- Send "vibe: update" (chat or button).
- Daemon does `git pull --ff-only`.
- If anything changed: spawn new `vibe.exe daemon ...` and exit(0).
- The wrapper / Task Scheduler keeps it running.
- PROGRESS.md + Supabase events survive.

You can also manually:
```powershell
cd C:\vibe
git pull
schtasks /end /tn VibeDaemon
schtasks /run /tn VibeDaemon
```

## 5. NSSM alternative (if you prefer a real Windows Service)

```powershell
# Install NSSM once
# Download https://nssm.cc/download or choco install nssm

nssm install VibeDaemon "C:\vibe\vibe.exe" daemon --addr 127.0.0.1:3737 --session %VIBE_DAEMON_SESSION%
nssm set VibeDaemon AppDirectory C:\vibe
nssm set VibeDaemon AppStdout C:\vibe\logs\vibe-daemon-nssm.out.log
nssm set VibeDaemon AppStderr C:\vibe\logs\vibe-daemon-nssm.err.log
nssm set VibeDaemon Start SERVICE_AUTO_START
nssm start VibeDaemon
```

## 6. Useful maintenance commands

```powershell
# View live wrapper logs
Get-Content C:\vibe\logs\vibe-daemon-wrapper.log -Wait -Tail 30

# Tail daemon output of current run
Get-Content C:\vibe\logs\*.out.log -Wait -Tail 10

# Force restart
schtasks /end /tn VibeDaemon ; schtasks /run /tn VibeDaemon

# Remove the task completely
schtasks /delete /tn VibeDaemon /f
```

## 7. Test the full loop now

After the task is running and you have set the session UUID:

1. In this chat: say `vibe: status`
2. Say `vibe: start loop`
3. Watch dashboard + local :3737/status + logs.
4. Say `vibe: next: full transpiler`
5. Say `vibe: update` (it will pull and restart itself).

All state flows through Supabase → visible on phone PWA and dashboard instantly.

## Files added / changed for this feature

- `go/cmd/vibe/daemon.go` — full implementation
- `go/cmd/vibe/main.go` — wire `vibe daemon`
- `scripts/vibe-daemon.ps1` — robust wrapper + log capture + restart loop
- `scripts/install-vibe-daemon-task.ps1` — exact one-command Task Scheduler setup
- `web/app/page.tsx` + new daemon + PWA UI
- `web/app/layout.tsx` — PWA metadata
- `web/public/manifest.json` + `sw.js`
- `web/app/api/push/*` + `web/package.json` (web-push)
- New Supabase migration for push_subscriptions
- This doc

The system is low-maintenance: one binary + one scheduled task. Everything else is data in Supabase + Vercel.
