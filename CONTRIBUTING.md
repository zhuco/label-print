# Contributing

感谢贡献。请遵循以下约定：

1. 基于特性分支开发，不要直接向主分支提交。
2. 每次提交保持单一意图，并补充对应测试。
3. 提交前本地至少通过：
   - `pnpm -r --filter '!@label/e2e' lint`
   - `pnpm -r --filter '!@label/e2e' test`
   - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
4. 涉及 UI 变更请附截图；涉及打印问题请附日志。

## Commit Convention

- `feat:` 新功能
- `fix:` 缺陷修复
- `docs:` 文档更新
- `chore:` 工程与依赖维护