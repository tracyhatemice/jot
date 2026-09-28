import { expect, test, type Page } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

/** Accepts every confirmation (moving to the Trash, erasing) and keeps their texts. */
function acceptDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on('dialog', (dialog) => {
    seen.push(dialog.message());
    void dialog.accept();
  });
  return seen;
}

async function deleteArticle(page: Page, title: string): Promise<void> {
  const row = page.locator('.library li').filter({ hasText: title });
  await row.hover();
  await row.getByRole('button', { name: 'Delete' }).click();
}

async function deleteTag(page: Page, name: string): Promise<void> {
  await page.locator(`[data-testid="tag-row"][data-tag="${name}"]`).first().getByTestId('tag-menu').click();
  await page.getByTestId('tag-delete').click();
}

/** 春, with a highlight on 比喻 carrying the side note 以景起兴 tagged 修辞. */
async function articleWithNote(page: Page): Promise<void> {
  await importText(page, '春', '春风又绿江南岸。他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await addTag(page, 'note-tags', '修辞');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
}

test('a deleted article waits in the Trash, and restoring brings back its markups and side notes (spec §10 step 7)', async ({ page }) => {
  await openApp(page);
  const prompts = acceptDialogs(page);
  await articleWithNote(page);
  await deleteArticle(page, '春');
  expect(prompts.at(-1)).toContain('to the Trash');
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('trash-count')).toHaveText('1');

  await page.getByTestId('trash-open').click();
  const entry = page.getByTestId('trash-entry');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('春');
  await expect(entry).toContainText('markups: 1, side notes: 1');
  await entry.getByTestId('trash-restore').click();
  await expect(page.getByTestId('trash-none')).toBeVisible();
  await expect(page.getByTestId('trash-count')).toHaveCount(0);

  await page.getByRole('link', { name: '春' }).click();
  await expect(page.locator('.mk-highlight')).toHaveText(['比喻']);
  await expect(page.getByTestId('side-note').locator('textarea')).toHaveValue('以景起兴');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
});

test('restoring a tag puts it back on the side note', async ({ page }) => {
  await openApp(page);
  acceptDialogs(page);
  await articleWithNote(page);
  await deleteTag(page, '修辞');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveCount(0);
  await page.getByTestId('trash-open').click();
  await expect(page.getByTestId('trash-entry')).toContainText('taggings: 1');
  await page.getByTestId('trash-entry').getByTestId('trash-restore').click();
  await expect(page.getByTestId('trash-none')).toBeVisible();
  await page.getByRole('link', { name: '春' }).click();
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
});

test('Delete forever and Empty Trash leave the Trash empty, and search finds nothing of it (spec §10 step 7)', async ({ page }) => {
  await openApp(page);
  const prompts = acceptDialogs(page);
  await articleWithNote(page);
  await deleteArticle(page, '春');
  await deleteTag(page, '修辞');
  await expect(page.getByTestId('trash-count')).toHaveText('2');
  await page.getByTestId('trash-open').click();
  await expect(page.getByTestId('trash-entry')).toHaveCount(2);
  await page.getByTestId('trash-entry').filter({ hasText: '修辞' }).getByTestId('trash-erase').click();
  expect(prompts.at(-1)).toContain('forever');
  await expect(page.getByTestId('trash-entry')).toHaveCount(1);
  await page.getByTestId('trash-empty').click();
  await expect(page.getByTestId('trash-none')).toBeVisible();
  await expect(page.getByTestId('trash-count')).toHaveCount(0);
  await page.getByTestId('search-input').fill('春风');
  await expect(page.getByTestId('search-empty')).toBeVisible();
});
