Param(
    [Parameter(Mandatory = $true)]
    [string[]]$Path,
    [Parameter(Mandatory = $true)]
    [string]$CertificateThumbprint,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$TimestampUrl
)

$ErrorActionPreference = 'Stop'
$thumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
if ($thumbprint -notmatch '^[A-F0-9]{40}$') {
    throw 'CertificateThumbprint must be a SHA-1 certificate thumbprint (40 hexadecimal characters).'
}

$signTool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if ($null -eq $signTool) {
    $kitRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
    $candidate = if (Test-Path -LiteralPath $kitRoot) {
        Get-ChildItem -LiteralPath $kitRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
    }
    if ($null -eq $candidate) {
        throw 'signtool.exe was not found. Install the Windows SDK Signing Tools, then retry.'
    }
    $signTool = $candidate
}

foreach ($inputPath in $Path) {
    $artifact = Resolve-Path -LiteralPath $inputPath -ErrorAction Stop
    if ([IO.Path]::GetExtension($artifact.Path).ToLowerInvariant() -notin @('.exe', '.msi')) {
        throw "Only .exe and .msi artifacts may be signed: $artifact"
    }
    & $signTool.Source sign /sha1 $thumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $artifact.Path
    if ($LASTEXITCODE -ne 0) {
        throw "signtool failed for $artifact (exit code $LASTEXITCODE)."
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $artifact.Path
    if ($signature.Status -ne 'Valid') {
        throw "Authenticode verification failed for ${artifact}: $($signature.Status)"
    }
    $actualThumbprint = ($signature.SignerCertificate.Thumbprint -replace '\s', '').ToUpperInvariant()
    if ($actualThumbprint -ne $thumbprint) {
        throw "The signer thumbprint for $artifact does not match the requested certificate."
    }
    Write-Host "Authenticode signed and verified: $artifact"
}
