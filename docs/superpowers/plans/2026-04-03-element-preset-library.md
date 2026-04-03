# Element Preset Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为标签编辑器增加“我的元素”能力，支持右键保存单元素/组合块、左侧复用、图片资源持久化、导入导出与系统预置。

**Architecture:** 在现有模板库架构上扩展元素预设库：前端新增预设 store + 面板 + 上下文菜单；Tauri 侧新增 SQLite 表、Repo、Command 与 IPC 封装。图片采用资产表去重存储，content_json 仅保留 `asset://` 引用。

**Tech Stack:** React 18 + Zustand + Vitest，Tauri 2 + Rust + rusqlite，SQLite migration，TypeScript。

---

## File Structure (Planned)

- Create: `apps/desktop/src-tauri/migrations/0003_add_element_presets.sql`
- Create: `apps/desktop/src-tauri/src/repo/element_preset_repo.rs`
- Modify: `apps/desktop/src-tauri/src/repo/mod.rs`
- Create: `apps/desktop/src-tauri/src/commands/element_preset_commands.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/db.rs`
- Create: `apps/desktop/src-tauri/tests/element_preset_repo_integration.rs`

- Create: `apps/desktop/src/services/ipc/element-preset.ts`
- Create: `apps/desktop/src/services/ipc/__tests__/element-preset.test.ts`
- Create: `apps/desktop/src/features/editor/element-preset.store.ts`
- Create: `apps/desktop/src/features/editor/ElementPresetPanel.tsx`
- Modify: `apps/desktop/src/features/editor/LeftPalette.tsx`
- Modify: `apps/desktop/src/features/editor/EditorPage.tsx`
- Modify: `apps/desktop/src/features/editor/CanvasStage.tsx`
- Modify: `apps/desktop/src/features/editor/editor.store.ts`
- Modify: `apps/desktop/src/styles/layout.css`
- Create: `apps/desktop/src/features/editor/__tests__/element-preset-panel.test.tsx`
- Modify: `apps/desktop/src/features/editor/__tests__/editor-page.test.tsx`

- Create: `docs/release-notes/element-preset-library.md`

### Task 1: Add SQLite schema for presets and assets

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0003_add_element_presets.sql`
- Modify: `apps/desktop/src-tauri/src/db.rs`
- Test: `apps/desktop/src-tauri/tests/element_preset_repo_integration.rs`

- [ ] **Step 1: Write failing migration integration test**

```rust
#[test]
fn migration_should_create_element_preset_tables() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    crate::db::run_migrations(&conn).unwrap();

    let has_presets: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='element_presets'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    assert_eq!(has_presets, 1);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @label-print/desktop test -- --runInBand`
Expected: FAIL with missing table assertions.

- [ ] **Step 3: Add migration SQL and wire it in `run_migrations`**

```rust
conn.execute_batch(include_str!("../migrations/0003_add_element_presets.sql"))?;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @label-print/desktop test -- --runInBand`
Expected: PASS for migration-related assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0003_add_element_presets.sql apps/desktop/src-tauri/src/db.rs apps/desktop/src-tauri/tests/element_preset_repo_integration.rs
git commit -m "feat: add sqlite schema for element presets"
```

### Task 2: Implement Rust repository for preset CRUD and asset dedup

**Files:**
- Create: `apps/desktop/src-tauri/src/repo/element_preset_repo.rs`
- Modify: `apps/desktop/src-tauri/src/repo/mod.rs`
- Test: `apps/desktop/src-tauri/tests/element_preset_repo_integration.rs`

- [ ] **Step 1: Write failing repository tests**

