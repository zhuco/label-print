Param(
    [ValidatePattern('^https://')]
    [string]$CloudApiBaseUrl = 'https://api1.hengceyun.com',
    [switch]$SkipFrontend,
    [switch]$BundleNsis,
    [switch]$KeepStaging
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Keep the Win7 installer on the same production cloud API as the normal MSI.
# An explicit -CloudApiBaseUrl may still be supplied for staging or testing.
$previousCloudApiUrl = [Environment]::GetEnvironmentVariable('VITE_LABEL_API_URL', 'Process')
$env:VITE_LABEL_API_URL = $CloudApiBaseUrl.TrimEnd('/')

function Invoke-External {
    Param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed (exit $LASTEXITCODE): $FilePath $($Arguments -join ' ')"
    }
}

function Get-Sha256Hash {
    Param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    $getFileHash = Get-Command Get-FileHash -ErrorAction SilentlyContinue
    if ($null -ne $getFileHash) {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    }

    # Windows 7 hosts can run an older PowerShell without Get-FileHash. CertUtil
    # is available there and keeps the release script from failing after packaging.
    $certutilOutput = & certutil.exe -hashfile $Path SHA256
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to calculate SHA-256 with certutil: $Path"
    }
    $hashLine = $certutilOutput | Where-Object { $_ -match '^\s*[0-9A-Fa-f]{2}(?:\s*[0-9A-Fa-f]{2}){31}\s*$' } | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($hashLine)) {
        throw "Unable to parse SHA-256 from certutil output: $Path"
    }
    return ($hashLine -replace '\s', '').ToUpperInvariant()
}

function Copy-Tree {
    Param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [string[]]$ExcludedDirectories = @()
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $arguments = @($Source, $Destination, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
    if ($ExcludedDirectories.Count -gt 0) {
        $arguments += "/XD"
        $arguments += $ExcludedDirectories
    }
    & robocopy @arguments | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "robocopy failed (exit $LASTEXITCODE): $Source -> $Destination"
    }
}

