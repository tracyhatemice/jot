import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText, startFixing } from './helpers';

async function importArticle(page: Page) {
  await openApp(page);
  await importText(page, '孤立', '春风又绿江南岸。他用比喻写春天。明月何时照我还。');
}

/** A fix-up that deletes the sentence containing 比喻. */
async function deleteTheMetaphorSentence(page: Page) {
  await startFixing(page);
  await page.getByTestId('article-editor').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('春风又绿江南岸。明月何时照我还。');
  await page.getByTestId('edit-save').click();
}

test('lists a markup whose words were deleted, and re-attaches it to a new selection (spec §10 step 5)', async ({ page }) => {
  await importArticle(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('修辞');
  await deleteTheMetaphorSentence(page);
  await expect(page.getByTestId('edit-notice')).toContainText('not found: 1');
  await expect(page.getByTestId('orphan')).toHaveCount(1);
  await expect(page.getByTestId('orphan')).toContainText('比喻');
  await expect(page.getByTestId('orphan')).toContainText('修辞');
  await expect(page.locator('.mk-highlight')).toHaveCount(0);
  await expect(page.getByTestId('side-note')).toBeHidden();

  await page.getByTestId('orphan-reattach').click();
  await expect(page.getByTestId('reattach-hint')).toContainText('比喻');
  await selectText(page, '明月');
  await expect(page.getByTestId('toolbar-highlight')).toHaveCount(0);
  await page.getByTestId('toolbar-attach').click();
  await expect(page.getByTestId('orphans')).toHaveCount(0);
  await expect(page.locator('.mk-highlight')).toHaveText(['明月']);
  await expect(page.getByTestId('side-note')).toBeVisible();
  await expect(page.getByTestId('side-note').locator('textarea')).toHaveValue('修辞');
});

test('deletes an orphaned markup', async ({ page }) => {
  await importArticle(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await deleteTheMetaphorSentence(page);
  await expect(page.getByTestId('orphan')).toHaveCount(1);
  await page.getByTestId('orphan-delete').click();
  await expect(page.getByTestId('orphans')).toHaveCount(0);
});

test('a memo link to an orphaned markup explains why it goes nowhere', async ({ page }) => {
  await importArticle(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await page.locator('.mk-highlight').click();
  await page.getByTestId('popover-link').click();
  const chip = page.getByTestId('memo-editor').locator('.anchor-chip');
  await expect(chip).toHaveText(['比喻']);
  await deleteTheMetaphorSentence(page);
  await chip.click();
  await expect(page.getByTestId('error-banner')).toContainText('can’t be found since the article text was fixed');
  await expect(page.locator('.flash')).toHaveCount(0);
});
