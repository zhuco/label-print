Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$targets = @(
  "apps/desktop/dist",
  "apps/desktop/src-tauri/target",
  "apps/desktop/src-tauri/gen",
  "apps/desktop/node_modules/.vite",
  "apps/desktop/node_modules/.vitest",
  "tests/e2e/playwright-report",
  "tests/e2e/test-results",
  "coverage"
)

Write-Host "Cleaning build artifacts under $repoRoot"

foreach ($relativePath in $targets) {
  $fullPath = Join-Path $repoRoot $relativePath

  if (Test-Path -LiteralPath $fullPath) {
    Remove-Item -LiteralPath $fullPath -Recurse -Force
    Write-Host "Removed: $relativePath"
  } else {
    Write-Host "Skip (missing): $relativePath"
  }
}

Write-Host "Build artifact cleanup complete."
