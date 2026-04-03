# 恒策标签条码打印软件（Hengce Label Barcode Print）

开源的单机标签编辑与打印软件（Windows x64），面向通用可配置场景，支持热敏打印机与批量可变数据打印。

## 1. 项目简介

当前版本（v0.1.x）主要能力：

- Windows x64 桌面运行
- 基于系统驱动的热敏打印
- CSV / Excel 批量导入与打印
- 标签模板编辑（画布、元素、属性面板）
- 打印队列与基础校准能力
- 1366x768 到 4K 的响应式界面适配

## 2. 技术栈

- 桌面端框架：Tauri 2 + Rust
- 前端：React 18 + TypeScript + Vite
- 本地数据：SQLite（rusqlite）
- 测试：Vitest + Playwright

## 3. 环境要求

- Node.js 20+（建议 LTS）
- pnpm 10+
- Rust 工具链（用于 Tauri/Rust 代码编译和测试）
- Windows 10/11 x64

## 4. 快速开始

### 4.1 安装依赖

```bash
pnpm install
```

### 4.2 启动前端开发服务

```bash
pnpm --filter @label/desktop dev
```

### 4.3 启动 Tauri 桌面开发模式

```bash
pnpm --filter @label/desktop tauri:dev
```

## 5. 常用命令

### 5.1 根目录脚本

- `pnpm test`：运行工作区测试（包含 e2e）
- `pnpm lint`：运行工作区静态检查与乱码检查
- `pnpm check:mojibake`：执行文本乱码/编码检查
- `pnpm build-installer`：构建 Windows 安装包（PowerShell 脚本）
- `pnpm hooks:enable`：启用仓库内 Git Hooks（设置 `core.hooksPath`）

### 5.2 子项目常用命令

- 桌面前端 `@label/desktop`
  - `pnpm --filter @label/desktop dev`
  - `pnpm --filter @label/desktop test`
  - `pnpm --filter @label/desktop lint`
  - `pnpm --filter @label/desktop tauri:dev`
  - `pnpm --filter @label/desktop tauri:build`
- E2E 测试 `@label/e2e`
  - `pnpm --filter @label/e2e exec playwright install chromium`
  - `pnpm --filter @label/e2e test`

### 5.3 Rust 侧测试

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 6. 目录与文件说明

### 6.1 顶层目录

- `apps/desktop/`：桌面应用主工程（React + Tauri）
- `packages/data-import/`：CSV/Excel 解析、字段映射、预览等能力
- `packages/template-schema/`：模板结构定义、校验与迁移
- `tests/e2e/`：Playwright 端到端测试
- `scripts/`：工程脚本（如安装包构建、乱码检查）
- `docs/release-notes/`：版本发布说明
- `.githooks/`：本地 Git Hook（提交前检查）

### 6.2 关键文件

- `package.json`：根脚本入口与工作区级命令
- `pnpm-workspace.yaml`：pnpm 工作区声明（apps/packages/tests）
- `.gitignore`：构建产物、日志、数据库等忽略规则
- `apps/desktop/src-tauri/Cargo.toml`：Tauri/Rust 后端依赖与配置
- `apps/desktop/tauri.conf.json`：Tauri 应用配置
- `scripts/check-mojibake.mjs`：编码与乱码检查脚本
- `.githooks/pre-commit`：提交前自动执行乱码检查

## 7. 开发与提交流程建议

1. 首次克隆后执行：

```bash
pnpm install
pnpm hooks:enable
```

2. 开发完成后建议至少执行：

```bash
pnpm --filter @label/desktop lint
pnpm --filter @label/desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

3. 若涉及页面响应式或交互布局，再执行：

```bash
pnpm --filter @label/e2e test
```

## 8. 已知限制（v0.1.x）

- 当前打印后端仅支持 Windows 驱动链路。
- 暂未实现原生打印指令语言（如 ZPL/TSPL）。
- 暂不包含多用户/云端同步能力。

## 9. License

MIT
