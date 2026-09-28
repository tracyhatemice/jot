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

test('scroll bars are drawn over the edge of their area and show while the pointer is over it (spec §6.11, user review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', Array.from({ length: 80 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n'));
  const reader = page.locator('main.reader');
  const thumb = page.getByTestId('reader-thumb');
  await page.locator('nav.sidebar').hover();
  await expect(thumb).toBeHidden();
  await reader.hover();
  await expect(thumb).toBeVisible();
  const rb = await reader.boundingBox();
  const tb = await thumb.boundingBox();
  expect((tb?.x ?? 0) + (tb?.width ?? 0)).toBeLessThanOrEqual((rb?.x ?? 0) + (rb?.width ?? 0) + 0.5);
  expect(tb?.x ?? 0).toBeGreaterThan((rb?.x ?? 0) + (rb?.width ?? 0) - 12);
  expect(tb?.height ?? 0).toBeLessThan(rb?.height ?? 0);
});

test('no area keeps room beside its content for a scroll bar of the system’s (user review)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'reads the computed scrollbar-width; test browsers hide system scroll bars anyway');
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  for (const area of ['nav.sidebar', 'main.reader', 'aside.memo', '[data-testid="memo-tabs"]']) {
    expect(await page.locator(area).evaluate((el) => getComputedStyle(el).scrollbarWidth), area).toBe('none');
  }
});

test('scroll bars also show while an area scrolls, e.g. from the keyboard (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', Array.from({ length: 80 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n'));
  const reader = page.locator('main.reader');
  const thumb = page.getByTestId('reader-thumb');
  await page.locator('nav.sidebar').hover();
  await reader.evaluate((el) => el.scrollBy(0, 400));
  await expect(thumb).toBeVisible();
  await expect(thumb).toBeHidden({ timeout: 3_000 });
});

test('a scroll bar’s thumb can be dragged (user review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', Array.from({ length: 80 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n'));
  const reader = page.locator('main.reader');
  const thumb = page.getByTestId('reader-thumb');
  await reader.hover();
  const tb = await thumb.boundingBox();
  const x = (tb?.x ?? 0) + (tb?.width ?? 0) / 2;
  const y = (tb?.y ?? 0) + (tb?.height ?? 0) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 100, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  expect((await thumb.boundingBox())?.y ?? 0).toBeGreaterThan(tb?.y ?? 0);
});
