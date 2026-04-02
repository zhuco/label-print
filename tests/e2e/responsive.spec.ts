import { expect, test } from '@playwright/test';

test('collapses side panels on small viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '展开元素面板' })).toBeVisible();
});

test('shows full side panels on large viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '展开元素面板' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '元素' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '属性' })).toBeVisible();
});
