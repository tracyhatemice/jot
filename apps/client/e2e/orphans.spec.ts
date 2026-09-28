import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, revealArticleBar, selectText, startFixing } from './helpers';

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

test('the reattach hint stays clear of the article bar while scrolling (review)', async ({ page }) => {
  await openApp(page);
  const rest = Array.from({ length: 60 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n');
  await importText(page, '孤立', `他用比喻写春天。\n\n${rest}`);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await startFixing(page);
  await page.getByTestId('article-editor').getByText('他用比喻写春天。', { exact: true }).click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('orphan')).toHaveCount(1);
  await page.getByTestId('orphan-reattach').click();
  await expect(page.getByTestId('reattach-hint')).toBeVisible();
  const reader = page.locator('main.reader');
  await reader.evaluate((el) => el.scrollBy(0, 600));
  await expect(page.getByTestId('article-bar')).toHaveAttribute('data-shown', 'false');
  await reader.evaluate((el) => el.scrollBy(0, -100));
  // Let the bar finish sliding in before checking what it covers.
  await revealArticleBar(page);
  const b = await page.getByTestId('reattach-cancel').boundingBox();
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
    [(b?.x ?? 0) + (b?.width ?? 0) / 2, (b?.y ?? 0) + (b?.height ?? 0) / 2],
  );
  expect(hit).toBe('reattach-cancel');
});

