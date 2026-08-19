# 本地云 API 运行说明

此目录的 API 实现可在本机以单进程持久化模式启动，用于联调桌面端的帐号、会员、标签和缓存功能。

```powershell
$env:LOCAL_CLOUD_STORE_FILE = "E:\label-print\var\cloud-store.json"
$env:ENABLE_DEVELOPMENT_SEED = "true"
$env:DEVELOPMENT_SEED_EMAIL = "3776878@qq.com"
$env:DEVELOPMENT_SEED_PASSWORD = "123456"
$env:DEVELOPMENT_SEED_PLAN = "pro"
$env:DEVELOPMENT_SEED_PLAN_EXPIRES_AT = "2027-08-05T23:59:59+08:00"
pnpm --filter @label/server start
```

已有本地数据文件时，也可以在工作区根目录运行 `powershell -ExecutionPolicy Bypass -File .\scripts\start-local-cloud-api.ps1` 启动持久化 API；传入 `-Foreground` 可在当前终端查看日志。

该种子仅在 `NODE_ENV` 不是 `production` 时可用，且不会输出密码或令牌。`123456` 是按你的要求保留的本地测试口令；注册和重置密码接口仍要求至少 10 个字符，正式帐号应使用强密码。

`LOCAL_CLOUD_STORE_FILE` 中只保存已加盐的密码哈希、刷新令牌哈希和业务数据，目录已被 Git 忽略。它只适合单个 API 进程。未配置 S3 时，图片资源默认存到同目录下的 `cloud-assets`；也可用 `LOCAL_CLOUD_ASSET_DIRECTORY` 指定本机目录。

## 账号注销

已登录用户可调用 `POST /api/v1/me/account-deletion`，桌面端也在“我的标签”区域提供“注销账号”入口。请求成功后会立即冻结账号、撤销全部刷新会话，并返回 14 天后的 `scheduledFor` 删除日期；桌面端会删除该用户的本地云标签、同步队列和图片缓存，但不会删除用户主动保存到本机的 `.lpt` 文件。API 进程会在启动时及此后每小时执行到期清理：先删除对应对象存储/本地图片，再通过数据库事务删除标签、资源记录、会话、账单审计、资料与账号；如果对象删除失败，数据库记录会保留并在下一次任务中重试。生产环境仍应把该保留期和清理流程写入隐私政策。

## PostgreSQL + 对象存储部署

生产进程会在绑定 HTTP 端口前校验 `DATABASE_URL`、至少 32 字节的 `ACCESS_TOKEN_SECRET`、非空 `CORS_ALLOWED_ORIGINS` 和 `S3_BUCKET`。缺少任一项都会拒绝启动，避免公网上线时意外降级到开发用的内存或本地文件存储。

公网或多实例部署必须使用 PostgreSQL。复制 `.env.example` 为本机私有环境文件后，先启动依赖并应用迁移：

```powershell
docker compose -f apps/server/compose.local.yml up --build -d
```

这会启动 PostgreSQL、MinIO、初始化 bucket、运行迁移并启动 API。仅需调试 API 时，仍可单独设置 `DATABASE_URL` 后运行 `pnpm --filter @label/server migrate` 与 `pnpm --filter @label/server start`。
若本机 8787 已被开发 API 使用，可在启动前设置 `$env:API_PORT_HOST = "8788"`。

本地 MinIO 的对象存储变量为：`S3_BUCKET=label-assets`、`S3_REGION=us-east-1`、`S3_ENDPOINT=http://127.0.0.1:9000`、`S3_ACCESS_KEY_ID=local-label-access`、`S3_SECRET_ACCESS_KEY=local-label-secret`、`S3_FORCE_PATH_STYLE=true`。设置 `S3_BUCKET` 后，API 会返回短时有效的签名上传/下载地址；上传请求必须携带 API 返回的全部请求头，完成上传时会校验对象大小、MIME 类型和 SHA-256。若 API 使用仅容器内部可见的 `S3_ENDPOINT`，还必须设置客户端可访问的 `S3_PUBLIC_ENDPOINT`；本地 Compose 已分别配置为 `http://minio:9000` 与 `http://127.0.0.1:9000`。

