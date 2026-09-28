import { expect, test } from '@playwright/test';
import { importText, openApp, startFixing } from './helpers';

test('Aa changes the typeface, size, line spacing and width, and they stay after a reload', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他用比喻写春天。');
  const bar = page.getByTestId('article-bar');
  await bar.getByTestId('reading-open').click();
  await bar.getByTestId('reading-font-kai').click();
  await bar.getByTestId('reading-size-up').click();
  await bar.getByTestId('reading-size-up').click();
  await expect(bar.getByTestId('reading-size')).toHaveText('20px');
  await bar.getByTestId('reading-lineHeight-up').click();
  await expect(bar.getByTestId('reading-lineHeight')).toHaveText('2.0');
  await bar.getByTestId('reading-width-down').click();
  await expect(bar.getByTestId('reading-width')).toHaveText('35em');
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
