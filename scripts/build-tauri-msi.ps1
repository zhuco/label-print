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
  <String Id="LaunchApp">安装完成后启动恒策标签条码打印软件（默认勾选）</String>
  <String Id="DowngradeErrorMessage">已安装更高版本的恒策标签条码打印软件。</String>
  <String Id="PathEnvVarFeature">将恒策标签条码打印软件可执行文件目录添加到 PATH 系统环境变量（高级选项）。</String>
  <String Id="InstallAppFeature">安装恒策标签条码打印软件主程序。</String>
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
        [string]$ProductVersion,
        [Parameter(Mandatory = $true)]
        [string]$ShortcutDescription
    )

    $content = Get-Content -Path $MainWxs -Raw -Encoding UTF8
    $content = $content -replace 'Description="[^"]+"', "Description=""$ShortcutDescription"""

    # 统一产品名称/版本/代码页，避免旧 WXS 残留导致升级和中文兼容问题。
    $productTagMatch = [regex]::Match($content, '(?s)<Product\b[^>]*>')
    if ($productTagMatch.Success) {
        $productTag = $productTagMatch.Value

        if ($productTag -match '\bName="[^"]*"') {
            $productTag = [regex]::Replace($productTag, '\bName="[^"]*"', "Name=""$ProductName""")
        } else {
            $productTag = $productTag -replace '>$', " Name=""$ProductName"">"
        }

        if ($productTag -match '\bVersion="[^"]*"') {
            $productTag = [regex]::Replace($productTag, '\bVersion="[^"]*"', "Version=""$ProductVersion""")
        } else {
            $productTag = $productTag -replace '>$', " Version=""$ProductVersion"">"
        }

        if ($productTag -match '\bCodepage="[^"]*"') {
            $productTag = [regex]::Replace($productTag, '\bCodepage="[^"]*"', 'Codepage="936"')
        } else {
            $productTag = $productTag -replace '>$', ' Codepage="936">'
        }

        $content = $content.Substring(0, $productTagMatch.Index) + $productTag + $content.Substring($productTagMatch.Index + $productTagMatch.Length)
    }

    $uiBlock = @'
        <UI>
            <!-- launch app checkbox -->
            <Publish Dialog="ExitDialog" Control="Finish" Event="DoAction" Value="LaunchApplication">WIXUI_EXITDIALOGOPTIONALCHECKBOX = 1 and NOT Installed</Publish>
            <Property Id="WIXUI_INSTALLDIR" Value="INSTALLDIR" />
        </UI>

        <UIRef Id="WixUI_Mondo" />
'@
    if ([regex]::IsMatch($content, '(?s)<UI>.*?</UI>\s*<UIRef[^>]+/>')) {
        $uiRegex = [regex]::new('(?s)<UI>.*?</UI>\s*<UIRef[^>]+/>')
        $content = $uiRegex.Replace($content, $uiBlock, 1)
    } else {
        $directoryTagMatch = [regex]::Match($content, '(?s)<Directory\b[^>]*\bId="TARGETDIR"[^>]*>')
        if ($directoryTagMatch.Success) {
            $content = $content.Insert($directoryTagMatch.Index, "$uiBlock`r`n")
        }
    }

    $desktopFeatureBlock = @'
            <Feature Id="CoreShortcutsFeature"
                Title="开始菜单快捷方式（必选）"
                Description="创建开始菜单入口并注册卸载项"
                Level="1"
                Absent="disallow">
                <ComponentRef Id="Path"/>
                <ComponentRef Id="CMP_UninstallShortcut" />
                <ComponentRef Id="ApplicationShortcut" />
            </Feature>

            <Feature Id="DesktopShortcutFeature"
                Title="创建桌面快捷方式"
                Description="可选：在桌面创建程序图标"
                Level="1"
                Absent="allow">
                <ComponentRef Id="ApplicationShortcutDesktop" />
            </Feature>
