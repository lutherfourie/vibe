# One-command installer for the Vibe Self-Build Daemon on Windows (no NSSM required).
# Creates (or replaces) a Task Scheduler task that:
#   - Runs at Windows startup (even if not logged on, with highest privs)
#   - Hidden window
#   - Restarts on failure
#   - Uses the robust wrapper that launches `vibe daemon`
#
# Prerequisites:
# 1. Build the binary once (recommended):
#      cd C:\vibe
#      go build -o vibe.exe ./cmd/vibe
#    Or copy an existing vibe.exe to repo root.
#
# 2. Create a control session (in dashboard or via curl) and capture its UUID.
#    Example: use the Autonomous Dashboard "Launch" then note the id, or insert directly.
#
# 3. Set the session id (system or user env var is best, or edit the task args later):
#      [Environment]::SetEnvironmentVariable("VIBE_DAEMON_SESSION", "<uuid>", "User")
#    Then logoff/login or reboot so child processes see it.
#
# 4. Run this installer (from an elevated PowerShell):
#      powershell -ExecutionPolicy Bypass -File C:\vibe\scripts\install-vibe-daemon-task.ps1 -Session <uuid>
#
# After install:
#   - Task name: VibeDaemon
#   - Trigger: At startup
#   - Action: runs the wrapper ps1 (hidden)
#   - It will self-heal and keep the Go daemon alive.
#
# Control:
#   Local:  curl -X POST http://127.0.0.1:3737/control -d '{"command":"loop:start"}'
#   Remote: dashboard buttons, PWA, or chat "vibe: start loop" (via Supabase)
#
# Update the daemon after code changes:
#   vibe update   (from chat or button)  or local POST {"command":"loop:update"}
#   Or manually: git pull && (restart task)
#
# Remove task:
#   schtasks /delete /tn VibeDaemon /f

param(
    [Parameter(Mandatory=$false)]
    [string]$Session = $env:VIBE_DAEMON_SESSION,

    [string]$TaskName = "VibeDaemon",
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = 'Stop'

if (-not $Session) {
    Write-Error "VIBE_DAEMON_SESSION not provided and env var empty. Create a session first and pass -Session <uuid> or set the env."
}

$ps1 = Join-Path $RepoRoot "scripts\vibe-daemon.ps1"
if (-not (Test-Path $ps1)) {
    throw "Missing launcher: $ps1"
}

# Build arg string for powershell.exe -File ... -Session ...
$actionArgs = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`" -Session `"$Session`""

Write-Host "Creating / updating scheduled task '$TaskName'..."
Write-Host "Repo: $RepoRoot"
Write-Host "Launcher: $ps1"
Write-Host "Session: $Session"

# Create the task action
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $RepoRoot

# Trigger: at startup
$trigger = New-ScheduledTaskTrigger -AtStartup

# Principal: run whether logged on or not, highest privileges (SYSTEM or current user)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount

# Settings: restart on failure, allow start on demand, hidden, etc.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -Hidden

# Register (force overwrite)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

Write-Host ""
Write-Host "✅ Task '$TaskName' registered."
Write-Host ""
Write-Host "Start it now (no reboot needed for first run):"
Write-Host "    schtasks /run /tn $TaskName"
Write-Host ""
Write-Host "Check status:"
Write-Host "    schtasks /query /tn $TaskName /fo LIST /v"
Write-Host ""
Write-Host "View recent wrapper logs:"
Write-Host "    Get-Content $RepoRoot\logs\vibe-daemon-wrapper.log -Tail 30"
Write-Host ""
Write-Host "Test local control (after it is running):"
Write-Host '    Invoke-RestMethod -Uri http://127.0.0.1:3737/status -Method Get'
Write-Host '    Invoke-RestMethod -Uri http://127.0.0.1:3737/control -Method Post -Body (@{command="loop:status"} | ConvertTo-Json) -ContentType "application/json"'
Write-Host ""
Write-Host "To trigger from anywhere (chat, phone PWA, dashboard) enqueue on the daemon session via /api/agent/command or the UI buttons."
