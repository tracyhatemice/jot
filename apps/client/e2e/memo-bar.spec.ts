import { expect, test } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

test('a memo whose article is deleted moves to another article (spec §10 step 8, Review Focus 2)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.insertText('写景起笔');
  await page.waitForTimeout(1_000);
  await importText(page, '秋', '秋水共长天一色。');
  await page.getByTestId('library-list').getByRole('link', { name: '春' }).click();
  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-delete').click();

  await page.getByTestId('memo-list-item').click();
  await page.getByTestId('memo-menu').click();
  await page.getByTestId('memo-move').click();
  await page.getByTestId('picker-search').fill('秋');
  await expect(page.getByTestId('picker-item')).toHaveCount(1);
  await page.getByTestId('picker-item').click();
  await expect(page.getByTestId('article-title')).toHaveText('秋');
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
  await expect(page.locator('.memo-tab.active').getByRole('button', { name: 'Close memo' })).toHaveCount(0);
  await expect(page.getByTestId('memo-editor')).toContainText('写景起笔');
  await expect(page.getByTestId('memo-list-item')).toContainText('秋');
});

test('the memo has its own Aa settings, and no heading', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-pane').getByRole('heading', { name: 'Memo' })).toHaveCount(0);
  const bar = page.getByTestId('memo-bar');
  await bar.getByTestId('reading-open').click();
  await bar.getByTestId('reading-size-down').click();
  await expect(page.getByTestId('memo-editor')).toHaveCSS('font-size', '15px');
  await expect(page.getByTestId('article-view')).toHaveCSS('font-size', '18px');
});

test('many memo tabs stay on one row that scrolls sideways, each as tall as the strip (Review Focus 4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  for (let i = 0; i < 8; i++) await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(8);
  const strip = page.getByTestId('memo-tabs');
  const tops = await page.getByTestId('memo-tab').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const stripBox = await strip.boundingBox();
  const tabBox = await page.getByTestId('memo-tab').first().boundingBox();
  expect(Math.abs((stripBox?.height ?? 0) - (tabBox?.height ?? 0))).toBeLessThan(2);
});

test('with many tabs, + stays in reach, the new tab scrolls into view, and the mouse wheel scrolls the strip (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  for (let i = 0; i < 8; i++) await page.getByTestId('memo-new').click();
  const strip = page.getByTestId('memo-tabs');
  const sb = await strip.boundingBox();
  const plus = await page.getByTestId('memo-new').boundingBox();
  const active = await page.locator('.memo-tab.active').boundingBox();
  const right = (sb?.x ?? 0) + (sb?.width ?? 0);
  expect((plus?.x ?? 9999) + (plus?.width ?? 0)).toBeLessThanOrEqual(right + 1);
  expect(active?.x ?? -1).toBeGreaterThanOrEqual((sb?.x ?? 0) - 1);
  expect((active?.x ?? 9999) + (active?.width ?? 0)).toBeLessThanOrEqual((plus?.x ?? 0) + 1);
  await strip.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.mouse.move((sb?.x ?? 0) + (sb?.width ?? 0) / 2, (sb?.y ?? 0) + (sb?.height ?? 0) / 2);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

test('selecting memo text shows a formatting menu; a link chip does not (spec §6.11, Review Focus 4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('论比喻的写法');
  await page.keyboard.press('Shift+Home');
  const bubble = page.getByTestId('memo-bubble');
  await expect(bubble).toBeVisible();
  await bubble.getByTestId('fmt-bold').click();
  await expect(page.getByTestId('memo-editor').locator('strong')).toHaveText('论比喻的写法');
  await expect(bubble.getByTestId('fmt-bold')).toHaveAttribute('aria-pressed', 'true');
  await bubble.getByTestId('fmt-h2').click();
  await expect(page.getByTestId('memo-editor').locator('h2')).toHaveText('论比喻的写法');
  await bubble.getByTestId('fmt-quote').click();
  await expect(page.getByTestId('memo-editor').locator('blockquote')).toContainText('论比喻的写法');
  await page.keyboard.press('End');
  await expect(bubble).toBeHidden();
  await page.getByTestId('memo-editor').locator('.anchor-chip').click({ modifiers: ['Alt'] });
  await expect(bubble).toBeHidden();
});

test('a memo from another article has its own tab colour and names its article (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await importText(page, '秋', '秋水共长天一色。');
  const foreign = page.locator('.memo-tab.foreign');
  await expect(foreign).toHaveCount(1);
  await expect(foreign).toHaveAttribute('title', /春/);
  await page.getByTestId('memo-new').click();
  await expect(page.locator('.memo-tab:not(.foreign)')).toHaveCount(1);
  const strip = await page.getByTestId('memo-tabs').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await foreign.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(strip);
});

test('a moved memo becomes an ordinary memo of its new article; the picker leaves out its current one (review of plan 8)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await importText(page, '秋', '秋水共长天一色。');
  await page.getByTestId('memo-menu').click();
  await page.getByTestId('memo-move').click();
  await expect(page.getByTestId('picker-item')).toHaveCount(1);
  await expect(page.getByTestId('picker-item')).toContainText('秋');
  await page.getByTestId('picker-item').click();
  await page.getByTestId('memo-new').click();
  await importText(page, '夏', '接天莲叶无穷碧。');
  await expect(page.getByTestId('memo-tab').filter({ hasText: 'Memo 1' })).toHaveCount(0);
});
