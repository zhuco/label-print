import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '新建标签', exact: true }).click();
  await page.getByRole('button', { name: '确认创建' }).click();
}

test('keeps both side panels visible at 1366x768 until the user hides one', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openEditor(page);
  await expect(page.getByRole('heading', { name: '元素' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '属性' })).toBeVisible();

  await page.getByRole('button', { name: '隐藏元素面板' }).click();
  await expect(page.getByRole('heading', { name: '元素' })).toBeHidden();
  await expect(page.getByRole('button', { name: '显示元素面板' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('label-print.editor.left-panel-visible'))).toBe('false');
});

test('uses overlay panel controls only on narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 768 });
  await openEditor(page);
  await expect(page.getByRole('button', { name: '显示元素面板' })).toBeVisible();
});

test('shows full side panels on large viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page);
  await expect(page.getByRole('button', { name: '显示元素面板' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '元素' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '属性' })).toBeVisible();
});
