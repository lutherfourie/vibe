param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
)

$ErrorActionPreference = "Stop"

function Write-ToolVersion {
  param(
    [string]$Name,
    [string[]]$ToolArgs = @("--version")
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    Write-Output "${Name}: missing"
    return
  }

  try {
    $version = & $Name @ToolArgs 2>$null | Select-Object -First 1
    Write-Output "${Name}: $version"
  } catch {
    Write-Output "${Name}: present, version probe failed"
  }
}

function Write-SurfaceMatch {
  param(
    [string]$Name,
    [string]$PathPattern
  )

  $matches = @(Get-ChildItem -Path $PathPattern -Force -ErrorAction SilentlyContinue)
  if ($matches.Count -eq 0) {
    Write-Output "${Name}: not found ($PathPattern)"
    return
  }

  foreach ($match in $matches) {
    $relative = Resolve-Path -LiteralPath $match.FullName -Relative
    Write-Output "${Name}: $relative"
  }
}

Set-Location -LiteralPath $Root

Write-Output "Vibe repo snapshot"
Write-Output "Root: $Root"
Write-Output ""

Write-Output "Git"
git status --short --branch
Write-Output ""

Write-Output "Tools"
Write-ToolVersion "node"
Write-ToolVersion "pnpm"
Write-ToolVersion "codex"
Write-ToolVersion "claude"
Write-ToolVersion "go" -ToolArgs @("version")
Write-ToolVersion "gh"
Write-ToolVersion "jq"
Write-ToolVersion "yq"
Write-ToolVersion "fd"
Write-Output ""

Write-Output "Self-plan files"
$source = Get-Item -LiteralPath "examples\vibe-self.vibe" -ErrorAction SilentlyContinue
$generated = Get-Item -LiteralPath "docs\examples\vibe-self-plan.json" -ErrorAction SilentlyContinue

if ($source) {
  Write-Output "source: $($source.LastWriteTime.ToString('s')) examples\vibe-self.vibe"
} else {
  Write-Output "source: missing examples\vibe-self.vibe"
}

if ($generated) {
  Write-Output "generated: $($generated.LastWriteTime.ToString('s')) docs\examples\vibe-self-plan.json"
} else {
  Write-Output "generated: missing docs\examples\vibe-self-plan.json"
}

Write-Output ""
Write-Output "Agent/plugin surfaces"
Write-SurfaceMatch "Codex marketplace" ".agents\plugins\marketplace.json"
Write-SurfaceMatch "Codex plugin manifest" "plugins\*\.codex-plugin\plugin.json"
Write-SurfaceMatch "Codex plugin skills" "plugins\*\codex-skills\*\SKILL.md"
Write-SurfaceMatch "Claude plugin manifest" "plugins\*\.claude-plugin\plugin.json"
Write-SurfaceMatch "Claude plugin skills" "plugins\*\skills\*\SKILL.md"
Write-SurfaceMatch "Claude plugin agents" "plugins\*\agents\*.md"
Write-SurfaceMatch "Claude plugin hooks" "plugins\*\hooks\hooks.json"
Write-SurfaceMatch "Claude project memory" "CLAUDE.md"
Write-SurfaceMatch "Claude config directory" ".claude"
Write-SurfaceMatch "MCP root config" ".mcp.json"
Write-SurfaceMatch "GitHub workflows" ".github\workflows\*.yml"
Write-SurfaceMatch "Vibe Superpowers plans" "docs\superpowers\plans\*.md"
Write-SurfaceMatch "Vibe Superpowers specs" "docs\superpowers\specs\*.md"
Write-SurfaceMatch "Vibe Superpowers research" "docs\superpowers\research\*.md"
