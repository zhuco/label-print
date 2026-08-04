Param(
    [string]$Path = "",
    [switch]$ListAll
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Path)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $root = Split-Path -Parent $scriptDir
    $Path = Join-Path $root "apps\desktop\src-tauri\target-win7\release\label-desktop.exe"
}

$Path = [IO.Path]::GetFullPath($Path)
if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Executable not found: $Path"
}

[byte[]]$script:Bytes = [IO.File]::ReadAllBytes($Path)

function Read-U16([int]$Offset) {
    return [BitConverter]::ToUInt16($script:Bytes, $Offset)
}

function Read-U32([int]$Offset) {
    return [BitConverter]::ToUInt32($script:Bytes, $Offset)
}

function Read-U64([int]$Offset) {
    return [BitConverter]::ToUInt64($script:Bytes, $Offset)
}

function Read-AsciiZ([int]$Offset) {
    $end = $Offset
    while ($end -lt $script:Bytes.Length -and $script:Bytes[$end] -ne 0) {
        $end++
    }
    if ($end -ge $script:Bytes.Length) {
        throw "Unterminated PE string at file offset $Offset"
    }
    return [Text.Encoding]::ASCII.GetString($script:Bytes, $Offset, $end - $Offset)
}

if ((Read-U16 0) -ne 0x5A4D) {
    throw "Not a PE executable (missing MZ header): $Path"
}

$peOffset = [int](Read-U32 0x3C)
if ((Read-U32 $peOffset) -ne 0x00004550) {
    throw "Not a PE executable (missing PE header): $Path"
}

$sectionCount = [int](Read-U16 ($peOffset + 6))
$optionalHeaderSize = [int](Read-U16 ($peOffset + 20))
$optionalHeaderOffset = $peOffset + 24
$magic = Read-U16 $optionalHeaderOffset

switch ($magic) {
    0x20B {
        $pointerSize = 8
        $ordinalMask = [UInt64]::Parse("8000000000000000", [Globalization.NumberStyles]::HexNumber)
        $dataDirectoryOffset = $optionalHeaderOffset + 112
        $architecture = "x64"
    }
    0x10B {
        $pointerSize = 4
        $ordinalMask = [UInt64]::Parse("80000000", [Globalization.NumberStyles]::HexNumber)
        $dataDirectoryOffset = $optionalHeaderOffset + 96
        $architecture = "x86"
    }
    default { throw ("Unsupported PE optional header: 0x{0:X}" -f $magic) }
}

$sectionHeadersOffset = $optionalHeaderOffset + $optionalHeaderSize

function Convert-RvaToOffset([UInt32]$Rva) {
    for ($index = 0; $index -lt $sectionCount; $index++) {
        $sectionOffset = $sectionHeadersOffset + (40 * $index)
        $virtualSize = [UInt32](Read-U32 ($sectionOffset + 8))
        $virtualAddress = [UInt32](Read-U32 ($sectionOffset + 12))
        $rawSize = [UInt32](Read-U32 ($sectionOffset + 16))
        $rawOffset = [UInt32](Read-U32 ($sectionOffset + 20))
        $mappedSize = [Math]::Max([UInt64]$virtualSize, [UInt64]$rawSize)

        if ([UInt64]$Rva -ge [UInt64]$virtualAddress -and
            [UInt64]$Rva -lt ([UInt64]$virtualAddress + $mappedSize)) {
            return [int]([UInt64]$rawOffset + ([UInt64]$Rva - [UInt64]$virtualAddress))
        }
    }
    throw ("Unable to map RVA 0x{0:X}" -f $Rva)
}

$importDirectoryRva = [UInt32](Read-U32 ($dataDirectoryOffset + 8))
if ($importDirectoryRva -eq 0) {
    throw "PE file has no import directory: $Path"
}

$imports = New-Object System.Collections.Generic.List[object]
$descriptorOffset = Convert-RvaToOffset $importDirectoryRva

