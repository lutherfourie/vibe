param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
)

$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $Root

Write-Output "Vibe Superpowers check"
Write-Output "Root: $Root"
Write-Output ""

$codexSuperpowersRoot = Join-Path $env:USERPROFILE ".codex\plugins\cache\openai-curated\superpowers"
$skillNames = @(
  "using-superpowers",
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "executing-plans",
  "systematic-debugging",
  "test-driven-development",
  "requesting-code-review",
  "receiving-code-review",
  "verification-before-completion",
  "finishing-a-development-branch"
)

Write-Output "Codex Superpowers"
if (Test-Path -LiteralPath $codexSuperpowersRoot) {
  Write-Output "root: $codexSuperpowersRoot"

  foreach ($skillName in $skillNames) {
    $matches = @(Get-ChildItem -LiteralPath $codexSuperpowersRoot -Recurse -Filter "SKILL.md" -ErrorAction SilentlyContinue | Where-Object {
      $_.FullName -like "*\skills\$skillName\SKILL.md"
    })

    if ($matches.Count -gt 0) {
      Write-Output "skill: $skillName"
    } else {
      Write-Output "missing skill: $skillName"
    }
  }
} else {
  Write-Output "missing root: $codexSuperpowersRoot"
}

Write-Output ""
Write-Output "Vibe Superpowers docs"
$planDir = "docs\superpowers\plans"
$specDir = "docs\superpowers\specs"
$researchDir = "docs\superpowers\research"

foreach ($dir in @($planDir, $specDir, $researchDir)) {
  if (Test-Path -LiteralPath $dir) {
    $count = @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue).Count
    Write-Output "${dir}: $count files"
  } else {
    Write-Output "${dir}: missing"
  }
}

Write-Output ""
Write-Output "Recommended mapping"
Write-Output "plan: superpowers:writing-plans -> docs/superpowers/plans/"
Write-Output "execute: superpowers:subagent-driven-development or superpowers:executing-plans"
Write-Output "debug: superpowers:systematic-debugging"
Write-Output "review: superpowers:requesting-code-review / receiving-code-review"
Write-Output "finish: superpowers:verification-before-completion"
