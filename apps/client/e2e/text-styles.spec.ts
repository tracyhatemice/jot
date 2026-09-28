import { expect, test, type Page } from '@playwright/test';
import { importText, openApp } from './helpers';

test('Text styles: an English and a Chinese typeface, each shown in its own face, plus size, spacing and width (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', 'Spring 他用比喻写春天。');
  const bar = page.getByTestId('article-bar');
  await bar.getByTestId('reading-open').click();
  const panel = page.getByTestId('reading-panel');
  await expect(panel).toContainText('Source Serif');
  await panel.getByTestId('reading-typeface').click();
  const inter = panel.getByTestId('reading-latin-inter');
  expect(await inter.locator('.ts-label').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Inter');
  await inter.click();
  await panel.getByTestId('reading-han-kai').click();
  await expect(inter).toHaveAttribute('aria-checked', 'true');
  await panel.getByTestId('reading-back').click();
  await expect(panel.getByTestId('reading-typeface')).toContainText('Inter');
  await panel.getByTestId('reading-width-down').click();
  await expect(panel.getByTestId('reading-width')).toHaveText('Narrow');
  const view = page.getByTestId('article-view');
  const family = await view.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family.indexOf('Inter')).toBeLessThan(family.indexOf('Kai'));
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px Inter'))).toBe(true);
});

test('opening Text styles moves focus into it; Escape brings it back to Aa', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他用比喻写春天。');
  const aa = page.getByTestId('article-bar').getByTestId('reading-open');
  await aa.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('reading-typeface')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(aa).toBeFocused();
});

test('the panel stays inside the window in a narrow memo column (Review Focus 2)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('jot.memoWidth', '240'));
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await importText(page, '春', '他用比喻写春天。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-bar').getByTestId('reading-open').click();
  const panel = await page.getByTestId('reading-panel').boundingBox();
  const viewport = page.viewportSize();
  expect(panel?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((panel?.x ?? 0) + (panel?.width ?? 9999)).toBeLessThanOrEqual(viewport?.width ?? 0);
});

test('☰ menus: arrow keys move between items, and Escape returns to ☰', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他用比喻写春天。');
  const menu = page.getByTestId('article-menu');
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('edit-start')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('article-details')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByTestId('article-delete')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('edit-start')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
});

test('long typeface names don’t cover the Typeface label (review)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() =>
    localStorage.setItem('jot.reading.article', JSON.stringify({ latin: 'atkinson', han: 'fangsong', size: 18, lineHeight: 1.9, width: 'medium' })),
  );
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await importText(page, '春', '他用比喻写春天。');
  await page.getByTestId('article-bar').getByTestId('reading-open').click();
  const label = page.getByTestId('reading-typeface').locator('.ts-label');
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const row = await page.getByTestId('reading-typeface').boundingBox();
  const panel = await page.getByTestId('reading-panel').boundingBox();
  expect((row?.x ?? 0) + (row?.width ?? 0)).toBeLessThanOrEqual((panel?.x ?? 0) + (panel?.width ?? 0) + 1);
});

test('each English typeface ships once per character set and style: no Greek, Cyrillic or Vietnamese files (review M5)', async ({ page }) => {
  await openApp(page);
  const literata = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Literata').length);
  expect(literata).toBe(6);
});

/** The drawn width of the first `text` in the element. */
async function drawnWidth(page: Page, testId: string, text: string): Promise<number> {
  return page.getByTestId(testId).evaluate((root, t) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(t) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + t.length);
      return range.getBoundingClientRect().width;
    }
    return -1;
  }, text);
}

// Which marks leave the English face is pinned by fontFaces.test.ts; here, that the Chinese face draws them in
// Chinese text: …… and —— are full-width (two ems) there, and narrower in the English face.
test('Chinese punctuation comes from the Chinese face in a Chinese article; an English article keeps its own (review M6)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他说：“春风又绿江南岸……”——好');
  await expect.poll(() => drawnWidth(page, 'article-view', '……')).toBeGreaterThan(18 * 1.8);
  expect(await drawnWidth(page, 'article-view', '——')).toBeGreaterThan(18 * 1.8);
  await importText(page, 'Spring', 'He said, “Spring is here……”——fine');
  await expect.poll(() => drawnWidth(page, 'article-view', '……')).toBeLessThan(18 * 1.7);
  expect(await drawnWidth(page, 'article-view', '——')).toBeLessThan(18 * 1.7);
});

test('a memo’s punctuation follows the language of its own text (review M6)', async ({ page }) => {
  await openApp(page);
  await importText(page, 'Spring', 'Spring is here.');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('他说：“春风又绿江南岸……”');
  await expect.poll(() => drawnWidth(page, 'memo-editor', '……')).toBeGreaterThan(16 * 1.8);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('He said, “Spring is here……”');
  await expect.poll(() => drawnWidth(page, 'memo-editor', '……')).toBeLessThan(16 * 1.7);
});
