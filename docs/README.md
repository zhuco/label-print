# 文档导航与第一版功能状态

最后更新：2026-08-07

本文是仓库文档的统一入口，也是第一版功能状态的唯一摘要。详细设计以专题文档为准；尚未完成的工作统一维护在[第一版待实现与发布验收](v1-pending-implementation.md)中。

状态说明：

- **已完成**：代码中已有桌面端入口和对应后端/本地能力。
- **部分完成**：主体能力可用，但仍有明确的功能缺口或发布闭环未完成。
- **待实现**：当前没有满足第一版要求的完整实现。

## 第一版核心功能状态

| 第一版要求 | 状态 | 用户入口 | 当前说明 |
| --- | --- | --- | --- |
| 注册、登录、退出 | 已完成 | 首页 → 我的标签 → 登录 / 注册 | 支持注册、登录、退出、忘记密码、重置密码和账号注销。生产环境的密码邮件依赖 SMTP 配置。 |
| 默认保持登录状态 | 已完成 | 无需手动操作，桌面端启动时自动恢复 | Windows 桌面端把访问令牌和刷新令牌保存到 Windows 凭据管理器；启动时自动恢复，访问令牌失效后自动刷新，主动退出才清除。发布前仍需安装包重启真机验收。 |
| 统一保存 | 已完成 | 编辑器顶部“保存” / `Ctrl+S` | 默认打开云端标签，可按分类文件夹保存；也可切换到本地保存 `.lpt`，支持另存为、最近使用记录和未保存关闭提醒。 |
| 云端保存 | 已完成 | 统一保存窗口 → “云端标签” | 支持创建、更新、重命名、分类选择、离线队列、自动重试和 revision 冲突处理；本地文件不会未经用户操作自动上传。 |
| 打印 | 已完成（待真机验收） | 编辑器顶部“打印” / `Ctrl+P` | 支持单标签与 CSV/Excel 多行数据逐行渲染；每条记录生成独立打印图，Windows 驱动打印与 PDF 输出按“数据行数 × 每行份数”执行。发布前仍须通过真实打印机、尺寸与条码扫描验收。 |
| 个人空间标签 | 已完成 | 首页 → 我的标签 | 支持列表、搜索、分页、打开、复制、回收站、恢复、永久删除、离线缓存和冲突处理。 |
| 图片元素 | 已完成 | 编辑器左侧“图片”；右侧属性 → 图片资源 | 支持本地图片嵌入；保存到云端时上传为个人资源，云标签打开时下载并缓存。 |
| 标签数量上限 | 已完成 | 首页 → 我的标签 → 套餐与配额 | 服务端强制执行免费版 50 个、专业版 200 个，回收站标签仍占名额，永久删除后释放；创建、复制、官方模板创建、永久删除与成功同步后，桌面端立即刷新服务端用量。 |
| 应用更新 | 已完成（待生产演练） | 首页 → 我的标签 → 检查更新；启动后自动检查 | 第一版采用签名的完整更新包，支持灰度发布、强制更新策略和安装安全拦截；生产私钥、产物上传、代码签名和跨版本安装演练仍须在正式环境完成。二进制差分补丁属于 P1。 |

## 已完成功能的代码入口

| 能力 | 桌面端入口 | 服务端/本地入口 |
| --- | --- | --- |
| 账号和登录保持 | `apps/desktop/src/features/home/CloudAuthModal.tsx`、`apps/desktop/src/features/cloud/auth-session.ts`、`apps/desktop/src/features/cloud/credentials.ts` | `apps/server/src/app.ts`、`apps/desktop/src-tauri/src/commands/cloud_commands.rs` |
| 本地与云端保存 | `apps/desktop/src/App.tsx`、`apps/desktop/src/features/cloud/label-repository.ts` | `apps/desktop/src-tauri/src/commands/template_commands.rs`、`apps/server/src/postgres-store.ts` |
| 个人空间 | `apps/desktop/src/features/home/HomePage.tsx` | `apps/server/src/app.ts`、`apps/server/src/store.ts`、`apps/server/src/postgres-store.ts` |
| 图片元素与云资源 | `apps/desktop/src/features/editor/EditorPage.tsx`、`apps/desktop/src/features/editor/RightInspector.tsx`、`apps/desktop/src/features/cloud/asset-repository.ts` | `apps/server/src/object-storage.ts`、`apps/server/src/postgres-store.ts` |
| 标签配额 | `apps/desktop/src/features/home/HomePage.tsx` | `packages/api-contract/src/index.ts`、`apps/server/src/store.ts`、`apps/server/src/postgres-store.ts` |
| 打印 | `apps/desktop/src/features/editor/PrintSubmitModal.tsx`、`apps/desktop/src/services/ipc/print.ts` | `apps/desktop/src-tauri/src/commands/print_commands.rs` |
| 自动更新 | `apps/desktop/src/features/updates/update.service.ts` | `apps/server/src/app.ts`、`scripts/build-updater-artifacts.ps1` |

## 专题文档

- [第一版待实现与发布验收](v1-pending-implementation.md)：只维护未完成项、优先级和验收标准。
- [个人云空间开发文档](personal-cloud-development.md)：账号、云标签、资源、配额、缓存、同步与更新的设计基线。
- [云 API 运行说明](../apps/server/README.md)：本地联调、PostgreSQL、对象存储、SMTP、监控、订阅回调和发布记录。
- [自动更新发布](updater-release.md)：更新密钥、签名、构建和发布流程。
- [云服务备份与恢复演练](backup-restore.md)：PostgreSQL 与对象存储备份、隔离恢复验证。
- [Windows 7 构建](windows-7-build.md)：Windows 7 兼容构建边界。
- [版本发布说明](release-notes/)：已发布版本的变更记录。

## 维护规则

1. 功能完成后，先更新本页状态和用户入口。
2. 待实现项只在 `v1-pending-implementation.md` 维护，避免 README、设计文档和发布说明出现多套进度。
3. 发布说明只记录对应版本已经交付的内容，不作为未来需求清单。
4. “已完成”指代码和入口存在；是否允许正式发布还要满足安装包、云环境、真实打印机和升级链路验收。
