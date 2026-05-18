param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $Root

$claudeDir = "skills"
$codexDir = "codex-skills"

function Get-SkillSet {
  param([string]$Dir)

  if (-not (Test-Path -LiteralPath $Dir)) {
    return @()
  }

  Get-ChildItem -LiteralPath $Dir -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md") } |
    Select-Object -ExpandProperty Name
}

function Get-SkillDescription {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  $lines = Get-Content -LiteralPath $Path -TotalCount 10
  $descLine = $lines | Where-Object { $_ -match '^description:\s*(.+)$' } | Select-Object -First 1
  if ($descLine) {
    return ($descLine -replace '^description:\s*', '').Trim()
  }
  return ""
}

Write-Output "Vibe Workbench - skills drift check"
Write-Output "Plugin root: $Root"
Write-Output ""

$claudeSkills = Get-SkillSet $claudeDir
$codexSkills = Get-SkillSet $codexDir

Write-Output "skills/ (Claude):   $($claudeSkills.Count) skill(s)"
Write-Output "codex-skills/:      $($codexSkills.Count) skill(s)"
Write-Output ""

$onlyClaude = $claudeSkills | Where-Object { $codexSkills -notcontains $_ }
$onlyCodex = $codexSkills | Where-Object { $claudeSkills -notcontains $_ }
$shared = $claudeSkills | Where-Object { $codexSkills -contains $_ }

if ($onlyClaude) {
  Write-Output "Skills present in Claude only:"
  foreach ($name in $onlyClaude) { Write-Output "  - $name" }
  Write-Output ""
}

if ($onlyCodex) {
  Write-Output "Skills present in Codex only:"
  foreach ($name in $onlyCodex) { Write-Output "  - $name" }
  Write-Output ""
}

if ($shared) {
  Write-Output "Shared skills (descriptions compared):"
  foreach ($name in $shared) {
    $claudeDesc = Get-SkillDescription (Join-Path $claudeDir "$name\SKILL.md")
    $codexDesc = Get-SkillDescription (Join-Path $codexDir "$name\SKILL.md")
    $status = if ($claudeDesc -eq $codexDesc) { "match" } else { "DIFFER" }
    Write-Output ("  - " + $name + ": " + $status)
    if ($claudeDesc -ne $codexDesc) {
      Write-Output "      claude: $claudeDesc"
      Write-Output "      codex:  $codexDesc"
    }
  }
  Write-Output ""
}

if (-not $onlyClaude -and -not $onlyCodex) {
  Write-Output "No skills missing on either side."
}
