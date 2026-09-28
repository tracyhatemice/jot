import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

const chip = (page: Page) => page.getByTestId('memo-editor').locator('.anchor-chip');

test('a link scrolls a far-away passage into view and flashes it', async ({ page }) => {
  await openApp(page);
  const text = [...Array.from({ length: 150 }, (_, i) => `第${i}段：春风又绿江南岸。`), '目标句子就在这里。'].join('\n\n');
  await importText(page, '远处', text);
  await selectText(page, '目标句子');
  await page.getByTestId('toolbar-quote').click();
  await expect(chip(page)).toHaveText(['目标句子']);
  await page.locator('.reader').evaluate((el) => {
    el.scrollTop = 0;
  });
  await chip(page).click();
  const flash = page.locator('.flash');
  await expect(flash).toHaveText('目标句子');
  await expect(flash).toBeInViewport();
});

test('a link opens its article when another article is shown', async ({ page }) => {
  await openApp(page);
  await importText(page, '甲文', '春风又绿江南岸。他用比喻写春天。');
  await importText(page, '乙文', '乙文的内容。');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(1);
  await page.getByRole('link', { name: '甲文' }).click();
  await expect(page.getByTestId('article-title')).toHaveText('甲文');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  await expect(chip(page)).toHaveText(['比喻']);
  await page.getByRole('link', { name: '乙文' }).click();
  await expect(page.getByTestId('article-title')).toHaveText('乙文');
  await chip(page).click();
  await expect(page.getByTestId('article-title')).toHaveText('甲文');
  await expect(page.locator('.flash')).toHaveText('比喻');
});

test('a link to a removed highlight explains that the passage is gone (Review Focus 2)', async ({ page }) => {
  await openApp(page);
  await importText(page, '删除', '他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await page.locator('.mk-highlight').click();
  await page.getByTestId('popover-link').click();
  await expect(chip(page)).toHaveText(['比喻']);
  await page.locator('.mk-highlight').click();
  await page.getByTestId('popover-remove').click();
  await expect(page.locator('.mk-highlight')).toHaveCount(0);
  await chip(page).click();
  await expect(page.getByTestId('error-banner')).toContainText('The linked passage no longer exists.');
});

test('a followed link does not flash again when its article is reopened', async ({ page }) => {
  await openApp(page);
  await importText(page, '甲文', '春风又绿江南岸。他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  await expect(chip(page)).toHaveText(['比喻']);
  await chip(page).click();
  await expect(page.locator('.flash')).toHaveText('比喻');
  await expect(page.locator('.flash')).toHaveCount(0);
  await importText(page, '乙文', '乙文的内容。');
  await page.getByRole('link', { name: '甲文' }).click();
  await expect(page.getByTestId('article-title')).toHaveText('甲文');
  await page.waitForTimeout(500);
  // A one-off count: a retrying assertion would simply wait out a replayed flash.
  expect(await page.locator('.flash').count()).toBe(0);
});

test('a link into a deleted article says so and keeps the current article open (Review Focus 2)', async ({ page }) => {
  await openApp(page);
  await importText(page, '甲文', '他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  await expect(chip(page)).toHaveText(['比喻']);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('library-list').getByRole('link', { name: '甲文' }).hover();
  await page.getByTestId('library-list').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('library-list').getByRole('link')).toHaveCount(0);
  await importText(page, '乙文', '乙文的内容。');
  await chip(page).click();
  // The deleted article is in the Trash (spec §6.9), so the link says so rather than that it is gone.
  await expect(page.getByTestId('error-banner')).toContainText('The linked passage is in the Trash.');
  await expect(page.getByTestId('article-title')).toHaveText('乙文');
});
