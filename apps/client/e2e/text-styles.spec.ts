import { expect, test } from '@playwright/test';
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
