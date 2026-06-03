param(
  [string]$Root
)

$ErrorActionPreference = "Stop"

# Resolve the active Vibe repo root. Prefer an explicit -Root, then the plugin's
# in-repo location (scripts\..\..\..), then the current working directory. This
# keeps the script correct whether the plugin is checked into the repo or loaded
# from the Claude/Codex plugin cache (where the cwd is the repo).
function Resolve-RepoRoot {
  param([string]$Preferred)

  $candidates = @()
  if ($Preferred) { $candidates += $Preferred }
  try { $candidates += (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path } catch {}
  $candidates += (Get-Location).Path

  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath (Join-Path $c "pnpm-workspace.yaml"))) {
      return $c
    }
  }
  return (Get-Location).Path
}

$repo = Resolve-RepoRoot -Preferred $Root
Set-Location -LiteralPath $repo

Write-Output "Vibe autonomous lane status"
Write-Output "Repo: $repo"

$branch = (git branch --show-current 2>$null)
if ($branch) { Write-Output "Branch: $branch" }

$status = (git status --short 2>$null)
if ($status) {
  $count = ($status | Measure-Object -Line).Lines
  Write-Output "Working tree: dirty ($count changed path(s))"
} else {
  Write-Output "Working tree: clean"
}
Write-Output ""

$progress = "PROGRESS.md"
if (Test-Path -LiteralPath $progress) {
  Write-Output "PROGRESS.md: present"
  $lines = Get-Content -LiteralPath $progress
  $front = $lines | Where-Object { $_ -match '^(Status|Updated|Branch):' } | Select-Object -First 3
  foreach ($l in $front) { Write-Output "  $l" }
  $cp = $lines | Where-Object { $_ -match '^### ' } | Select-Object -First 1
  if ($cp) { Write-Output ("  Latest checkpoint: " + ($cp -replace '^###\s*', '')) }
} else {
  Write-Output "PROGRESS.md: absent - run the vibe-checkpoint skill (or 'vibe checkpoint') to start one."
}
