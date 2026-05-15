param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
)

$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $Root

$sourcePath = "examples\vibe-self.vibe"
Write-Output "Vibe lane/plugin inventory"
Write-Output "Source: $sourcePath"
Write-Output ""

if (-not (Test-Path -LiteralPath $sourcePath)) {
  Write-Output "missing: $sourcePath"
  exit 0
}

$content = Get-Content -LiteralPath $sourcePath -Raw
$pluginPattern = [regex]'(?ms)plugin\s+([A-Za-z0-9_]+)\s*\{(?<body>.*?)\}'
$plugins = $pluginPattern.Matches($content)

if ($plugins.Count -eq 0) {
  Write-Output "No plugin/lane declarations found."
  exit 0
}

foreach ($plugin in $plugins) {
  $name = $plugin.Groups[1].Value
  $body = $plugin.Groups["body"].Value

  function Get-PluginField {
    param(
      [string]$Body,
      [string]$Field
    )

    $pattern = [regex]::new(
      "(?ms)^\s*$([regex]::Escape($Field))\s*=\s*(?<value>\[[^\]]*\]|`"[^`"]*`"|[^\r\n]+)",
      [System.Text.RegularExpressions.RegexOptions]::Multiline
    )
    $match = $pattern.Match($Body)
    if ($match.Success) {
      $value = $match.Groups["value"].Value.Trim()
      if ($value.StartsWith('"') -and $value.EndsWith('"')) {
        return $value.Substring(1, $value.Length - 2)
      }

      return ($value -replace "\s+", " ")
    }

    return ""
  }

  $impl = Get-PluginField -Body $body -Field "impl"
  $target = Get-PluginField -Body $body -Field "target"
  $reads = Get-PluginField -Body $body -Field "reads"
  $owns = Get-PluginField -Body $body -Field "owns"
  $verify = Get-PluginField -Body $body -Field "verify"
  $approval = Get-PluginField -Body $body -Field "approval"
  $emits = Get-PluginField -Body $body -Field "emits"

  Write-Output "- $name"
  if ($impl) { Write-Output "  impl: $impl" }
  if ($target) { Write-Output "  target: $target" }
  if ($reads) { Write-Output "  reads: $reads" }
  if ($owns) { Write-Output "  owns: $owns" }
  if ($verify) { Write-Output "  verify: $verify" }
  if ($approval) { Write-Output "  approval: $approval" }
  if ($emits) { Write-Output "  emits: $emits" }
}
