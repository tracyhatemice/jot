import { expect, test } from '@playwright/test';
import { importText, openApp, startFixing } from './helpers';

const long = (n: number) => Array.from({ length: n }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n');

test('Aa changes the typeface, size, line spacing and width, and they stay after a reload', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他用比喻写春天。');
  const bar = page.getByTestId('article-bar');
  await bar.getByTestId('reading-open').click();
  await bar.getByTestId('reading-typeface').click();
  await bar.getByTestId('reading-han-kai').click();
  await bar.getByTestId('reading-back').click();
  await bar.getByTestId('reading-size-up').click();
  await bar.getByTestId('reading-size-up').click();
  await expect(bar.getByTestId('reading-size')).toHaveText('20px');
  await bar.getByTestId('reading-lineHeight-up').click();
  await expect(bar.getByTestId('reading-lineHeight')).toHaveText('2.0');
  await bar.getByTestId('reading-width-down').click();
  await expect(bar.getByTestId('reading-width')).toHaveText('Narrow');
  const view = page.getByTestId('article-view');
  await expect(view).toHaveCSS('font-size', '20px');
  await expect(view).toHaveCSS('line-height', '40px');
  expect(await view.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Kai');

  // The in-memory library is gone after a reload; the reading style is not.
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await importText(page, '秋', '秋水共长天一色。');
  await expect(page.getByTestId('article-view')).toHaveCSS('font-size', '20px');
  await page.getByTestId('article-bar').getByTestId('reading-open').click();
  await page.getByTestId('article-bar').getByTestId('reading-reset').click();
  await expect(page.getByTestId('article-view')).toHaveCSS('font-size', '18px');
});

test('☰ holds Fix text, Edit details and Delete; the fix bar floats at the bottom (Review Focus 3)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他用比喻写春天。');
  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-details').click();
  await page.getByTestId('details-title').fill('春之歌');
  await page.getByTestId('details-author').fill('佚名');
  await page.getByTestId('details-save').click();
  await expect(page.getByTestId('article-title')).toHaveText('春之歌');
  await expect(page.getByTestId('library-list')).toContainText('春之歌');

  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-details').click();
  await page.getByTestId('details-title').fill('   ');
  await page.getByTestId('details-save').click();
  await expect(page.getByTestId('details-dialog')).toContainText('needs a title');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('article-title')).toHaveText('春之歌');

  await startFixing(page);
  const fixBar = await page.getByTestId('edit-bar').boundingBox();
  const viewport = page.viewportSize();
  expect(fixBar && viewport && fixBar.y + fixBar.height).toBeGreaterThan((viewport?.height ?? 0) - 80);
  await page.getByTestId('edit-cancel').click();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-delete').click();
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await page.getByTestId('trash-open').click();
  await expect(page.getByTestId('trash-entry')).toContainText('春之歌');
});

test('the bar hides while scrolling down and comes back on scrolling up or hovering at the top (Review Focus 5)', async ({ page }) => {
  await openApp(page);
  const long = Array.from({ length: 80 }, (_, i) => `第${i + 1}段，写春天的景色。`).join('\n\n');
  await importText(page, '长文', long);
  const bar = page.getByTestId('article-bar');
  const reader = page.locator('main.reader');
  await expect(bar).toHaveAttribute('data-shown', 'true');
  await reader.evaluate((el) => el.scrollBy(0, 600));
  await expect(bar).toHaveAttribute('data-shown', 'false');
  await reader.evaluate((el) => el.scrollBy(0, -200));
  await expect(bar).toHaveAttribute('data-shown', 'true');
  await reader.evaluate((el) => el.scrollBy(0, 300));
  await expect(bar).toHaveAttribute('data-shown', 'false');
  const box = await reader.boundingBox();
  if (!box) throw new Error('reader not rendered');
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await expect(bar).toHaveAttribute('data-shown', 'true');
  // With a panel open the bar stays.
  await bar.getByTestId('reading-open').click();
  await reader.evaluate((el) => el.scrollBy(0, 300));
  await expect(bar).toHaveAttribute('data-shown', 'true');
});

test('in fix mode the line being edited stays clear of the bars (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', long(60));
  await startFixing(page);
  const caretLine = () =>
    page.evaluate(() => {
      const node = window.getSelection()?.focusNode;
      const el = node instanceof Element ? node : node?.parentElement;
      const r = el?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom } : null;
    });
  await page.getByTestId('article-editor').getByText('第5段：春风又绿江南岸。', { exact: true }).click();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
  const fixBar = await page.getByTestId('edit-bar').boundingBox();
  expect((await caretLine())?.bottom ?? 9999).toBeLessThanOrEqual((fixBar?.y ?? 0) + 1);

  await page.getByTestId('article-editor').getByText('第40段：春风又绿江南岸。', { exact: true }).click();
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowUp');
  const reader = await page.locator('main.reader').boundingBox();
  expect((await caretLine())?.top ?? -1).toBeGreaterThanOrEqual((reader?.y ?? 0) + 36 - 1);
});

test('an error in fix mode leaves Save and Discard reachable (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他用比喻写春天。');
  await startFixing(page);
  await page.getByTestId('article-editor').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('error-banner')).toBeVisible();
  for (const id of ['edit-save', 'edit-cancel']) {
    const b = await page.getByTestId(id).boundingBox();
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
      [(b?.x ?? 0) + (b?.width ?? 0) / 2, (b?.y ?? 0) + (b?.height ?? 0) / 2],
    );
    expect(hit).toBe(id);
  }
});

test('keyboard: focus comes back to ☰ after Escape or a dialog, and tabbing into the hidden bar keeps the reading position (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', long(80));
  const menu = page.getByTestId('article-menu');
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('article-details')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByTestId('article-details').click();
  await expect(page.getByTestId('details-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();

  const reader = page.locator('main.reader');
  await reader.evaluate((el) => el.scrollBy(0, 1200));
  await expect(page.getByTestId('article-bar')).toHaveAttribute('data-shown', 'false');
  const before = await reader.evaluate((el) => el.scrollTop);
  await page.getByTestId('trash-open').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('article-bar').getByTestId('reading-open')).toBeFocused();
  expect(await reader.evaluate((el) => el.scrollTop)).toBe(before);
});

test('in fix mode the bar still hides on scrolling down; after a panel closes it hides again (review of plan 8)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', long(80));
  const bar = page.getByTestId('article-bar');
  const reader = page.locator('main.reader');
  await bar.getByTestId('reading-open').click();
  await page.keyboard.press('Escape');
  await reader.evaluate((el) => el.scrollBy(0, 600));
  await expect(bar).toHaveAttribute('data-shown', 'false');
  await reader.evaluate((el) => el.scrollTo(0, 0));
  await expect(bar).toHaveAttribute('data-shown', 'true');
  await startFixing(page);
  await reader.evaluate((el) => el.scrollBy(0, 600));
  await expect(bar).toHaveAttribute('data-shown', 'false');
});

test('a narrower line width narrows the text column (review of plan 8)', async ({ page }) => {
  // Wide enough that the text column isn't already squeezed by the margin notes and the memo column.
  await page.setViewportSize({ width: 1800, height: 900 });
  await openApp(page);
  await importText(page, '长文', long(10));
  const width = () => page.getByTestId('article-view').evaluate((el) => el.getBoundingClientRect().width);
  const before = await width();
  await page.getByTestId('article-bar').getByTestId('reading-open').click();
  await page.getByTestId('reading-width-down').click();
  expect(await width()).toBeLessThan(before - 40);
});