```rust
#[test]
fn save_should_deduplicate_same_image_asset() {
    // arrange two presets referencing same data URL
    // assert preset_assets row count remains 1
}

#[test]
fn list_should_return_presets_sorted_by_updated_time_desc() {
    // save A then B; assert B first
}
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `cargo test -p desktop element_preset_repo -- --nocapture`
Expected: FAIL due missing repo and methods.

- [ ] **Step 3: Implement minimal repo methods**

```rust
pub fn save_preset(&self, payload: SavePresetInput) -> Result<i64> { /* tx + upsert assets + refs */ }
pub fn list_presets(&self) -> Result<Vec<ElementPresetRecord>> { /* order by pinned/use_count/updated_at */ }
pub fn delete_preset(&self, id: i64) -> Result<()> { /* soft guard for system */ }
```

- [ ] **Step 4: Re-run tests**

Run: `cargo test -p desktop element_preset_repo -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/repo/element_preset_repo.rs apps/desktop/src-tauri/src/repo/mod.rs apps/desktop/src-tauri/tests/element_preset_repo_integration.rs
git commit -m "feat: add element preset repository with asset dedup"
```

### Task 3: Expose Tauri commands and register invoke handlers

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/element_preset_commands.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: `apps/desktop/src-tauri/tests/element_preset_repo_integration.rs`

- [ ] **Step 1: Add failing command-level test (or smoke invoke test)**

```rust
#[test]
fn command_list_should_return_saved_presets() {
    // setup state + save one preset + call list command
    // assert dto length == 1
}
```

- [ ] **Step 2: Run Rust tests to fail**

Run: `cargo test -p desktop command_list_should_return_saved_presets -- --nocapture`
Expected: FAIL due missing command.

- [ ] **Step 3: Implement commands and register handlers**

```rust
#[tauri::command]
pub fn save_element_preset(...)
#[tauri::command]
pub fn list_element_presets(...)
#[tauri::command]
pub fn update_element_preset_meta(...)
#[tauri::command]
pub fn delete_element_preset(...)
#[tauri::command]
pub fn touch_element_preset_usage(...)
```

- [ ] **Step 4: Run Rust test suite**

Run: `cargo test -p desktop -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/element_preset_commands.rs apps/desktop/src-tauri/src/commands/mod.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: expose element preset tauri commands"
```

### Task 4: Add frontend IPC client and fallback tests

**Files:**
- Create: `apps/desktop/src/services/ipc/element-preset.ts`
- Create: `apps/desktop/src/services/ipc/__tests__/element-preset.test.ts`

- [ ] **Step 1: Write failing IPC fallback tests**

```ts
it("save/list presets in localStorage fallback", async () => {
  const id = await saveElementPreset({ name: "营养块", ... });
  const rows = await listElementPresets();
  expect(rows[0]?.id).toBe(id);
});
```

- [ ] **Step 2: Run test to fail**

Run: `pnpm --filter @label-print/desktop test element-preset.test.ts --runInBand`
Expected: FAIL due missing module.

- [ ] **Step 3: Implement IPC client**

```ts
export async function saveElementPreset(payload: SaveElementPresetPayload): Promise<number> { ... }
export async function listElementPresets(): Promise<ElementPresetDto[]> { ... }
```

- [ ] **Step 4: Run tests to pass**

Run: `pnpm --filter @label-print/desktop test element-preset.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/services/ipc/element-preset.ts apps/desktop/src/services/ipc/__tests__/element-preset.test.ts
git commit -m "feat: add frontend ipc client for element presets"
```

### Task 5: Build preset store and insert/save core logic

**Files:**
- Create: `apps/desktop/src/features/editor/element-preset.store.ts`
- Modify: `apps/desktop/src/features/editor/editor.store.ts`
- Test: `apps/desktop/src/features/editor/core/__tests__/model.test.ts`

- [ ] **Step 1: Write failing store tests**

```ts
it("builds preset from selected elements and keeps bindings", () => {
  // arrange selected elements with column/expression bindings
  // act save payload builder
  // assert binding preserved
});
```

- [ ] **Step 2: Run targeted test to fail**

Run: `pnpm --filter @label-print/desktop test model.test.ts --runInBand`
Expected: FAIL for missing preset builder.

- [ ] **Step 3: Implement store actions**

```ts
saveSelectionAsPreset(name: string, description?: string): Promise<void>
insertPresetToCenter(presetId: number): void
insertPresetAtPoint(presetId: number, point: { xMm: number; yMm: number }): void
```

- [ ] **Step 4: Run store/model tests**

Run: `pnpm --filter @label-print/desktop test --runInBand`
Expected: PASS for store-related tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/editor/element-preset.store.ts apps/desktop/src/features/editor/editor.store.ts
git commit -m "feat: add editor preset store and insertion logic"
```

### Task 6: Add UI panel and right-click save interaction

**Files:**
- Create: `apps/desktop/src/features/editor/ElementPresetPanel.tsx`
- Modify: `apps/desktop/src/features/editor/LeftPalette.tsx`
- Modify: `apps/desktop/src/features/editor/EditorPage.tsx`
- Modify: `apps/desktop/src/features/editor/CanvasStage.tsx`
- Modify: `apps/desktop/src/styles/layout.css`
- Test: `apps/desktop/src/features/editor/__tests__/element-preset-panel.test.tsx`

- [ ] **Step 1: Write failing UI tests**

```tsx
it("shows save preset action on canvas context menu", async () => {
  // right click selected element
  // expect menu item "保存为我的元素"
});

it("click preset inserts elements", async () => {
  // render panel + mock preset list + click item
  // assert element count grows
});
```

- [ ] **Step 2: Run tests and confirm fail**

Run: `pnpm --filter @label-print/desktop test element-preset-panel.test.tsx --runInBand`
Expected: FAIL due missing panel/menu.

- [ ] **Step 3: Implement UI and interactions**

```tsx
<ElementPresetPanel onInsert={...} onSaveSelection={...} />
```

- [ ] **Step 4: Run UI/editor tests**

Run: `pnpm --filter @label-print/desktop test editor-page.test.tsx element-preset-panel.test.tsx --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/editor/ElementPresetPanel.tsx apps/desktop/src/features/editor/LeftPalette.tsx apps/desktop/src/features/editor/EditorPage.tsx apps/desktop/src/features/editor/CanvasStage.tsx apps/desktop/src/styles/layout.css apps/desktop/src/features/editor/__tests__/element-preset-panel.test.tsx
git commit -m "feat: add preset panel and canvas right-click save"
```

