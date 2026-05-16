param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path,
  [switch]$Regenerate
)

$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $Root

$sourcePath = "examples\vibe-self.vibe"
$generatedPath = "docs\examples\vibe-self-plan.json"

Write-Output "Vibe self-plan check"
Write-Output "Root: $Root"
Write-Output ""

$source = Get-Item -LiteralPath $sourcePath -ErrorAction SilentlyContinue
$generated = Get-Item -LiteralPath $generatedPath -ErrorAction SilentlyContinue

if (-not $source) {
  Write-Output "source: missing $sourcePath"
  exit 1
}

if (-not $generated) {
  Write-Output "generated: missing $generatedPath"
} else {
  Write-Output "source: $($source.LastWriteTime.ToString('s')) $sourcePath"
  Write-Output "generated: $($generated.LastWriteTime.ToString('s')) $generatedPath"

  if ($source.LastWriteTime -gt $generated.LastWriteTime) {
    Write-Output "freshness: generated file is older than source"
  } else {
    Write-Output "freshness: generated file is not older than source"
  }
}

Write-Output ""
Write-Output "Tracked diff summary"
git diff --name-status -- $sourcePath $generatedPath

if ($Regenerate) {
  Write-Output ""
  Write-Output "Regenerating self-plan with pnpm run self:plan"
  pnpm run self:plan
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  Write-Output ""
  Write-Output "Post-regeneration diff summary"
  git diff --name-status -- $sourcePath $generatedPath
  git diff --stat -- $generatedPath
}