'@
    if ([regex]::IsMatch($content, '(?s)<Feature\s+Id="ShortcutsFeature".*?</Feature>')) {
        $shortcutRegex = [regex]::new('(?s)<Feature\s+Id="ShortcutsFeature".*?</Feature>')
        $content = $shortcutRegex.Replace($content, $desktopFeatureBlock, 1)
    }

    # 安装树仅保留核心组件与桌面图标选项，隐藏不必要的 PATH 选项，避免用户误解。
    $environmentFeatureRegex = [regex]::new('(?s)\r?\n\s*<Feature\s+Id="Environment".*?</Feature>')
    $content = $environmentFeatureRegex.Replace($content, '', 1)

    # 主功能标题与描述改为面向安装流程的中文说明。
    $mainTitleRegex = [regex]::new('(<Feature\s+Id="MainProgram"[\s\S]*?\bTitle=")[^"]+(")')
    $content = $mainTitleRegex.Replace($content, '$1安装组件$2', 1)
    $mainDescriptionRegex = [regex]::new('(<Feature\s+Id="MainProgram"[\s\S]*?\bDescription=")[^"]+(")')
    $content = $mainDescriptionRegex.Replace($content, '$1请选择安装位置与快捷方式选项。$2', 1)

    # 卸载快捷方式统一中文名称。
    $content = [regex]::Replace($content, 'Name="Uninstall\s+[^"]+"', "Name=""卸载 $ProductName""")

    Set-Content -Path $MainWxs -Value $content -Encoding UTF8
}

function Get-SafeFileNamePart {
    Param(
        [string]$Text,
        [string]$Fallback = "installer"
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $Fallback
    }

    $clean = [regex]::Replace($Text, '[\\/:*?"<>|]+', "_").Trim()
    if ([string]::IsNullOrWhiteSpace($clean)) {
        return $Fallback
    }
    return $clean
}

function Get-WebviewInstallModeType {
    Param(
        [Parameter(Mandatory = $true)]
        [psobject]$TauriConfig
    )

    $bundle = $TauriConfig.bundle
    if ($null -eq $bundle) {
        return "downloadBootstrapper (default)"
    }
    $windows = $bundle.windows
    if ($null -eq $windows) {
        return "downloadBootstrapper (default)"
    }
    $mode = $windows.webviewInstallMode
    if ($null -eq $mode) {
        return "downloadBootstrapper (default)"
    }
    if ($mode -is [string]) {
        return [string]$mode
    }
    if ($mode.PSObject.Properties.Name -contains "type") {
        return [string]$mode.type
    }
    return [string]$mode
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
        Write-Host "正在运行 pnpm tauri build（生成最新 MSI 模板）..."
        $env:TAURI_BINARY_RELEASES_BASE_URL = "file://$($env:USERPROFILE)\.cache\tauri\binary-releases"
        if (Test-Path $wixDir) {
            Write-Host "清理旧的 WiX 模板目录：$wixDir"
            Remove-Item -LiteralPath $wixDir -Recurse -Force
        }
        $tauriBuildExitCode = 0
        Push-Location $desktop
        try {
            node node_modules/@tauri-apps/cli/tauri.js build --bundles msi --no-sign
            $tauriBuildExitCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }
        if ($tauriBuildExitCode -ne 0) {
            Write-Warning "tauri build --bundles msi 退出码=$tauriBuildExitCode，继续使用已生成的 WXS 进行修正和重打包。"
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
    $version = [string]$tauriConfig.version
    if ([string]::IsNullOrWhiteSpace($version)) {
        throw "tauri.conf.json 缺少 version"
    }
    $webviewInstallModeType = Get-WebviewInstallModeType -TauriConfig $tauriConfig
    Write-Host "WebView2 安装模式：$webviewInstallModeType"
    if ($webviewInstallModeType -like "downloadBootstrapper*") {
        Write-Warning "当前为在线下载 WebView2 模式。离线/受限网络环境可能在“正在收集信息”阶段长时间无响应，建议改为 offlineInstaller。"
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
    Update-WixMainWxs -MainWxs $mainWxs -ProductName $productName -ProductVersion $version -ShortcutDescription $shortcutDescription

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
        Invoke-External -FilePath $candle -Arguments @("-ext", "WixUIExtension", "-out", "main.wixobj", "main.wxs")
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $msiOut)) {
        New-Item -ItemType Directory -Path $msiOut | Out-Null
    }

    $safeProductName = Get-SafeFileNamePart -Text $productName -Fallback "label-desktop"
    $safeVersion = Get-SafeFileNamePart -Text $version -Fallback "0.0.0"
    $outMsiName = "{0}_{1}_x64_zh-CN.msi" -f $safeProductName, $safeVersion
    $outMsi = Join-Path $msiOut $outMsiName
    Write-Host "链接 MSI 包..."
    Push-Location $wixDir
    try {
        Invoke-External -FilePath $light -Arguments @("-ext", "WixUIExtension", "-loc", "locale.wxl", "-out", $outMsi, "main.wixobj")
    } finally {
        Pop-Location
    }
    Write-Host "MSI 已生成：$outMsi"
    Write-Host "如安装异常，可执行：msiexec /i `"$outMsi`" /L*V `"$env:TEMP\$safeProductName-install.log`""
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
