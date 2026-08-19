# VPS deployment

The production stack is deliberately separate from the other services on the
VPS: its PostgreSQL instance is internal to its Docker network, MinIO is only
reachable through Caddy, and the API only listens on `127.0.0.1:8787`.

## DNS

Create this record before enabling the Caddy snippet:

| Host | Type | Value |
| --- | --- | --- |
| `api1.hengceyun.com` | A | `8.163.42.170` |

The API, desktop updater and signed MinIO upload/download URLs use `api1`.
MinIO is routed only for unknown root paths after API and `/downloads/` routes;
do not proxy it through a path prefix, which would invalidate AWS Signature V4.

## First deployment

1. Copy `apps/server/compose.production.yml` and a private `.env` to
   `/opt/label-cloud/` (`.env` must be `0600`).
2. Load an image named `label-cloud-api:latest` on the VPS.
3. Append `deploy/label-cloud/Caddyfile.snippet` to `/etc/caddy/Caddyfile`,
   validate it with `caddy validate --config /etc/caddy/Caddyfile`, then reload
   Caddy.
4. Run `docker compose up -d` in `/opt/label-cloud` and confirm
   `https://api1.hengceyun.com/healthz` returns `200`.

## Backup

`backup-cloud.sh` produces a PostgreSQL custom-format dump, a MinIO bucket
mirror and a SHA-256 manifest under `/opt/label-cloud/backups/<UTC timestamp>`.
Its systemd service uses idle I/O priority and a CPU quota so backups do not
compete with interactive use. Install it with:

```sh
install -m 700 backup-cloud.sh /opt/label-cloud/backup-cloud.sh
install -m 644 label-cloud-backup.service /etc/systemd/system/
install -m 644 label-cloud-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now label-cloud-backup.timer
systemctl start label-cloud-backup.service
```

No recovery point is automatically deleted. Monitor free disk space and move
completed backup directories to a separate provider (such as Alibaba Cloud OSS)
before manually pruning local copies. A same-VPS backup does not protect against
loss of the VPS itself.

## Release files

Copy signed `.exe`/`.msi` installers and Tauri updater artifacts into
`/var/www/label-cloud/releases/`. Their public URL is
`https://api1.hengceyun.com/downloads/<filename>`.

The Windows code-signing certificate and the Tauri updater private key are
independent secrets. A public installer may be distributed before the OV
certificate arrives, but Windows SmartScreen warnings are expected; do not use
a self-signed certificate for public distribution.