while ((Read-U32 $descriptorOffset) -ne 0) {
    $lookupRva = [UInt32](Read-U32 $descriptorOffset)
    $nameRva = [UInt32](Read-U32 ($descriptorOffset + 12))
    if ($lookupRva -eq 0) {
        $lookupRva = [UInt32](Read-U32 ($descriptorOffset + 16))
    }

    $dll = Read-AsciiZ (Convert-RvaToOffset $nameRva)
    $thunkOffset = Convert-RvaToOffset $lookupRva

    while ($true) {
        if ($pointerSize -eq 8) {
            $thunkValue = [UInt64](Read-U64 $thunkOffset)
        } else {
            $thunkValue = [UInt64](Read-U32 $thunkOffset)
        }
        if ($thunkValue -eq 0) {
            break
        }

        if (($thunkValue -band $ordinalMask) -eq 0) {
            $importByNameRva = [UInt32]$thunkValue
            $function = Read-AsciiZ ((Convert-RvaToOffset $importByNameRva) + 2)
            $imports.Add([pscustomobject]@{ Dll = $dll; Function = $function })
        }
        $thunkOffset += $pointerSize
    }
    $descriptorOffset += 20
}

# This is intentionally a deny list, not a claim that every other Win32 API is
# available on an unpatched Win7 installation. Add an entry whenever a newer API
# enters the release binary; the Win7 VM smoke test remains the final authority.
$forbidden = @{
    "GetSystemTimePreciseAsFileTime" = "requires Windows 8"
    "GetSystemTimeAdjustmentPrecise" = "requires Windows 8"
    "CreateFile2"                    = "requires Windows 8"
    "WaitOnAddress"                  = "requires Windows 8"
    "WakeByAddressAll"               = "requires Windows 8"
    "WakeByAddressSingle"            = "requires Windows 8"
    "GetCurrentPackageFamilyName"    = "requires Windows 8"
    "GetCurrentPackageFullName"      = "requires Windows 8"
    "GetCurrentPackageId"            = "requires Windows 8"
    "GetPackageFamilyName"           = "requires Windows 8"
    "GetPackagePathByFullName"       = "requires Windows 8"
    "GetProcessMitigationPolicy"     = "requires Windows 8"
    "DiscardVirtualMemory"           = "requires Windows 8.1"
    "SetThreadDescription"           = "requires Windows 10"
    "GetSystemCpuSetInformation"     = "requires Windows 10"
    "SetThreadSelectedCpuSets"       = "requires Windows 10"
    "IsWow64Process2"                = "requires Windows 10"
}

$forbiddenDllPatterns = @(
    [pscustomobject]@{
        Pattern = "api-ms-win-core-winrt-*.dll"
        Reason = "Windows Runtime API sets require Windows 8 or later"
    }
)

if ($ListAll) {
    $imports | Sort-Object Dll, Function | Format-Table -AutoSize
}

$violations = @(
    foreach ($import in $imports) {
        if ($forbidden.ContainsKey($import.Function)) {
            [pscustomobject]@{
                Dll = $import.Dll
                Function = $import.Function
                Reason = $forbidden[$import.Function]
            }
            continue
        }
        foreach ($rule in $forbiddenDllPatterns) {
            if ($import.Dll -like $rule.Pattern) {
                [pscustomobject]@{
                    Dll = $import.Dll
                    Function = $import.Function
                    Reason = $rule.Reason
                }
            }
        }
    }
)
$dllCount = @($imports | Select-Object -ExpandProperty Dll -Unique).Count
Write-Host "PE import check: $Path"
Write-Host "Architecture: $architecture; DLLs: $dllCount; named imports: $($imports.Count)"

if ($violations.Count -gt 0) {
    Write-Host "Win7-incompatible static imports found:" -ForegroundColor Red
    foreach ($violation in $violations) {
        Write-Host ("  {0}!{1} - {2}" -f $violation.Dll, $violation.Function, $violation.Reason) -ForegroundColor Red
    }
    exit 1
}

Write-Host "PASS: no known post-Win7 static imports were found." -ForegroundColor Green
