Param(
    [Parameter(Mandatory = $true)]
    [string]$UpdaterPublicKey,
    [ValidatePattern('^https://')]
    [string]$CloudApiBaseUrl = 'https://api1.hengceyun.com',
    [ValidatePattern('^https://')]
    [string]$UpdateApiBaseUrl,
    [ValidateSet('stable', 'beta')]
    [string]$Channel = 'stable',
    [string]$CertificateThumbprint,
    [ValidatePattern('^https://')]
    [string]$TimestampUrl,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"

function WaitForKey {
    if (-not $NoPause) {
        Write-Host ""
        Write-Host "请按任意键继续..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$desktopDir = Join-Path $root "apps\desktop"
$temporaryConfig = Join-Path $env:TEMP ("label-print-updater-" + [guid]::NewGuid().ToString("N") + ".json")
$previousCloudApiUrl = [Environment]::GetEnvironmentVariable("VITE_LABEL_API_URL", "Process")
$previousInlineSigningKey = [Environment]::GetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY", "Process")
$loadedSigningKeyFromPath = $false

function Get-HttpsOrigin {
    Param(
        [Parameter(Mandatory = $true)]
        [string]$Value,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    try {
        $uri = [uri]$Value.Trim()
    } catch {
        throw "$Name must be an absolute HTTPS origin."
    }
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or
        [string]::IsNullOrWhiteSpace($uri.Host) -or $uri.UserInfo -or
        $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) {
        throw "$Name must be a credential-free HTTPS origin without a path, query, or fragment."
    }
    return $uri.GetLeftPart([System.UriPartial]::Authority)
}

try {
    $hasInlineSigningKey = -not [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)
    $hasSigningKeyPath = -not [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PATH)
    if ($hasInlineSigningKey -and $hasSigningKeyPath) {
        throw "Set exactly one of TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH."
    }
    if (-not $hasInlineSigningKey -and -not $hasSigningKeyPath) {
        throw "TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH is required to generate signed updater artifacts."
    }
    if ($hasSigningKeyPath -and -not (Test-Path -LiteralPath $env:TAURI_SIGNING_PRIVATE_KEY_PATH -PathType Leaf)) {
        throw "TAURI_SIGNING_PRIVATE_KEY_PATH does not point to a private-key file."
    }
    if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD)) {
        throw "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is required for the encrypted production updater key."
    }
    if ($hasSigningKeyPath) {
        # Tauri 2.10 accepts the path variable in its key-generation CLI, but
        # updater bundling itself reads the key-content variable. Keep the key
        # in this process only and restore the caller environment afterward.
        $env:TAURI_SIGNING_PRIVATE_KEY = [IO.File]::ReadAllText($env:TAURI_SIGNING_PRIVATE_KEY_PATH).Trim()
        $loadedSigningKeyFromPath = $true
    }
    if ($UpdaterPublicKey -match 'REPLACE_WITH|^\s*$') {
        throw "UpdaterPublicKey must be the content of the Tauri updater public key."
    }

    $cloudApiOrigin = Get-HttpsOrigin -Value $CloudApiBaseUrl -Name 'CloudApiBaseUrl'
    $updateApiOrigin = if ([string]::IsNullOrWhiteSpace($UpdateApiBaseUrl)) {
        $cloudApiOrigin
    } else {
        Get-HttpsOrigin -Value $UpdateApiBaseUrl -Name 'UpdateApiBaseUrl'
    }
    $normalizedCertificateThumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
    if ($normalizedCertificateThumbprint -and $normalizedCertificateThumbprint -notmatch '^[A-F0-9]{40}$') {
        throw 'CertificateThumbprint must be a SHA-1 certificate thumbprint (40 hexadecimal characters).'
    }
    if ($normalizedCertificateThumbprint -and [string]::IsNullOrWhiteSpace($TimestampUrl)) {
        throw 'TimestampUrl is required when CertificateThumbprint is supplied.'
    }
    $channelSuffix = if ($Channel -eq 'beta') { '?channel=beta' } else { '' }
    $endpoint = "$updateApiOrigin/api/v1/desktop-updates/{{target}}/{{arch}}/{{current_version}}$channelSuffix"
    $windowsBundle = @{ webviewInstallMode = @{ type = 'downloadBootstrapper' } }
    if ($normalizedCertificateThumbprint) {
        # Tauri signs the Windows binary before it writes the updater .sig.
        # Signing afterward would invalidate the updater signature.
        $windowsBundle.certificateThumbprint = $normalizedCertificateThumbprint
        $windowsBundle.digestAlgorithm = 'sha256'
        $windowsBundle.timestampUrl = $TimestampUrl
        $windowsBundle.tsp = $true
    }
    $configuration = @{
        bundle = @{
            createUpdaterArtifacts = $true
            windows = $windowsBundle
        }
        plugins = @{
            updater = @{
                pubkey = $UpdaterPublicKey
                endpoints = @($endpoint)
                windows = @{ installMode = "passive" }
            }
        }
    } | ConvertTo-Json -Depth 8
    Set-Content -LiteralPath $temporaryConfig -Value $configuration -Encoding UTF8 -NoNewline
    $env:VITE_LABEL_API_URL = $cloudApiOrigin

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
        if ($null -eq $pnpmCommand) {
            throw "Node.js (or pnpm with its bundled Node.js runtime) is required."
        }
        $pnpmRuntimeRoot = Split-Path (Split-Path (Split-Path $pnpmCommand.Source -Parent) -Parent) -Parent
        $bundledNode = Join-Path $pnpmRuntimeRoot "node\bin\node.exe"
        if (-not (Test-Path -LiteralPath $bundledNode -PathType Leaf)) {
            throw "Node.js is required."
        }
        $env:PATH = "$(Split-Path $bundledNode -Parent);$env:PATH"
    }

    Push-Location $desktopDir
    try {
        pnpm exec tauri build --config $temporaryConfig
        if ($LASTEXITCODE -ne 0) {
            throw "Tauri updater artifact build failed (exit code $LASTEXITCODE)."
        }
    } finally {
        Pop-Location
    }
} finally {
    if ($loadedSigningKeyFromPath) {
        if ($null -eq $previousInlineSigningKey) {
            Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
        } else {
            $env:TAURI_SIGNING_PRIVATE_KEY = $previousInlineSigningKey
        }
    }
    if ($null -eq $previousCloudApiUrl) {
        Remove-Item Env:VITE_LABEL_API_URL -ErrorAction SilentlyContinue
    } else {
        $env:VITE_LABEL_API_URL = $previousCloudApiUrl
    }
    if (Test-Path -LiteralPath $temporaryConfig) {
        Remove-Item -LiteralPath $temporaryConfig -Force
    }
    WaitForKey
}
