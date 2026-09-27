import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test('shows an empty library and the memo column', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('memo-pane')).toBeVisible();
});

test('switches the interface language and remembers it', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await page.getByTestId('language').selectOption('zh-CN');
  await expect(page.getByRole('heading', { name: '文库' })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: '文库' })).toBeVisible();
});

test('collapses and restores the library sidebar', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('sidebar-toggle').click();
  await expect(page.getByTestId('library-list')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('library-list')).toHaveCount(0);
  await page.getByTestId('sidebar-toggle').click();
  await expect(page.getByTestId('library-empty')).toBeVisible();
});

test('resizes the memo column by dragging the splitter', async ({ page }) => {
  await openApp(page);
  const memo = page.getByTestId('memo-pane');
  const before = (await memo.boundingBox())?.width ?? 0;
  const handle = await page.getByTestId('memo-splitter').boundingBox();
  if (!handle) throw new Error('splitter not rendered');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x - 120, handle.y + 100, { steps: 5 });
  await page.mouse.up();
  expect((await memo.boundingBox())?.width ?? 0).toBeGreaterThan(before + 100);
});