function Set-DependencyVersion {
    Param(
        [Parameter(Mandatory = $true)][string]$Manifest,
        [Parameter(Mandatory = $true)][string]$Dependency,
        [Parameter(Mandatory = $true)][string]$Version
    )

    $escaped = [regex]::Escape($Dependency)
    $pattern = "(?m)^($escaped\s*=\s*(?:\{[^}`r`n]*\bversion\s*=\s*)?)`"[^`"]+`""
    $regex = [regex]::new($pattern)
    $content = [IO.File]::ReadAllText($Manifest)
    if (-not $regex.IsMatch($content)) {
        throw "Cannot pin dependency '$Dependency' in staged Cargo.toml"
    }
    $content = $regex.Replace($content, "`${1}`"=$Version`"", 1)
    [IO.File]::WriteAllText($Manifest, $content, (New-Object Text.UTF8Encoding($false)))
}

$toolchain = "1.77.2-x86_64-pc-windows-msvc"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$desktop = Join-Path $root "apps\desktop"
$sourceTauri = Join-Path $desktop "src-tauri"
$sourceDist = Join-Path $desktop "dist"
$outputRoot = Join-Path $sourceTauri "target-win7"
$releaseDir = Join-Path $root "release"
$tauriConfig = Get-Content -LiteralPath (Join-Path $sourceTauri "tauri.conf.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$tauriConfig.version
if ([string]::IsNullOrWhiteSpace($version)) {
    throw "tauri.conf.json is missing version"
}
$safeVersion = [regex]::Replace($version, '[\\/:*?"<>|]+', "_")
$stageRoot = Join-Path $outputRoot ("staging-" + [guid]::NewGuid().ToString("N"))
$stageTauri = Join-Path $stageRoot "apps\desktop\src-tauri"
$stageDist = Join-Path $stageRoot "apps\desktop\dist"
$manifest = Join-Path $stageTauri "Cargo.toml"
$targetExe = Join-Path $outputRoot "release\label-desktop.exe"
$installerOutput = Join-Path $releaseDir "label-desktop_${safeVersion}_win7_x64.exe"
$sourceBuildTargets = @(
    Get-ChildItem -LiteralPath $sourceTauri -Directory -Force |
        Where-Object { $_.Name -like "target*" } |
        Select-Object -ExpandProperty FullName
)

try {
    if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
        throw "rustup is required to build the Win7 target"
    }
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        throw "cargo is required to resolve the Win7 dependency set"
    }
    if (-not $SkipFrontend -and -not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw "pnpm (and its Node.js runtime) is required to build the frontend"
    }
    if (-not $SkipFrontend -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
        # Codex's bundled pnpm keeps node beside the pnpm shim instead of on PATH.
        # Honour that layout while retaining the normal PATH behaviour for developers.
        $pnpmPath = (Get-Command pnpm -ErrorAction Stop).Source
        $pnpmRuntimeRoot = Split-Path (Split-Path (Split-Path $pnpmPath -Parent) -Parent) -Parent
        $bundledNode = Join-Path $pnpmRuntimeRoot "node\bin\node.exe"
        if (-not (Test-Path -LiteralPath $bundledNode -PathType Leaf)) {
            throw "Node.js is required to build the frontend"
        }
        $env:PATH = "$(Split-Path $bundledNode -Parent);$env:PATH"
    }

    $installed = & rustup toolchain list
    if (-not ($installed | Select-String -SimpleMatch $toolchain)) {
        Write-Host "Installing Rust $toolchain..."
        Invoke-External -FilePath "rustup" -Arguments @("toolchain", "install", $toolchain, "--profile", "minimal")
    }

    if (-not $SkipFrontend) {
        Write-Host "Building frontend..."
        Push-Location $root
        try {
            Invoke-External -FilePath "pnpm" -Arguments @("--filter", "@label/desktop", "build")
        } finally {
            Pop-Location
        }
    }
    if (-not (Test-Path -LiteralPath $sourceDist -PathType Container)) {
        throw "Frontend output is missing: $sourceDist"
    }

    Write-Host "Creating isolated Win7 staging workspace..."
    # Do not stage any existing Rust build cache. Besides wasting substantial
    # time and disk space, files in a copied target-* tree may disappear while
    # Cargo is working, which can make final staging cleanup fail.
    Copy-Tree -Source $sourceTauri -Destination $stageTauri -ExcludedDirectories $sourceBuildTargets
    Copy-Tree -Source $sourceDist -Destination $stageDist

    $mainLock = Join-Path $stageTauri "Cargo.lock"
    if (Test-Path -LiteralPath $mainLock) {
        Move-Item -LiteralPath $mainLock -Destination (Join-Path $stageTauri "Cargo.main.lock") -Force
    }

    $manifestContent = [IO.File]::ReadAllText($manifest)
    if ($manifestContent -notmatch '(?m)^rust-version\s*=') {
        $manifestContent = [regex]::Replace(
            $manifestContent,
            '(?m)^(edition\s*=\s*"2021"\s*)$',
            '$1' + [Environment]::NewLine + 'rust-version = "1.77.2"',
            1
        )
        [IO.File]::WriteAllText($manifest, $manifestContent, (New-Object Text.UTF8Encoding($false)))
    }

    # Keep the Rust crates in the same Tauri minor release as the bundled CLI
    # and JavaScript API. These pins only affect the staged Win7 build; the
    # main Cargo.toml and Cargo.lock remain untouched.
    Set-DependencyVersion -Manifest $manifest -Dependency "tauri-build" -Version "2.5.6"
    Set-DependencyVersion -Manifest $manifest -Dependency "tauri" -Version "2.10.3"
    Set-DependencyVersion -Manifest $manifest -Dependency "tauri-plugin-single-instance" -Version "2.4.1"
    Set-DependencyVersion -Manifest $manifest -Dependency "tauri-plugin-window-state" -Version "2.4.1"
    Set-DependencyVersion -Manifest $manifest -Dependency "image" -Version "0.25.6"
    Set-DependencyVersion -Manifest $manifest -Dependency "printpdf" -Version "0.8.2"

    # The main package enables WinRT OCR by default. Win7 has no WinRT API set,
    # so this staged manifest selects the existing Tesseract OCR fallback instead.
    $manifestContent = [IO.File]::ReadAllText($manifest)
    $win7FeatureDefault = 'default = ["winrt-ocr"]'
    if (-not $manifestContent.Contains($win7FeatureDefault)) {
        throw "Cannot switch the staged manifest to the legacy-win7 feature set"
    }
    $manifestContent = $manifestContent.Replace($win7FeatureDefault, 'default = ["legacy-win7"]')
    [IO.File]::WriteAllText($manifest, $manifestContent, (New-Object Text.UTF8Encoding($false)))

    Write-Host "Resolving dependencies compatible with Rust 1.77.2..."
    $previousResolverPolicy = $env:CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS
    $env:CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS = "fallback"
    try {
        Invoke-External -FilePath "cargo" -Arguments @("generate-lockfile", "--manifest-path", $manifest)
        # `tauri` permits newer same-major runtime crates, but those revisions
        # can change internal types and are rejected by the 2.10 JavaScript
        # CLI. Pin the coordinated runtime family in staging before compiling.
        foreach ($dependency in @(
            @("tauri-macros", "2.5.5"),
            @("tauri-codegen", "2.5.5"),
            @("tauri-plugin", "2.5.4"),
            @("tauri-runtime-wry", "2.10.1"),
            @("tauri-runtime", "2.10.1"),
            @("tauri-utils", "2.8.3")
        )) {
            Invoke-External -FilePath "cargo" -Arguments @(
                "update", "-p", $dependency[0], "--precise", $dependency[1], "--manifest-path", $manifest
            )
        }
        Invoke-External -FilePath "cargo" -Arguments @("fetch", "--manifest-path", $manifest)
    } finally {
        $env:CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS = $previousResolverPolicy
    }

    # lopdf 0.35 uses an io::Error conversion stabilized after Rust 1.77.
    # Vendor it only inside staging and retain equivalent Vec reservation logic.
    $registrySource = Join-Path $env:USERPROFILE ".cargo\registry\src"
    $lopdfSource = Get-ChildItem -Path $registrySource -Recurse -Directory -Filter "lopdf-0.35.0" |
        Select-Object -First 1 -ExpandProperty FullName
    if ([string]::IsNullOrWhiteSpace($lopdfSource)) {
        throw "Cargo fetched lopdf 0.35.0 but its source directory was not found"
    }
    $vendoredLopdf = Join-Path $stageTauri "vendor\lopdf-0.35.0"
    Copy-Tree -Source $lopdfSource -Destination $vendoredLopdf -ExcludedDirectories @(
        (Join-Path $lopdfSource ".git"),
        (Join-Path $lopdfSource ".github"),
        (Join-Path $lopdfSource "assets"),
        (Join-Path $lopdfSource "benches"),
        (Join-Path $lopdfSource "examples"),
        (Join-Path $lopdfSource "tests")
    )
    $pngFilter = Join-Path $vendoredLopdf "src\filters\png.rs"
    $pngContent = [IO.File]::ReadAllText($pngFilter)
    $patchedPng = $pngContent.Replace(
        "previous.try_reserve(bytes_per_row)?;",
        "previous.reserve(bytes_per_row);"
    ).Replace(
        "current.try_reserve(bytes_per_row)?;",
        "current.reserve(bytes_per_row);"
    )
    if ($patchedPng -eq $pngContent) {
        throw "The expected lopdf compatibility lines were not found"
    }
    [IO.File]::WriteAllText($pngFilter, $patchedPng, (New-Object Text.UTF8Encoding($false)))

    $manifestContent = [IO.File]::ReadAllText($manifest)
    $manifestContent += [Environment]::NewLine + '[patch.crates-io]' + [Environment]::NewLine
    $manifestContent += 'lopdf = { path = "vendor/lopdf-0.35.0" }' + [Environment]::NewLine
    [IO.File]::WriteAllText($manifest, $manifestContent, (New-Object Text.UTF8Encoding($false)))

    Move-Item -LiteralPath (Join-Path $stageTauri "Cargo.lock") -Destination (Join-Path $stageTauri "Cargo.pre-patch.lock") -Force
    $previousResolverPolicy = $env:CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS
    $env:CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS = "fallback"
    try {
        Invoke-External -FilePath "cargo" -Arguments @("generate-lockfile", "--manifest-path", $manifest)
        # The vendor patch regenerates Cargo.lock, so apply the same runtime
        # pins again after that final resolution.
        foreach ($dependency in @(
            @("tauri-macros", "2.5.5"),
            @("tauri-codegen", "2.5.5"),
            @("tauri-plugin", "2.5.4"),
            @("tauri-runtime-wry", "2.10.1"),
            @("tauri-runtime", "2.10.1"),
            @("tauri-utils", "2.8.3")
        )) {
            Invoke-External -FilePath "cargo" -Arguments @(
                "update", "-p", $dependency[0], "--precise", $dependency[1], "--manifest-path", $manifest
            )
        }
    } finally {
        $env:CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS = $previousResolverPolicy
    }

    # Cargo 1.77 understands the v3 data model; modern Cargo emits v4 by default.
    $legacyLock = Join-Path $stageTauri "Cargo.lock"
    $lockContent = [IO.File]::ReadAllText($legacyLock).Replace("version = 4", "version = 3")
    [IO.File]::WriteAllText($legacyLock, $lockContent, (New-Object Text.UTF8Encoding($false)))

    Write-Host "Building desktop executable with Rust 1.77.2..."
    $previousTargetDir = $env:CARGO_TARGET_DIR
    $previousRustFlags = $env:RUSTFLAGS
    $previousCFlags = $env:CFLAGS
    $env:CARGO_TARGET_DIR = $outputRoot
    $env:RUSTFLAGS = ("$previousRustFlags -C target-feature=+crt-static").Trim()
    $env:CFLAGS = ("$previousCFlags /MT").Trim()
    try {
        Invoke-External -FilePath "cargo" -Arguments @(
            "+1.77.2-x86_64-pc-windows-msvc",
            "build",
            "--manifest-path", $manifest,
            "--release",
            "--locked",
            "--features", "tauri/custom-protocol",
            "--bin", "label-desktop"
        )
    } finally {
        $env:CARGO_TARGET_DIR = $previousTargetDir
        $env:RUSTFLAGS = $previousRustFlags
        $env:CFLAGS = $previousCFlags
    }

    Write-Host "Checking static PE imports..."
    Invoke-External -FilePath "powershell" -Arguments @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $scriptDir "check-win7-imports.ps1"),
        "-Path", $targetExe
    )

    Write-Host "Win7 candidate executable: $targetExe" -ForegroundColor Green

    if ($BundleNsis) {
        $tauriCli = Join-Path $desktop "node_modules\@tauri-apps\cli\tauri.js"
        if (-not (Test-Path -LiteralPath $tauriCli -PathType Leaf)) {
            throw "Tauri CLI was not found: $tauriCli"
        }

        # Win7 can only use the discontinued WebView2 109 line. Do not let this
        # installer fetch today's Evergreen runtime, which no longer supports it.
        $stagedBaseConfigPath = Join-Path $stageTauri "tauri.conf.json"
        $stagedBaseConfig = Get-Content -LiteralPath $stagedBaseConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $stagedBaseConfig.bundle.windows.webviewInstallMode = [pscustomobject]@{ type = "skip" }
        $stagedBaseConfigJson = $stagedBaseConfig | ConvertTo-Json -Depth 20
        [IO.File]::WriteAllText($stagedBaseConfigPath, $stagedBaseConfigJson, (New-Object Text.UTF8Encoding($false)))

        $legacyTauriConfig = Join-Path $stageTauri "tauri.win7.conf.json"
        $legacyConfig = @{
            build = @{
                beforeBuildCommand = ""
                beforeDevCommand = ""
                frontendDist = "../dist"
            }
            bundle = @{
                targets = @("nsis")
            }
        } | ConvertTo-Json -Depth 8
        [IO.File]::WriteAllText($legacyTauriConfig, $legacyConfig, (New-Object Text.UTF8Encoding($false)))

        Write-Host "Building Win7 NSIS installer..."
        $previousToolchain = $env:RUSTUP_TOOLCHAIN
        $previousTargetDir = $env:CARGO_TARGET_DIR
        $previousRustFlags = $env:RUSTFLAGS
        $previousCFlags = $env:CFLAGS
        $env:RUSTUP_TOOLCHAIN = $toolchain
        $env:CARGO_TARGET_DIR = $outputRoot
        $env:RUSTFLAGS = ("$previousRustFlags -C target-feature=+crt-static").Trim()
        $env:CFLAGS = ("$previousCFlags /MT").Trim()
        Push-Location (Split-Path -Parent $stageTauri)
        try {
            Invoke-External -FilePath "node" -Arguments @(
                $tauriCli,
                "build",
                "--bundles", "nsis",
                "--no-sign",
                "--config", $legacyTauriConfig
            )
        } finally {
            Pop-Location
            $env:RUSTUP_TOOLCHAIN = $previousToolchain
            $env:CARGO_TARGET_DIR = $previousTargetDir
            $env:RUSTFLAGS = $previousRustFlags
            $env:CFLAGS = $previousCFlags
        }

        $bundleDir = Join-Path $outputRoot "release\bundle\nsis"
        $generatedInstaller = Get-ChildItem -LiteralPath $bundleDir -Filter "*.exe" -File |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($null -eq $generatedInstaller) {
            throw "NSIS installer was not generated under: $bundleDir"
        }
        $installerDir = Split-Path -Parent $installerOutput
        New-Item -ItemType Directory -Path $installerDir -Force | Out-Null
        Copy-Item -LiteralPath $generatedInstaller.FullName -Destination $installerOutput -Force

        Write-Host "Checking installer PE imports..."
        Invoke-External -FilePath "powershell" -Arguments @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $scriptDir "check-win7-imports.ps1"),
            "-Path", $installerOutput
        )
        $installerHash = Get-Sha256Hash -Path $installerOutput
        Write-Host "Win7 installer: $installerOutput" -ForegroundColor Green
        Write-Host "SHA256: $installerHash"
    }
} finally {
    if ($KeepStaging) {
        Write-Host "Staging workspace retained: $stageRoot"
    } elseif (Test-Path -LiteralPath $stageRoot) {
        $resolvedStage = [IO.Path]::GetFullPath($stageRoot)
        $resolvedOutput = [IO.Path]::GetFullPath($outputRoot).TrimEnd('\') + '\'
        if (-not $resolvedStage.StartsWith($resolvedOutput, [StringComparison]::OrdinalIgnoreCase) -or
            -not ([IO.Path]::GetFileName($resolvedStage)).StartsWith("staging-")) {
            throw "Refusing to remove unexpected staging path: $resolvedStage"
        }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
