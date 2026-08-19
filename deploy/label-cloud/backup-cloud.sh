#!/usr/bin/env sh
set -eu

# This runs on the VPS through the accompanying low-priority systemd service.
# It intentionally does not prune backups: deleting a recovery point must be a
# reviewed operational decision, not an automatic side effect.
umask 077
app_dir=/opt/label-cloud
backup_root="$app_dir/backups"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_root/$stamp"

mkdir -p "$target/minio"
cd "$app_dir"

set -a
. "$app_dir/.env"
set +a

docker compose --env-file .env -f compose.production.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom >"$target/postgres.dump"
test -s "$target/postgres.dump"

# MinIO is private to label-cloud-network. mc copies the bucket contents rather
# than the raw volume, so a restore can recreate the bucket on another host.
docker run --rm --network label-cloud-network \
  -e "MC_HOST_label=http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  -v "$target/minio:/backup" \
  minio/mc:RELEASE.2025-04-16T18-13-26Z \
  mirror --overwrite "label/${S3_BUCKET}" /backup

{
  printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'database=%s\n' "$POSTGRES_DB"
  printf 'bucket=%s\n' "$S3_BUCKET"
} >"$target/metadata.env"

(cd "$target" && find . -type f ! -name checksums.sha256 -print0 | sort -z | xargs -0 sha256sum) >"$target/checksums.sha256"
touch "$target/COMPLETE"
printf 'Label Cloud backup complete: %s\n' "$target"
