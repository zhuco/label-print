# Label Print Desktop

开源单机标签编辑与打印软件（Windows x64），面向通用可配置场景，支持热敏打印机与批量可变数据打印。

## Supported Scope (v0.1.0)

- Windows x64
- Driver-based thermal printing
- CSV/Excel batch print
- Template editing (elements, canvas, inspector)
- Print queue actions and calibration baseline
- Responsive UI from 1366x768 to 4K

## Tech Stack

- Tauri 2 + Rust
- React 18 + TypeScript + Vite
- SQLite (rusqlite)
- Vitest + Playwright

## Quick Start

```bash
pnpm install
pnpm --filter @label/desktop dev
```

Run unit tests:

```bash
pnpm -r --filter '!@label/e2e' test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Run responsive E2E:

```bash
pnpm --filter @label/e2e exec playwright install chromium
pnpm --filter @label/e2e test responsive.spec.ts --project=chromium
```

## Repository Layout

- `apps/desktop`: Desktop UI + Tauri app shell
- `packages/template-schema`: Template validation/migration
- `packages/data-import`: CSV/Excel parsing and preview
- `tests/e2e`: Playwright E2E tests
- `docs/release-notes`: Release notes

## Known Limitations (v0.1.0)

- Printing backend is currently Windows driver based only.
- Native printer command languages (ZPL/TSPL) are not yet implemented.
- Multi-user/cloud sync is not included.

## License

MIT