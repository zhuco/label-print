Param(
    [switch]$SkipPnpmBuild,
    [switch]$NoPause
)

function WaitForKey {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "请按任意键继续..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Invoke-External {
    Param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$Arguments = @()
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        $argText = if ($Arguments.Count -gt 0) { " $($Arguments -join ' ')" } else { "" }
        throw "命令执行失败(ExitCode=$LASTEXITCODE): $FilePath$argText"
    }
}

function Update-WixLocaleForZhCn {
    Param(
        [Parameter(Mandatory = $true)]
        [string]$LocaleFile
    )

    $locale = @'
<WixLocalization Culture="zh-CN" Codepage="936" xmlns="http://schemas.microsoft.com/wix/2006/localization">
  <String Id="TauriLanguage">2052</String>
  <String Id="TauriCodepage">936</String>
  <String Id="LaunchApp">启动恒策标签条码打印软件</String>
  <String Id="DowngradeErrorMessage">已安装更高版本的恒策标签条码打印软件。</String>
  <String Id="PathEnvVarFeature">将恒策标签条码打印软件可执行文件目录添加到 PATH 系统环境变量，以便在任意目录调用该程序。</String>
  <String Id="InstallAppFeature">安装恒策标签条码打印软件。</String>
</WixLocalization>
'@
    Set-Content -Path $LocaleFile -Value $locale -Encoding UTF8
}

function Update-WixMainWxs {
    Param(
        [Parameter(Mandatory = $true)]
        [string]$MainWxs,
        [Parameter(Mandatory = $true)]
        [string]$ProductName,
        [Parameter(Mandatory = $true)]
        [string]$ShortcutDescription
    )

    $lines = New-Object System.Collections.Generic.List[string]
    Get-Content -Path $MainWxs -Encoding UTF8 | ForEach-Object { [void]$lines.Add($_) }
    $start = -1
    $end = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($start -eq -1 -and $lines[$i] -match "<UI>") {
            $start = $i
        }
        elseif ($end -eq -1 -and $lines[$i] -match "<UIRef") {
            $end = $i
        }
    }
    Write-Host "UI 区间：start=$start, end=$end"
    if ($start -ge 0 -and $end -ge $start) {
        $lines.RemoveRange($start, $end - $start + 1)
    }

    $content = $lines -join "`r`n"
    $content = $content -replace 'Description="[^"]+"', "Description=""$ShortcutDescription"""

    # Tauri/WiX 产物可能在某些环境下把中文名称写成乱码；以配置中的产品名为准整体纠正。
    $currentNameMatch = [regex]::Match($content, '(?s)<Product\b[^>]*\bName="([^"]+)"')
    if ($currentNameMatch.Success) {
        $currentName = $currentNameMatch.Groups[1].Value
        if ($currentName -ne $ProductName) {
            $content = $content.Replace($currentName, $ProductName)
        }
    }

    # 明确指定 MSI 数据库代码页，避免中文名称触发 LGHT0311。
    $productTagMatch = [regex]::Match($content, '(?s)<Product\b[^>]*>')
    if ($productTagMatch.Success) {
        $productTag = $productTagMatch.Value
        if ($productTag -match '\bCodepage="[^"]*"') {
            $newProductTag = [regex]::Replace($productTag, '\bCodepage="[^"]*"', 'Codepage="936"')
        } else {
            $newProductTag = $productTag -replace '>$', ' Codepage="936">'
        }
        $content = $content.Substring(0, $productTagMatch.Index) + $newProductTag + $content.Substring($productTagMatch.Index + $productTagMatch.Length)
    }

    # 卸载快捷方式统一中文名称。
    $content = [regex]::Replace($content, 'Name="Uninstall\s+[^"]+"', "Name=""卸载 $ProductName""")

    Set-Content -Path $MainWxs -Value $content -Encoding UTF8
}

