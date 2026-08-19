# 自动更新发布

桌面端使用 Tauri 2 updater，并从 `GET /api/v1/desktop-updates/{target}/{arch}/{currentVersion}` 获取动态更新信息。更新 API 只返回已签名产物的 CDN 地址和签名，绝不返回对象存储凭证。

首次发布前，发布管理员生成一对 Tauri updater 密钥，将私钥安全地备份并保存为 CI 密钥；公钥会在构建时编译进应用。私钥不得提交到仓库或桌面安装包。使用带口令的非交互模式生成密钥：

```powershell
pnpm --filter @label/desktop exec tauri signer generate `
  --write-keys .\tauri-updater.key `
  --password "<存入密码管理器的强口令>" `
  --ci
```

构建环境应只设置以下两项中的一项：`TAURI_SIGNING_PRIVATE_KEY`（密钥内容）或 `TAURI_SIGNING_PRIVATE_KEY_PATH`（密钥文件路径），并同时设置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。私钥和口令两者缺失任一项都会使已安装客户端无法接受今后的更新。

首个离线 MSI 也必须编译进更新公钥、云端 API 和更新端点；否则已安装的用户无法收到后续版本。使用以下脚本构建该安装包（不会生成更新产物）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-tauri-msi.ps1 `
  -CloudApiBaseUrl "https://api1.hengceyun.com" `
  -UpdaterPublicKey "<public key content>" `
  -CertificateThumbprint "<OV 证书指纹>" `
  -TimestampUrl "<证书服务商提供的 RFC 3161 时间戳 URL>" `
  -NoPause
```

随后使用以下脚本构建带签名的更新产物。脚本会临时启用 `createUpdaterArtifacts`，并强制使用轻量的 WebView 下载引导包；它需要 CI 中的发布私钥：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "<private key file path>"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<private key password>"
pnpm exec powershell -ExecutionPolicy Bypass -File scripts/build-updater-artifacts.ps1 `
  -UpdaterPublicKey "<public key content>" `
  -CloudApiBaseUrl "https://api1.hengceyun.com" `
  -Channel stable `
  -CertificateThumbprint "<OV 证书指纹>" `
  -TimestampUrl "<证书服务商提供的 RFC 3161 时间戳 URL>" `
  -NoPause
```

直接下载的公开 Windows 包必须使用可信 CA 的 OV 代码签名证书。将证书安装/连接到发布 Windows 机器的证书存储或硬件令牌后，安装 Windows SDK Signing Tools；两个构建脚本都会使用 SHA-256 和时间戳签名。`build-tauri-msi.ps1` 在 WiX 重新链接 MSI 后使用 `scripts/sign-windows-artifact.ps1` 签名并用 `Get-AuthenticodeSignature` 验证。更新构建则把证书参数交给 Tauri，使 Windows 签名发生在生成 Tauri `.sig` 之前；**不得在 `.sig` 生成后再签名更新包**。

脚本只在系统临时目录生成一次性 Tauri 配置，构建后立即删除。不要把生成的配置或密钥写入 Git。将安装包、`.sig` 和 SHA-256 一并上传，随后创建/发布服务器端 release 记录；beta 验证通过后再逐步增加 stable 的 `rollout_percent`。将该值置为 `0` 可立即停止向新设备下发问题版本。

发布记录通过服务器私有的 `PUT /api/v1/internal/desktop-releases` 接口写入。为服务器设置 `RELEASE_ADMIN_TOKEN`，并只在 CI/CD 密钥系统中配置同名令牌。请求必须携带 `Authorization: Bearer <RELEASE_ADMIN_TOKEN>`；接口只接受 HTTPS 更新包、有效 SemVer、Tauri 签名、SHA-256 和 0–100 的灰度比例。发布流不得把该令牌或 Tauri 私钥写入桌面安装包。

若某个客户端版本不再兼容云 API，在发布记录中设置 `minimumSupportedVersion` 与 `mandatory: true`。更新接口会把这两个字段作为额外元数据返回；Tauri 会保留它们，桌面端据此明确提示用户升级。用户拒绝更新时，本地文件打开、导出和打印仍可继续使用。
