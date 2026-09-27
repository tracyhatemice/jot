import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

async function quoteIntoMemo(page: Page) {
  await openApp(page);
  await importText(page, '引用', '春风又绿江南岸。他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.locator('.cited')).toHaveText('比喻');
}

test('marks cited passages and opens the citing memo from them', async ({ page }) => {
  await quoteIntoMemo(page);
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(2);
  await page.locator('.cited').click();
  await expect(page.getByTestId('popover-memo')).toHaveCount(1);
  await expect(page.getByTestId('popover-memo')).toContainText('Memo 1');
  await page.getByTestId('popover-open-memo').click();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['比喻']);
});

test('the cited mark disappears when its memo is deleted', async ({ page }) => {
  await quoteIntoMemo(page);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('memo-delete').click();
  await expect(page.locator('.cited')).toHaveCount(0);
});
