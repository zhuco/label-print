[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 8787,
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$storeFile = Join-Path $workspaceRoot "var\cloud-store.json"
$assetDirectory = Join-Path $workspaceRoot "var\cloud-assets"

# Normal developer installations resolve `node` from PATH. Codex desktop supplies an isolated
# Node runtime instead, so recognise that local runtime without requiring a global installation.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $codexNodeDirectory = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
  if (Test-Path (Join-Path $codexNodeDirectory "node.exe")) {
    $env:Path = "$codexNodeDirectory;$env:Path"
  }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20+ is required. Install Node.js and ensure node.exe is available on PATH."
}

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  throw "Port $Port is already in use. Stop that API first or run this script with -Port <unused-port>."
}

$env:PORT = [string]$Port
$env:LOCAL_CLOUD_STORE_FILE = $storeFile
$env:LOCAL_CLOUD_ASSET_DIRECTORY = $assetDirectory

if ($Foreground) {
  & pnpm --filter @label/server start
  exit $LASTEXITCODE
}

$pnpm = (Get-Command pnpm -ErrorAction Stop).Source
$process = Start-Process -FilePath $pnpm -ArgumentList @("--filter", "@label/server", "start") -WorkingDirectory $workspaceRoot -WindowStyle Hidden -PassThru
Write-Output "Started local cloud API (launcher PID $($process.Id)) on http://127.0.0.1:$Port."