### Task 7: Implement import/export bundle for presets with assets

**Files:**
- Modify: `apps/desktop/src/services/ipc/element-preset.ts`
- Modify: `apps/desktop/src/features/editor/ElementPresetPanel.tsx`
- Test: `apps/desktop/src/services/ipc/__tests__/element-preset.test.ts`

- [ ] **Step 1: Add failing import/export tests**

```ts
it("exports and imports bundle with image assets", async () => {
  // save preset containing data:image/png
  // export bundle then import into empty storage
  // assert image binding restored
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @label-print/desktop test element-preset.test.ts --runInBand`
Expected: FAIL due missing bundle APIs.

- [ ] **Step 3: Implement bundle APIs and UI hooks**

```ts
exportElementPresetBundle(ids?: number[]): Promise<Uint8Array>
importElementPresetBundle(bundle: Uint8Array): Promise<ImportStats>
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @label-print/desktop test element-preset.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/services/ipc/element-preset.ts apps/desktop/src/features/editor/ElementPresetPanel.tsx apps/desktop/src/services/ipc/__tests__/element-preset.test.ts
git commit -m "feat: add preset import export bundle with assets"
```

### Task 8: Seed system presets and add recommendation ranking

**Files:**
- Modify: `apps/desktop/src-tauri/src/repo/element_preset_repo.rs`
- Modify: `apps/desktop/src/features/editor/element-preset.store.ts`
- Test: `apps/desktop/src-tauri/tests/element_preset_repo_integration.rs`
- Test: `apps/desktop/src/features/editor/__tests__/element-preset-panel.test.tsx`

- [ ] **Step 1: Write failing tests for seed and ranking**

```rust
#[test]
fn should_seed_system_presets_only_once() {
  // call seed twice; assert no duplicate names
}
```

```ts
it("ranks pinned and recent presets first", () => {
  // mocked rows with pinned/use_count/last_used_at
  // expect sorted order
});
```

- [ ] **Step 2: Run tests to fail**

Run: `cargo test -p desktop should_seed_system_presets_only_once -- --nocapture`
Run: `pnpm --filter @label-print/desktop test element-preset-panel.test.tsx --runInBand`
Expected: FAIL.

- [ ] **Step 3: Implement seed and ranking**

```rust
pub fn seed_system_presets_if_empty(&self) -> Result<()> { ... }
```

```ts
function scorePreset(row: ElementPresetDto): number { ... }
```

- [ ] **Step 4: Run full verification**

Run: `cargo test -p desktop -- --nocapture`
Run: `pnpm --filter @label-print/desktop test --runInBand`
Run: `pnpm --filter @label-print/desktop lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/repo/element_preset_repo.rs apps/desktop/src/features/editor/element-preset.store.ts apps/desktop/src-tauri/tests/element_preset_repo_integration.rs apps/desktop/src/features/editor/__tests__/element-preset-panel.test.tsx
git commit -m "feat: add system preset seed and recommendation ranking"
```

### Task 9: Update release notes and run final smoke checks

**Files:**
- Create: `docs/release-notes/element-preset-library.md`
- Modify: `apps/desktop/src/features/editor/__tests__/editor-page.test.tsx`

- [ ] **Step 1: Write failing smoke assertion**

```tsx
it("renders 我的元素 panel entry", () => {
  render(<App />);
  expect(screen.getByText("我的元素")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to fail then fix**

Run: `pnpm --filter @label-print/desktop test editor-page.test.tsx --runInBand`
Expected: FAIL before UI wiring, PASS after wiring.

- [ ] **Step 3: Add release notes**

```md
- 新增画布右键保存为我的元素
- 新增食品/服装/仓储系统预置
- 新增预设导入导出（含图片）
```

- [ ] **Step 4: Final verification**

Run: `pnpm --filter @label-print/desktop test --runInBand`
Run: `cargo test -p desktop -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/release-notes/element-preset-library.md apps/desktop/src/features/editor/__tests__/editor-page.test.tsx
git commit -m "docs: add release notes for element preset library"
```

## Manual QA Checklist

- [ ] 右键保存单元素可成功，列表实时可见。
- [ ] 右键保存多选组合可成功，插入时相对布局正确。
- [ ] 包含图片的食品标签块导出后导入，图片完整还原。
- [ ] 系统预置可插入、可复制、不可直接删除。
- [ ] 推荐区能随使用次数与最近使用时间更新。
- [ ] 拖拽插入落点准确，越界自动修正。

## Risks & Mitigations

- 图片体积大导致性能抖动：限制单图大小并提供压缩提示。
- 组合插入边界处理复杂：统一使用“先定位后裁剪”流程并覆盖测试。
- 旧数据库迁移失败：迁移前加存在性检查与幂等执行。

## Rollback Plan

- 前端：移除“我的元素”入口，不影响旧模板流程。
- 后端：保留新增表但可停止调用相关命令，功能软下线。

