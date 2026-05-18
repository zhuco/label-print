# Titlebar Tab Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make desktop title tabs use all available width before the window controls, instead of reserving an oversized blank spacer that forces early overflow.

**Architecture:** Keep the existing custom titlebar and drag behavior, but move the tab strip and the blank drag hotspot into one shared flexible region. Constrain tab chips so long titles do not monopolize the titlebar, and preserve horizontal scrolling as the overflow strategy.

**Tech Stack:** React 18, Vitest, global CSS layout in `apps/desktop/src/styles/layout.css`

---

### Task 1: Lock the layout contract with a regression test

**Files:**
- Modify: `apps/desktop/src/app/__tests__/app-shell.test.tsx`
- Test: `apps/desktop/src/app/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a shell test that expects a shared `.titlebar-main` container to own both `.title-tabs` and `.titlebar-spacer`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/desktop test -- -t "lets the tab strip own the only flexible titlebar column"`
Expected: FAIL because `.titlebar-main` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Wrap the tab strip and spacer in a shared titlebar container in `apps/desktop/src/App.tsx`, and update `apps/desktop/src/styles/layout.css` so the titlebar uses a single flexible middle column.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir apps/desktop test -- -t "lets the tab strip own the only flexible titlebar column"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/styles/layout.css apps/desktop/src/app/__tests__/app-shell.test.tsx docs/superpowers/plans/2026-04-11-titlebar-tab-layout.md
git commit -m "fix: let title tabs fill the desktop titlebar"
```

### Task 2: Verify related titlebar interactions still work

**Files:**
- Modify: `apps/desktop/src/styles/layout.css`
- Test: `apps/desktop/src/app/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Run focused app shell tests**

Run: `pnpm --dir apps/desktop test -- src/app/__tests__/app-shell.test.tsx`
Expected: PASS with drag, maximize, tab switching, and close behavior intact.

- [ ] **Step 2: Run type-level verification**

Run: `pnpm --dir apps/desktop lint`
Expected: PASS with no TypeScript errors introduced by the titlebar change.

- [ ] **Step 3: Start the desktop UI for manual verification**

Run: `pnpm --dir apps/desktop tauri:dev`
Expected: Desktop window opens so the user can manually verify multi-tab overflow behavior.