生产环境须设置 `CORS_ALLOWED_ORIGINS`（逗号分隔）为桌面应用/受信 Web 端的来源；不要使用 `*`。同时在 S3/MinIO 上允许这些来源对 `PUT`、`GET`、`HEAD` 的跨域访问，并允许请求头 `content-type` 与 `x-amz-checksum-sha256`。开源版 MinIO 使用服务级 `MINIO_API_CORS_ALLOW_ORIGIN` 配置显式白名单；AWS S3、R2 等支持按 bucket 配置时可按 bucket 设置。API 默认仅允许 `tauri://localhost` 与本机 Vite 开发地址。

若要启用“忘记密码”，配置 `SMTP_HOST`、`SMTP_PORT` 和 `SMTP_FROM` 即可；需要认证的服务商再同时配置 `SMTP_USER` 和 `SMTP_PASSWORD`。它支持标准 SMTP 服务商，不需要自建邮件服务器；未配置时 API 为保护用户隐私仍返回成功状态，但不会发送邮件。重置码有效期为 15 分钟，任一重置码成功使用后会撤销该账号所有刷新会话并使其他尚未使用的重置码失效。本地 Compose 包含 Mailpit，SMTP 为 `127.0.0.1:1025`、邮件查看页为 `http://127.0.0.1:8025`，用于验证流程，不能用于公网收发邮件。

部署监控可请求 `GET /healthz` 检查存活；`GET /metrics` 输出 Prometheus 指标，必须携带 `Authorization: Bearer <METRICS_TOKEN>`。指标按稳定业务操作和状态码统计，可据此告警登录、标签保存及资源上传失败率；令牌只应交给监控系统，不得写入桌面端。

本地 Docker 的 PostgreSQL 与 MinIO 备份、隔离恢复演练见 [`docs/backup-restore.md`](../../docs/backup-restore.md)。演练会校验数据库哈希、记录数和对象数，且不会覆盖运行中的开发数据。

## 套餐/订阅回调

API 提供 `POST /api/v1/internal/billing/events` 作为“支付渠道适配器 → 云服务”的内部签名中继。它不是客户端接口：桌面端无法自行提交套餐。适配器先按微信支付、支付宝或其他支付渠道的官方方式验签、核对订单和金额，再把归一化事件发送到此接口。

设置只存于服务器的 `BILLING_WEBHOOK_SECRET`。每次请求需携带当前 Unix 时间戳 `x-billing-timestamp`（10 或 13 位，5 分钟有效）和 `x-billing-signature`；签名为 `HMAC-SHA256("<timestamp>.<原始 JSON 请求体>", secret)` 的小写十六进制。请求体包含 `provider`、渠道唯一的 `eventId`、`userId`、`type`、`plan`、`planExpiresAt` 和 `occurredAt`。服务端会：

- 验证签名和时间窗，并对入口限流；
- 用 `(provider, eventId)` 去重，支持渠道重试；
- 只接受四类订阅生命周期事件；
- 按 `occurredAt` 忽略过期事件，避免较晚到达的退款/续费回调覆盖较新的状态；
- 在 PostgreSQL 的 `billing_webhook_events` 中保留审计记录。

支付渠道的商户密钥、私钥和其原生回调验签逻辑必须只放在该适配器或受控后端，绝不能进入桌面安装包或本 API 的公开配置。

## 桌面版本发布管理

设置服务器私有的 `RELEASE_ADMIN_TOKEN` 后，可通过 `PUT /api/v1/internal/desktop-releases` 创建或更新发布记录。请求使用 `Authorization: Bearer <RELEASE_ADMIN_TOKEN>`；未配置该值时路由不会暴露。请求体须含已签名更新产物的 HTTPS 地址、Tauri 签名、SHA-256、版本、通道、灰度比例和发布时间。更新同一 `(version, channel, target, arch)` 记录并将 `rolloutPercent` 设为 `0`，即可立即停止向新客户端下发该版本。

此内部接口会严格校验 SemVer、HTTPS 地址、哈希、灰度范围和管理令牌。它只登记已由受控发布流水线构建和签名的产物；生成签名、上传文件和保管 Tauri 私钥的流程见 [`docs/updater-release.md`](../../docs/updater-release.md)。
