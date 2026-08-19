[CmdletBinding()]
param(
  [string]$ComposeFile,
  [string]$OutputDirectory,
  [string]$Bucket = "label-assets",
  [string]$MinioAccessKey = "local-label-access",
  [string]$MinioSecretKey = "local-label-secret",
  [string]$McImage = "minio/mc:RELEASE.2025-04-16T18-13-26Z"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $ComposeFile) { $ComposeFile = Join-Path $repositoryRoot "apps\server\compose.local.yml" }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repositoryRoot ("var\cloud-backups\" + (Get-Date -Format "yyyyMMdd-HHmmss")) }

function Invoke-DockerCompose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & docker compose -f $script:composePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed: $($Arguments -join ' ')" }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker Desktop CLI is required." }
$composePath = (Resolve-Path -LiteralPath $ComposeFile).Path
$backupPath = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $backupPath) { throw "Backup directory already exists: $backupPath" }
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

$postgresContainer = (Invoke-DockerCompose ps -q postgres | Out-String).Trim()
$minioContainer = (Invoke-DockerCompose ps -q minio | Out-String).Trim()
if (-not $postgresContainer -or -not $minioContainer) { throw "PostgreSQL and MinIO must be running before backup." }

$dumpInContainer = "/tmp/label-cloud-backup.dump"
$dumpPath = Join-Path $backupPath "database.dump"
try {
  & docker exec $postgresContainer /bin/sh -c "PGPASSWORD=`$POSTGRES_PASSWORD pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" -Fc -f $dumpInContainer"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }
  & docker cp "${postgresContainer}:$dumpInContainer" $dumpPath
  if ($LASTEXITCODE -ne 0) { throw "Copying PostgreSQL dump from Docker failed." }
} finally {
  & docker exec $postgresContainer rm -f $dumpInContainer 2>$null | Out-Null
}
$countCommand = "PGPASSWORD=`$POSTGRES_PASSWORD psql -U `$POSTGRES_USER -d `$POSTGRES_DB -tA -c 'SELECT (SELECT COUNT(*) FROM auth_users), (SELECT COUNT(*) FROM label_documents), (SELECT COUNT(*) FROM label_assets)'"
$databaseCounts = (& docker exec $postgresContainer /bin/sh -c $countCommand | Out-String).Trim().Split("|")
if ($databaseCounts.Count -ne 3) { throw "Unable to collect PostgreSQL backup verification counts." }

$network = (& docker inspect --format '{{range $key, $value := .NetworkSettings.Networks}}{{$key}}{{end}}' $minioContainer | Out-String).Trim()
if (-not $network) { throw "Unable to resolve the MinIO Docker network." }
$objectsPath = Join-Path $backupPath "objects"
New-Item -ItemType Directory -Path $objectsPath -Force | Out-Null
$mount = "type=bind,source=$backupPath,target=/backup"
$mirrorCommand = "mc alias set local http://minio:9000 '$MinioAccessKey' '$MinioSecretKey' >/dev/null && mc mirror local/$Bucket /backup/objects"
& docker run --rm --network $network --mount $mount --entrypoint /bin/sh $McImage -c $mirrorCommand
if ($LASTEXITCODE -ne 0) { throw "Object-storage backup failed." }

$metadata = [ordered]@{
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  composeFile = $composePath
  databaseDump = "database.dump"
  databaseSha256 = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
  users = [int]$databaseCounts[0]
  labels = [int]$databaseCounts[1]
  assets = [int]$databaseCounts[2]
  bucket = $Bucket
  objectFiles = @(Get-ChildItem -LiteralPath $objectsPath -File -Recurse).Count
}
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupPath "manifest.json") -Encoding utf8
Write-Output "Cloud backup created: $backupPath"
