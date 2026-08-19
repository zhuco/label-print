# 云服务备份与恢复演练

本地 Docker 开发栈可使用以下脚本生成 PostgreSQL 自定义格式备份、镜像 MinIO 标签资源，并在一个独立的临时 PostgreSQL 容器和临时 MinIO bucket 中执行恢复验证。它不会覆盖正在运行的 `label_cloud` 数据库或 `label-assets` bucket。

```powershell
docker compose -f apps/server/compose.local.yml up -d

powershell -ExecutionPolicy Bypass -File scripts/backup-cloud-local.ps1
# 输出 var/cloud-backups/<时间戳>

powershell -ExecutionPolicy Bypass -File scripts/verify-cloud-backup-restore.ps1 `
  -BackupDirectory E:\label-print\var\cloud-backups\<时间戳>
```

备份清单保存数据库 SHA-256、用户/标签/资源行数和对象数量。恢复演练会校验 SHA-256、恢复后的行数及对象数量；临时容器和临时 bucket 会在结束时删除，备份目录保留供人工归档。

生产环境应将同等逻辑接入受控备份存储、加密和保留策略，并定期在隔离环境运行恢复演练。生产凭据不得写入这些本地默认参数；使用脚本参数或 CI/CD 密钥注入。
