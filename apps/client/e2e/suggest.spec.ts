import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

const editor = (page: Page) => page.getByTestId('memo-editor');
const chips = (page: Page) => editor(page).locator('.anchor-chip');

/** A highlight on 明月, a side note 以景起兴 (on 春风), and an empty memo with the cursor in it. */
async function setup(page: Page) {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸，明月何时照我还。');
  await selectText(page, '明月');
  await page.getByTestId('toolbar-highlight').click();
  await selectText(page, '春风');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await page.getByTestId('memo-new').click();
  await editor(page).click();
}

test('links a highlight by typing [[ and part of its text', async ({ page }) => {
  await setup(page);
  await page.keyboard.insertText('对比[[明月');
  await expect(page.getByTestId('link-suggestion')).toHaveCount(1);
  await expect(page.getByTestId('link-suggestion')).toContainText('明月');
  await page.keyboard.press('Enter');
  await expect(chips(page)).toHaveText(['明月']);
  await expect(editor(page)).not.toContainText('[[');
  await expect(editor(page)).toContainText('对比');
});

test('【【, which a Chinese input method types, works right after Chinese text (Review Focus 2)', async ({ page }) => {
  await setup(page);
  await page.keyboard.insertText('起笔【【以景');
  await expect(page.getByTestId('link-suggestion')).toHaveCount(1);
  await page.getByTestId('link-suggestion').click();
  await expect(chips(page)).toHaveText(['以景起兴']);
  await expect(editor(page)).not.toContainText('【【');
});

test('Escape closes the list without inserting a link', async ({ page }) => {
  await setup(page);
  await page.keyboard.insertText('[[明');
  await expect(page.getByTestId('link-suggestion')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('link-suggestions')).toHaveCount(0);
  await expect(chips(page)).toHaveCount(0);
  await expect(editor(page)).toContainText('[[明');
});

test('says so when nothing matches', async ({ page }) => {
  await setup(page);
  await page.keyboard.insertText('[[没有这句');
  await expect(page.getByTestId('link-suggestion-empty')).toBeVisible();
});
