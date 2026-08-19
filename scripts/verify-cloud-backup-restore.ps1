[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupDirectory,
  [string]$MinioAccessKey = "local-label-access",
  [string]$MinioSecretKey = "local-label-secret",
  [string]$McImage = "minio/mc:RELEASE.2025-04-16T18-13-26Z"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker Desktop CLI is required." }
$backupPath = (Resolve-Path -LiteralPath $BackupDirectory).Path
$manifestPath = Join-Path $backupPath "manifest.json"
$dumpPath = Join-Path $backupPath "database.dump"
if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $dumpPath)) {
  throw "Backup directory must contain manifest.json and database.dump."
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$actualHash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $manifest.databaseSha256) { throw "Database dump SHA-256 does not match its manifest." }
$objectsPath = Join-Path $backupPath "objects\$($manifest.bucket)"
if (-not (Test-Path -LiteralPath $objectsPath)) { throw "Object backup path is missing: $objectsPath" }

$minioContainer = (docker compose -f $manifest.composeFile ps -q minio | Out-String).Trim()
if (-not $minioContainer) { throw "The source MinIO service must be running for the object restore drill." }
$network = (& docker inspect --format '{{range $key, $value := .NetworkSettings.Networks}}{{$key}}{{end}}' $minioContainer | Out-String).Trim()
if (-not $network) { throw "Unable to resolve the MinIO Docker network." }

$suffix = [Guid]::NewGuid().ToString("N")
$restoreName = "label-cloud-restore-$suffix"
$restoreBucket = "label-assets-restore-$suffix"
$restoreContainer = $null
try {
  $restoreContainer = (& docker run -d --rm --name $restoreName --network $network -e POSTGRES_DB=label_cloud -e POSTGRES_USER=label -e POSTGRES_PASSWORD=restore-only-password postgres:16-alpine | Out-String).Trim()
  if (-not $restoreContainer) { throw "Unable to create isolated restore PostgreSQL container." }
  $deadline = (Get-Date).AddSeconds(30)
  $databaseReady = $false
  $probeCommand = "psql -U label -d label_cloud -tAc 'SELECT 1' 2>/dev/null"
  do {
    # The official image briefly starts a bootstrap PostgreSQL process, then stops it before
    # launching the long-lived server. Require two real SQL queries one second apart so restore
    # never starts against that transient bootstrap process.
    $firstProbe = (& docker exec $restoreContainer /bin/sh -c $probeCommand | Out-String).Trim()
    $firstProbeExitCode = $LASTEXITCODE
    if ($firstProbeExitCode -eq 0 -and $firstProbe -eq "1") {
      Start-Sleep -Seconds 1
      $secondProbe = (& docker exec $restoreContainer /bin/sh -c $probeCommand | Out-String).Trim()
      if ($LASTEXITCODE -eq 0 -and $secondProbe -eq "1") {
        $databaseReady = $true
        break
      }
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  if (-not $databaseReady) { throw "Isolated restore PostgreSQL did not become ready." }

  & docker cp $dumpPath "${restoreContainer}:/tmp/database.dump"
  if ($LASTEXITCODE -ne 0) { throw "Copying database dump into restore container failed." }
  & docker exec $restoreContainer /bin/sh -c 'PGPASSWORD=$POSTGRES_PASSWORD pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists /tmp/database.dump'
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed." }
  $countCommand = "PGPASSWORD=`$POSTGRES_PASSWORD psql -U `$POSTGRES_USER -d `$POSTGRES_DB -tA -c 'SELECT (SELECT COUNT(*) FROM auth_users), (SELECT COUNT(*) FROM label_documents), (SELECT COUNT(*) FROM label_assets)'"
  $restoredCounts = (& docker exec $restoreContainer /bin/sh -c $countCommand | Out-String).Trim().Split("|")
  if ($restoredCounts.Count -ne 3) { throw "Unable to read restored PostgreSQL verification counts." }
  foreach ($field in @("users", "labels", "assets")) {
    $index = @{ users = 0; labels = 1; assets = 2 }[$field]
    if ($manifest.PSObject.Properties.Name -contains $field -and [int]$restoredCounts[$index] -ne [int]$manifest.$field) {
      throw "Restored $field count does not match the backup manifest."
    }
  }

  $mount = "type=bind,source=$backupPath,target=/backup,readonly"
  $restoreObjectsCommand = "mc alias set local http://minio:9000 '$MinioAccessKey' '$MinioSecretKey' >/dev/null && mc mb local/$restoreBucket >/dev/null && mc mirror /backup/objects/$($manifest.bucket) local/$restoreBucket >/dev/null && mc find local/$restoreBucket | wc -l"
  $restoredObjectLines = (& docker run --rm --network $network --mount $mount --entrypoint /bin/sh $McImage -c $restoreObjectsCommand | Out-String).Trim()
  $restoredObjectCount = [int](($restoredObjectLines -split "\r?\n")[-1])
  if ($restoredObjectCount -ne [int]$manifest.objectFiles) { throw "Restored object count does not match the backup manifest." }

  [pscustomobject]@{
    BackupDirectory = $backupPath
    RestoredUsers = [int]$restoredCounts[0]
    RestoredLabels = [int]$restoredCounts[1]
    RestoredAssets = [int]$restoredCounts[2]
    RestoredObjects = $restoredObjectCount
    Verified = $true
  } | ConvertTo-Json
} finally {
  if ($restoreContainer) { & docker rm -f $restoreContainer 2>$null | Out-Null }
  if ($network -and $restoreBucket) {
    $cleanupCommand = "mc alias set local http://minio:9000 '$MinioAccessKey' '$MinioSecretKey' >/dev/null && mc rb --force local/$restoreBucket >/dev/null 2>&1 || true"
    & docker run --rm --network $network --entrypoint /bin/sh $McImage -c $cleanupCommand 2>$null | Out-Null
  }
}
