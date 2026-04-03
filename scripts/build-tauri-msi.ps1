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

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$desktop = Join-Path $root "apps\desktop"
$tauriTools = Join-Path $env:LOCALAPPDATA "tauri\WixTools314"
$wixDir = Join-Path $desktop "src-tauri\target\release\wix\x64"
$mdiOut = Join-Path $desktop "src-tauri\target\release\bundle\msi"

try {
    if (-not $SkipPnpmBuild) {
        Write-Host "正在运行 pnpm tauri build（不打包）..."
        $env:TAURI_BINARY_RELEASES_BASE_URL = "file://$($env:USERPROFILE)\.cache\tauri\binary-releases"
        pnpm --filter @label/desktop exec tauri build -- --no-bundle
    }

    Write-Host "处理 WiX 输出：$wixDir"
    if (-not (Test-Path $wixDir)) {
        throw "无法找到 WiX 输出目录：$wixDir"
    }

    $mainWxs = Join-Path $wixDir "main.wxs"
    if (-not (Test-Path $mainWxs)) {
        throw "缺少 main.wxs"
    }

    Write-Host "处理 UI/描述字段..."
    $lines = New-Object System.Collections.Generic.List[string]
    Get-Content $mainWxs | ForEach-Object { [void]$lines.Add($_) }
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
    $content = $content -replace 'Description="[^"]+"', 'Description="Label Print template file"'
    Set-Content -Path $mainWxs -Value $content -Encoding UTF8

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
    & $candle -out "main.wixobj" "main.wxs"
    Pop-Location

    if (-not (Test-Path $mdiOut)) {
        New-Item -ItemType Directory -Path $mdiOut | Out-Null
    }

    $outMsi = Join-Path $mdiOut "Label Print_0.0.5_x64_en-US.msi"
    Write-Host "链接 MSI 包..."
    Push-Location $wixDir
    & $light -loc "locale.wxl" -out $outMsi "main.wixobj"
    Pop-Location
    Write-Host "MSI 已生成：$outMsi"
} catch {
    Write-Host "发生错误：" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    $_ | Format-List -Force
} finally {
    if (-not $NoPause) {
        WaitForKey
    }
}