function Sync-BrandIcons {
    Param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$Desktop
    )

    $logoSource = Join-Path $Root "docs\logo.png"
    if (-not (Test-Path $logoSource)) {
        Write-Host "未找到 docs/logo.png，跳过图标同步。"
        return
    }

    Add-Type -AssemblyName System.Drawing
    $logoImage = [System.Drawing.Image]::FromFile($logoSource)
    $tempLogo = Join-Path $env:TEMP "label-print-logo-square.png"
    try {
        if ($logoImage.Width -eq $logoImage.Height) {
            Copy-Item -LiteralPath $logoSource -Destination $tempLogo -Force
        } else {
            $side = [Math]::Max($logoImage.Width, $logoImage.Height)
            $canvas = New-Object System.Drawing.Bitmap $side, $side, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            $graphics = [System.Drawing.Graphics]::FromImage($canvas)
            try {
                $graphics.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $offsetX = [int](($side - $logoImage.Width) / 2)
                $offsetY = [int](($side - $logoImage.Height) / 2)
                $graphics.DrawImage($logoImage, $offsetX, $offsetY, $logoImage.Width, $logoImage.Height)
                $canvas.Save($tempLogo, [System.Drawing.Imaging.ImageFormat]::Png)
            } finally {
                $graphics.Dispose()
                $canvas.Dispose()
            }
        }
    } finally {
        $logoImage.Dispose()
    }

    Write-Host "同步品牌图标：$logoSource -> $tempLogo"
    Push-Location $Desktop
    try {
        pnpm --filter @label/desktop exec tauri icon $tempLogo
        if ($LASTEXITCODE -ne 0) {
            throw "tauri icon 生成失败(ExitCode=$LASTEXITCODE)"
        }
    } finally {
        Pop-Location
        if (Test-Path $tempLogo) {
            Remove-Item -LiteralPath $tempLogo -Force
        }
    }

    $iconDir = Join-Path $Desktop "src-tauri\icons"
    $keep = @("icon.ico", "icon.png")
    Get-ChildItem -Path $iconDir -Force | Where-Object { $keep -notcontains $_.Name } | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }

    $frontendLogo = Join-Path $Desktop "src\assets\icons\logo.png"
    Copy-Item -LiteralPath (Join-Path $iconDir "icon.png") -Destination $frontendLogo -Force
}

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$desktop = Join-Path $root "apps\desktop"
$tauriConfigPath = Join-Path $desktop "src-tauri\tauri.conf.json"
$tauriTools = Join-Path $env:LOCALAPPDATA "tauri\WixTools314"
$wixDir = Join-Path $desktop "src-tauri\target\release\wix\x64"
$msiOut = Join-Path $desktop "src-tauri\target\release\bundle\msi"

try {
    Sync-BrandIcons -Root $root -Desktop $desktop

    if (-not $SkipPnpmBuild) {
        Write-Host "正在运行 pnpm tauri build（不打包）..."
        $env:TAURI_BINARY_RELEASES_BASE_URL = "file://$($env:USERPROFILE)\.cache\tauri\binary-releases"
        pnpm --filter @label/desktop exec tauri build -- --no-bundle
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm tauri build 失败(ExitCode=$LASTEXITCODE)"
        }
    }

    Write-Host "处理 WiX 输出：$wixDir"
    if (-not (Test-Path $wixDir)) {
        throw "无法找到 WiX 输出目录：$wixDir"
    }
    if (-not (Test-Path $tauriConfigPath)) {
        throw "无法找到 Tauri 配置文件：$tauriConfigPath"
    }
    $tauriConfig = Get-Content -Path $tauriConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $productName = [string]$tauriConfig.productName
    if ([string]::IsNullOrWhiteSpace($productName)) {
        throw "tauri.conf.json 缺少 productName"
    }
    $shortcutDescription = [string]$tauriConfig.bundle.fileAssociations[0].name
    if ([string]::IsNullOrWhiteSpace($shortcutDescription)) {
        $shortcutDescription = "$productName 模板文件"
    }

    $mainWxs = Join-Path $wixDir "main.wxs"
    if (-not (Test-Path $mainWxs)) {
        throw "缺少 main.wxs"
    }

    Write-Host "处理 UI/描述字段..."
    Update-WixMainWxs -MainWxs $mainWxs -ProductName $productName -ShortcutDescription $shortcutDescription

    Write-Host "处理 WiX 语言与代码页..."
    $localeWxl = Join-Path $wixDir "locale.wxl"
    Update-WixLocaleForZhCn -LocaleFile $localeWxl

    if (-not (Test-Path $tauriTools)) {
        throw "未找到 WixTools，请确保 Tauri 下载完成：$tauriTools"
    }

    $candle = Join-Path $tauriTools "candle.exe"
    $light = Join-Path $tauriTools "light.exe"
    if (-not (Test-Path $candle) -or -not (Test-Path $light)) {
        throw "candle/light 未找到：$tauriTools"
    }

    Write-Host "编译 WXS 文件..."
    Push-Location $wixDir
    try {
        Invoke-External -FilePath $candle -Arguments @("-out", "main.wixobj", "main.wxs")
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $msiOut)) {
        New-Item -ItemType Directory -Path $msiOut | Out-Null
    }

    $outMsi = Join-Path $msiOut "恒策标签条码打印软件_0.1.1_x64_zh-CN.msi"
    Write-Host "链接 MSI 包..."
    Push-Location $wixDir
    try {
        Invoke-External -FilePath $light -Arguments @("-loc", "locale.wxl", "-out", $outMsi, "main.wixobj")
    } finally {
        Pop-Location
    }
    Write-Host "MSI 已生成：$outMsi"
} catch {
    Write-Host "发生错误：" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    $_ | Format-List -Force
    exit 1
} finally {
    if (-not $NoPause) {
        WaitForKey
    }
}
