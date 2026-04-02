# Label Print Desktop MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an open-source Windows x64 desktop label editor and batch printing app with stable driver-based thermal printing, responsive UI, and recoverable print workflows.

**Architecture:** Use a Tauri desktop shell with a React/TypeScript front-end and Rust domain core. Keep template parsing, queue state machine, and print orchestration in Rust, while UI workflows (editor, mapping, calibration, logs) live in React. Persist templates, settings, and job logs in SQLite.

**Tech Stack:** Tauri 2, React 18, TypeScript 5, Vite, Zustand, Ant Design 5, Konva, Rust stable, rusqlite + serde, Vitest + RTL, Playwright, pnpm, GitHub Actions.

---

## Implementation Rules

- Follow `@superpowers:test-driven-development` for every code task.
- Run `@superpowers:verification-before-completion` before claiming any task complete.
- Keep commits scoped to one task with a single intent.
- Do not build cloud or web-user features in this MVP.

### Task 1: Workspace Bootstrap and Test Harness

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/app/__tests__/app-shell.test.tsx`
- Create: `apps/desktop/src/test/setup.ts`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Test: `apps/desktop/src/app/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../App';

describe('App shell', () => {
  it('renders product title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '标签编辑打印' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @label/desktop test app-shell --runInBand`
Expected: FAIL with missing package/workspace config.

- [ ] **Step 3: Add minimal workspace and desktop app scaffold**

```tsx
export default function App() {
  return <h1>标签编辑打印</h1>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm install && pnpm --filter @label/desktop test app-shell --runInBand`
Expected: PASS with 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore apps/desktop
git commit -m "chore: bootstrap tauri-react workspace with test harness"
```

### Task 2: Template Schema and Version Migration Package

**Files:**
- Create: `packages/template-schema/package.json`
- Create: `packages/template-schema/src/index.ts`
- Create: `packages/template-schema/src/schema.ts`
- Create: `packages/template-schema/src/migrate.ts`
- Create: `packages/template-schema/src/__tests__/schema.test.ts`
- Create: `packages/template-schema/src/__tests__/migrate.test.ts`
- Test: `packages/template-schema/src/__tests__/schema.test.ts`
- Test: `packages/template-schema/src/__tests__/migrate.test.ts`

- [ ] **Step 1: Write failing schema validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { validateTemplate } from '../schema';

describe('validateTemplate', () => {
  it('rejects template with non-positive width', () => {
    const result = validateTemplate({ widthMm: 0, heightMm: 30, elements: [] });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @label/template-schema test schema --runInBand`
Expected: FAIL with `Cannot find module '../schema'`.

- [ ] **Step 3: Implement schema and migration**

```ts
export function validateTemplate(input: unknown) {
  const parsed = templateSchema.safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: parsed.error.issues };
}
```

- [ ] **Step 4: Add migration test and implementation for `v1 -> v2`**

```ts
expect(migrateTemplate({ version: 1, unit: 'px' }).version).toBe(2);
```

- [ ] **Step 5: Run package tests**

Run: `pnpm --filter @label/template-schema test --runInBand`
Expected: PASS with schema and migration tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/template-schema
git commit -m "feat: add template schema validation and migration package"
```

### Task 3: Data Import Package (CSV/Excel Preview)

**Files:**
- Create: `packages/data-import/package.json`
- Create: `packages/data-import/src/index.ts`
- Create: `packages/data-import/src/csv.ts`
- Create: `packages/data-import/src/excel.ts`
- Create: `packages/data-import/src/preview.ts`
- Create: `packages/data-import/src/__tests__/csv.test.ts`
- Create: `packages/data-import/src/__tests__/excel.test.ts`
- Create: `packages/data-import/src/__tests__/preview.test.ts`
- Test: `packages/data-import/src/__tests__/preview.test.ts`

- [ ] **Step 1: Write failing preview and missing-field tests**

```ts
expect(buildPreview([{ sku: 'A1' }], ['sku', 'price']).missingColumns).toEqual(['price']);
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @label/data-import test preview --runInBand`
Expected: FAIL with unresolved import for `buildPreview`.

- [ ] **Step 3: Implement CSV/Excel parser and preview builder**

```ts
export function buildPreview(rows: Record<string, string>[], required: string[]) {
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const missingColumns = required.filter((key) => !columns.includes(key));
  return { columns, rows: rows.slice(0, 50), missingColumns };
}
```

- [ ] **Step 4: Run package tests**

Run: `pnpm --filter @label/data-import test --runInBand`
Expected: PASS with CSV/Excel/preview cases.

- [ ] **Step 5: Commit**

```bash
git add packages/data-import
git commit -m "feat: add csv excel import and preview validation"
```

### Task 4: Rust Label Core - Variable Expansion and Layout Bounds

**Files:**
- Create: `apps/desktop/src-tauri/crates/label-core/Cargo.toml`
- Create: `apps/desktop/src-tauri/crates/label-core/src/lib.rs`
- Create: `apps/desktop/src-tauri/crates/label-core/src/template.rs`
- Create: `apps/desktop/src-tauri/crates/label-core/src/expand.rs`
- Create: `apps/desktop/src-tauri/crates/label-core/src/layout.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Test: `apps/desktop/src-tauri/crates/label-core/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for variable expansion and bounds check**

```rust
#[test]
fn expands_template_variables() {
    let text = expand_text("SKU:${sku}", &hashmap!{"sku".into() => "A001".into()});
    assert_eq!(text, "SKU:A001");
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -p label-core`
Expected: FAIL with missing `expand_text` implementation.

- [ ] **Step 3: Implement expansion and bounds helpers**

```rust
pub fn expand_text(input: &str, vars: &HashMap<String, String>) -> String {
    vars.iter().fold(input.to_string(), |acc, (k, v)| acc.replace(&format!("${{{}}}", k), v))
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -p label-core`
Expected: PASS for expansion and bounds tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/crates/label-core
git commit -m "feat: add rust label core for variable expansion and layout checks"
```

### Task 5: Rust Print Queue State Machine

**Files:**
- Create: `apps/desktop/src-tauri/crates/label-core/src/queue.rs`
- Modify: `apps/desktop/src-tauri/crates/label-core/src/lib.rs`
- Test: `apps/desktop/src-tauri/crates/label-core/src/queue.rs`

- [ ] **Step 1: Write failing tests for legal and illegal state transitions**

```rust
#[test]
fn pause_only_allowed_from_running() {
    let mut q = PrintQueue::new();
    assert!(q.pause().is_err());
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -p label-core queue`
Expected: FAIL with `PrintQueue` not found.

- [ ] **Step 3: Implement queue state machine**

```rust
pub enum QueueState { Idle, Running, Paused, Completed, Failed }
```

- [ ] **Step 4: Run queue tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -p label-core queue -- --nocapture`
Expected: PASS with transition tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/crates/label-core/src/queue.rs apps/desktop/src-tauri/crates/label-core/src/lib.rs
git commit -m "feat: add print queue state machine and transition guards"
```

### Task 6: Tauri Commands + SQLite Repositories

**Files:**
- Create: `apps/desktop/src-tauri/src/db.rs`
- Create: `apps/desktop/src-tauri/src/repo/template_repo.rs`
- Create: `apps/desktop/src-tauri/src/repo/job_repo.rs`
- Create: `apps/desktop/src-tauri/src/commands/template_commands.rs`
- Create: `apps/desktop/src-tauri/src/commands/print_commands.rs`
- Create: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/migrations/0001_init.sql`
- Create: `apps/desktop/src-tauri/tests/repo_integration.rs`
- Test: `apps/desktop/src-tauri/tests/repo_integration.rs`

- [ ] **Step 1: Write failing integration test for saving template and enqueuing jobs**

```rust
#[test]
fn saves_template_and_job_records() {
    let db = open_test_db();
    let tpl_id = save_template(&db, "demo", "{}").unwrap();
    let job_id = create_job(&db, tpl_id, 10).unwrap();
    assert!(job_id > 0);
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test repo_integration`
Expected: FAIL with missing DB/repo symbols.

- [ ] **Step 3: Implement repositories, migration, and tauri command layer**

```rust
#[tauri::command]
pub fn enqueue_print_job(payload: EnqueuePayload, state: tauri::State<AppState>) -> Result<i64, String> {
    state.job_repo.create(payload).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: Run Rust tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS for core + repo integration tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src apps/desktop/src-tauri/migrations apps/desktop/src-tauri/tests
git commit -m "feat: add tauri commands and sqlite repositories"
```

### Task 7: Editor Canvas MVP (Desktop UI)

**Files:**
- Create: `apps/desktop/src/features/editor/EditorPage.tsx`
- Create: `apps/desktop/src/features/editor/CanvasStage.tsx`
- Create: `apps/desktop/src/features/editor/LeftPalette.tsx`
- Create: `apps/desktop/src/features/editor/RightInspector.tsx`
- Create: `apps/desktop/src/features/editor/editor.store.ts`
- Create: `apps/desktop/src/features/editor/__tests__/editor-page.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Test: `apps/desktop/src/features/editor/__tests__/editor-page.test.tsx`

- [ ] **Step 1: Write failing UI test for three-pane layout and heading**

```tsx
expect(screen.getByText('元素')).toBeInTheDocument();
expect(screen.getByText('属性')).toBeInTheDocument();
expect(screen.getByRole('heading', { name: '标签编辑打印' })).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @label/desktop test editor-page --runInBand`
Expected: FAIL because editor components are missing.

- [ ] **Step 3: Implement editor page with Konva stage and panel shell**

```tsx
<Layout>
  <Sider width={240}><LeftPalette /></Sider>
  <Content><CanvasStage /></Content>
  <Sider width={320}><RightInspector /></Sider>
</Layout>
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm --filter @label/desktop test editor-page --runInBand`
Expected: PASS with layout assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/editor apps/desktop/src/App.tsx
git commit -m "feat: add editor canvas mvp layout and state store"
```

### Task 8: Data Import and Field Mapping UI Flow

**Files:**
- Create: `apps/desktop/src/features/data-import/DataImportDrawer.tsx`
- Create: `apps/desktop/src/features/data-import/FieldMappingTable.tsx`
- Create: `apps/desktop/src/features/data-import/data-import.store.ts`
- Create: `apps/desktop/src/features/data-import/__tests__/mapping-flow.test.tsx`
- Modify: `apps/desktop/src/features/editor/EditorPage.tsx`
- Test: `apps/desktop/src/features/data-import/__tests__/mapping-flow.test.tsx`

- [ ] **Step 1: Write failing test for missing-column warning**

```tsx
expect(screen.getByText('缺失字段: price')).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @label/desktop test mapping-flow --runInBand`
Expected: FAIL with missing mapping UI.

- [ ] **Step 3: Implement import drawer and mapping table using `@label/data-import`**

```tsx
const preview = buildPreview(rows, requiredFields);
setMissing(preview.missingColumns);
```

- [ ] **Step 4: Run UI tests**

Run: `pnpm --filter @label/desktop test mapping-flow --runInBand`
Expected: PASS for mapping warnings and field binding actions.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/data-import apps/desktop/src/features/editor/EditorPage.tsx
git commit -m "feat: add csv excel import and field mapping ui flow"
```

### Task 9: Print Queue Console and Execution Controls

**Files:**
- Create: `apps/desktop/src/features/print/PrintPanel.tsx`
- Create: `apps/desktop/src/features/print/QueueTable.tsx`
- Create: `apps/desktop/src/features/print/print.store.ts`
- Create: `apps/desktop/src/services/ipc/print.ts`
- Create: `apps/desktop/src/features/print/__tests__/queue-controls.test.tsx`
- Modify: `apps/desktop/src/features/editor/EditorPage.tsx`
- Test: `apps/desktop/src/features/print/__tests__/queue-controls.test.tsx`

- [ ] **Step 1: Write failing test for pause/resume/cancel controls**

```tsx
fireEvent.click(screen.getByRole('button', { name: '暂停' }));
expect(mockPause).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @label/desktop test queue-controls --runInBand`
Expected: FAIL with missing panel and ipc service.

- [ ] **Step 3: Implement print panel and tauri ipc bindings**

```ts
export const pauseJob = (id: number) => invoke('pause_print_job', { id });
```

- [ ] **Step 4: Run UI tests**

Run: `pnpm --filter @label/desktop test queue-controls --runInBand`
Expected: PASS for queue action wiring.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/print apps/desktop/src/services/ipc/print.ts apps/desktop/src/features/editor/EditorPage.tsx
git commit -m "feat: add print queue console with execution controls"
```

### Task 10: Calibration and Job Log Pages

**Files:**
- Create: `apps/desktop/src/features/calibration/CalibrationPage.tsx`
- Create: `apps/desktop/src/features/logs/JobLogsPage.tsx`
- Create: `apps/desktop/src/services/ipc/logs.ts`
- Create: `apps/desktop/src/features/calibration/__tests__/calibration-form.test.tsx`
- Create: `apps/desktop/src/features/logs/__tests__/job-logs.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Test: `apps/desktop/src/features/calibration/__tests__/calibration-form.test.tsx`
- Test: `apps/desktop/src/features/logs/__tests__/job-logs.test.tsx`

- [ ] **Step 1: Write failing tests for offset validation and log filtering**

```tsx
expect(screen.getByText('X 偏移必须在 -10 到 10 毫米之间')).toBeInTheDocument();
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @label/desktop test calibration-form job-logs --runInBand`
Expected: FAIL with missing pages/components.

- [ ] **Step 3: Implement calibration + logs pages with ipc integration**

```tsx
<Form.Item name="offsetX" rules={[{ type: 'number', min: -10, max: 10 }]} />
```

- [ ] **Step 4: Run page tests**

Run: `pnpm --filter @label/desktop test calibration-form job-logs --runInBand`
Expected: PASS with form validation and filtering cases.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/calibration apps/desktop/src/features/logs apps/desktop/src/services/ipc/logs.ts apps/desktop/src/App.tsx
git commit -m "feat: add calibration and job logs pages"
```

### Task 11: Responsive and High-DPI Adaptation

**Files:**
- Create: `apps/desktop/src/styles/tokens.css`
- Create: `apps/desktop/src/styles/layout.css`
- Modify: `apps/desktop/src/features/editor/EditorPage.tsx`
- Create: `tests/e2e/responsive.spec.ts`
- Create: `tests/e2e/playwright.config.ts`
- Test: `tests/e2e/responsive.spec.ts`

- [ ] **Step 1: Write failing E2E test for 1366x768 panel collapse behavior**

```ts
test('collapses side panels on small viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '展开元素面板' })).toBeVisible();
});
```

- [ ] **Step 2: Run E2E test to verify failure**

Run: `pnpm exec playwright test tests/e2e/responsive.spec.ts --project=chromium`
Expected: FAIL because responsive controls are not implemented.

- [ ] **Step 3: Implement responsive breakpoints and scalable tokens**

```css
:root { --left-panel-width: 240px; --right-panel-width: 320px; }
@media (max-width: 1440px) { :root { --left-panel-width: 0px; --right-panel-width: 0px; } }
```

- [ ] **Step 4: Run E2E test matrix**

Run: `pnpm exec playwright test tests/e2e/responsive.spec.ts --project=chromium`
Expected: PASS for 1366x768 and 1920x1080 scenarios.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles apps/desktop/src/features/editor/EditorPage.tsx tests/e2e
git commit -m "feat: implement responsive layout and high-dpi adaptation baseline"
```

### Task 12: Packaging, CI, and Open-Source Readiness

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `LICENSE`
- Create: `docs/release-notes/v0.1.0.md`
- Test: `.github/workflows/ci.yml`

- [ ] **Step 1: Write failing CI smoke script expectation in local check script**

```bash
pnpm -r lint
pnpm -r test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: FAIL until all scripts are wired in each package.

- [ ] **Step 2: Implement scripts and CI workflow**

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm -r test
- run: cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

- [ ] **Step 3: Add open-source docs and MIT license**

```md
## Supported Scope (v0.1.0)
- Windows x64
- Driver-based thermal printing
- CSV/Excel batch print
```

- [ ] **Step 4: Run full verification**

Run: `pnpm -r test; pnpm -r lint; cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS and CI-equivalent local verification completed.

- [ ] **Step 5: Commit**

```bash
git add .github README.md CONTRIBUTING.md CODE_OF_CONDUCT.md LICENSE docs/release-notes
git commit -m "chore: add ci pipeline and open source governance docs"
```

## Final Verification Checklist

- [ ] Unit tests green for TypeScript packages and desktop UI.
- [ ] Rust tests green for label core and repositories.
- [ ] E2E responsive tests pass at required resolutions.
- [ ] Manual smoke test passes: create template -> import CSV -> print queue run -> retry failed item.
- [ ] Release draft `v0.1.0` includes known limitations and supported printers.

## Suggested Commit Order

1. `chore: bootstrap tauri-react workspace with test harness`
2. `feat: add template schema validation and migration package`
3. `feat: add csv excel import and preview validation`
4. `feat: add rust label core for variable expansion and layout checks`
5. `feat: add print queue state machine and transition guards`
6. `feat: add tauri commands and sqlite repositories`
7. `feat: add editor canvas mvp layout and state store`
8. `feat: add csv excel import and field mapping ui flow`
9. `feat: add print queue console with execution controls`
10. `feat: add calibration and job logs pages`
11. `feat: implement responsive layout and high-dpi adaptation baseline`
12. `chore: add ci pipeline and open source governance docs`
