import { expect, test } from '@playwright/test';
import { deleteArticle, importText, openApp, selectText } from './helpers';

test('a memo outlives its article: the memo list keeps it, it still opens, and its link says the passage is in the Trash (Review Focus 4, 5)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.insertText('写景起笔');
  await page.waitForTimeout(1_000);

  const item = page.getByTestId('memo-list-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Memo 1');
  await expect(item).toContainText('春');

  await deleteArticle(page, '春');
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(item).toContainText('No article');

  await page.getByTestId('memo-tab').filter({ hasText: 'Memo 1' }).locator('..').getByRole('button', { name: 'Close memo' }).click();
  await expect(page.getByTestId('memo-editor')).toHaveCount(0);
  await item.click();
  await expect(page.getByTestId('memo-editor')).toContainText('写景起笔');
  await page.getByTestId('memo-editor').locator('.anchor-chip').click();
  await expect(page.getByTestId('error-banner')).toContainText('in the Trash');
});
