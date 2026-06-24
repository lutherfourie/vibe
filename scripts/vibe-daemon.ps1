# Vibe Self-Build / Grok Build Loop - Windows Startup Daemon Launcher
# Starts on boot via Task Scheduler (or NSSM).
# The actual work happens in `vibe daemon` (Go).
# This wrapper:
#   - Stays in repo root
#   - Sets sensible env
#   - Starts the Go daemon (prefers prebuilt vibe.exe or go run)
#   - Captures logs
#   - Self-heals on crash (loop with backoff)
#   - Supports VIBE_DAEMON_SESSION env or -Session param for remote control
#
# Usage (manual test):
#   powershell -ExecutionPolicy Bypass -File scripts\vibe-daemon.ps1 -Session <uuid>
#
# One-command install (see install script or docs):
#   schtasks /create /tn "VibeDaemon" ... (see install-vibe-daemon-task.ps1)

param(
    [string]$Session = $env:VIBE_DAEMON_SESSION,
    [string]$Addr = "127.0.0.1:3737",
    [int]$RestartDelaySec = 5
)

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repoRoot "go\go.mod"))) {
    $repoRoot = (Get-Location).Path
}
Set-Location $repoRoot

$logDir = Join-Path $repoRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Get-Timestamp { (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") }
function Log($msg) {
    $line = "[$(Get-Timestamp)] $msg"
    Write-Host $line
    Add-Content -Path (Join-Path $logDir "vibe-daemon-wrapper.log") -Value $line -Encoding UTF8
}

Log "=== Vibe daemon wrapper starting in $repoRoot ==="

if (-not $Session) {
    Log "WARNING: VIBE_DAEMON_SESSION not set. Remote triggers from chat/dashboard/PWA will have no target."
    Log "Create a session in the dashboard, note the id, then set the env or pass -Session."
}

$exe = Join-Path $repoRoot "vibe.exe"
$useGoRun = $false
if (-not (Test-Path $exe)) {
    $exe = Join-Path $repoRoot "bin\vibe.exe"
}
if (-not (Test-Path $exe)) {
    Log "No prebuilt vibe.exe found. Will use 'go run ./cmd/vibe daemon' (slower startup, requires Go)."
    $useGoRun = $true
}

$env:VIBE_DAEMON_SESSION = $Session
$env:Path = "$env:Path;$repoRoot"

while ($true) {
    $dateStamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
    $outLog = Join-Path $logDir "vibe-daemon-$dateStamp.out.log"
    $errLog = Join-Path $logDir "vibe-daemon-$dateStamp.err.log"

    Log "Launching daemon (session=$(if($Session){$Session}else{'<none>'})) addr=$Addr"
    Log "stdout -> $outLog"
    Log "stderr -> $errLog"

    try {
        if ($useGoRun) {
            $p = Start-Process -FilePath "go" -ArgumentList "run","./cmd/vibe","daemon","--addr",$Addr,"--session",$Session `
                -WindowStyle Hidden -WorkingDirectory $repoRoot `
                -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
        } else {
            $p = Start-Process -FilePath $exe -ArgumentList "daemon","--addr",$Addr,"--session",$Session `
                -WindowStyle Hidden -WorkingDirectory $repoRoot `
                -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
        }

        Log "Daemon pid=$($p.Id) started. Waiting for exit..."

        # Wait; on normal exit or crash we restart after delay
        $p.WaitForExit()
        $code = $p.ExitCode
        Log "Daemon exited with code $code. Restarting in $RestartDelaySec s..."
    } catch {
        Log "Launch error: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds $RestartDelaySec
}
