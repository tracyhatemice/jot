import { expect, test } from '@playwright/test';
import { importText, openApp } from './helpers';

test('shows an empty library and the memo column', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('memo-pane')).toBeHidden();
  await importText(page, '春', '春风又绿江南岸。');
  await expect(page.getByTestId('memo-pane')).toBeVisible();
});

test('switches the interface language and remembers it', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await page.getByTestId('settings-open').click();
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
  await importText(page, '春', '春风又绿江南岸。');
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

test('the settings menu holds the language switch and the library file actions, and closes on Escape or a click elsewhere', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('settings-menu')).toHaveCount(0);
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('settings-menu')).toBeVisible();
  await expect(page.getByTestId('language')).toBeVisible();
  await expect(page.getByTestId('library-export')).toBeVisible();
  await expect(page.getByTestId('library-import')).toBeVisible();
  // Playwright's WebKit can drop a key press under load (plan 4): press again until it lands.
  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-menu')).toHaveCount(0, { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('settings-menu')).toBeVisible();
  await page.getByTestId('shell').click({ position: { x: 700, y: 300 } });
  await expect(page.getByTestId('settings-menu')).toHaveCount(0);
});
