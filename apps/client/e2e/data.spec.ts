import { expect, test, type Page } from '@playwright/test';
import { addTag, deleteArticle, importText, openApp, selectText } from './helpers';

test('exports the library and imports it into a fresh one (spec §10 step 6)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await addTag(page, 'note-tags', '修辞');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.insertText('写景起笔');
  await page.waitForTimeout(1_000);

  const downloading = page.waitForEvent('download');
  await page.getByTestId('settings-open').click();
  await page.getByTestId('library-export').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^jot-library-\d{8}-\d{4}\.json$/);
  const file = test.info().outputPath('library.json');
  await download.saveAs(file);

  const fresh = await page.context().newPage();
  await openApp(fresh);
  await expect(fresh.getByTestId('library-empty')).toBeVisible();
  fresh.once('dialog', (dialog) => void dialog.accept());
  await fresh.getByTestId('library-import-file').setInputFiles(file);
  await expect(fresh.getByTestId('notice')).toContainText('articles 1');
  await fresh.getByRole('link', { name: '春' }).click();
  await expect(fresh.locator('.mk-highlight')).toHaveText(['比喻']);
  await expect(fresh.getByTestId('side-note').locator('textarea')).toHaveValue('以景起兴');
  await expect(fresh.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
  await expect(fresh.getByTestId('memo-editor')).toContainText('写景起笔');
  await expect(fresh.locator('.cited')).toHaveText('春风');
  await fresh.getByTestId('search-input').fill('起兴');
  await expect(fresh.getByTestId('search-result')).toHaveCount(1);
});

test('refuses a file that is not a Jot export, and changes nothing (Review Focus 3)', async ({ page }) => {
  await openApp(page);
  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .getByTestId('library-import-file')
    .setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') });
  await expect(page.getByTestId('error-banner')).toContainText('isn’t a Jot library export');
  await expect(page.getByTestId('library-empty')).toBeVisible();
});

async function exportFile(page: Page, name: string): Promise<string> {
  const downloading = page.waitForEvent('download');
  await page.getByTestId('settings-open').click();
  await page.getByTestId('library-export').click();
  const file = test.info().outputPath(name);
  await (await downloading).saveAs(file);
  return file;
}

async function importFile(page: Page, file: string): Promise<void> {
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('library-import-file').setInputFiles(file);
}

test('a memo open during an import shows what the file brought in, and keeps it searchable after more typing (Review Focus 4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.insertText('第一稿');
  await page.waitForTimeout(1_000);
  const first = await exportFile(page, 'first.json');

  const other = await page.context().newPage();
  await openApp(other);
  await importFile(other, first);
  await other.getByRole('link', { name: '春' }).click();
  await expect(other.getByTestId('memo-editor')).toContainText('第一稿');

  await page.getByTestId('memo-editor').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('第二稿');
  await page.waitForTimeout(1_000);
  const second = await exportFile(page, 'second.json');

  // The memo stays open in the other library while the newer file comes in.
  await importFile(other, second);
  await expect(other.getByTestId('memo-editor')).toContainText('第二稿');
  await other.getByTestId('memo-editor').click();
  await other.keyboard.press('ControlOrMeta+End');
  await other.keyboard.insertText('再改');
  await other.waitForTimeout(1_000);
  await other.getByTestId('search-input').fill('第二稿');
  await expect(other.getByTestId('search-result')).toHaveCount(1);
});

test('importing a backup offers to bring back what was deleted since, and restores it (the writer’s steps)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await addTag(page, 'note-tags', '修辞');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
  await page.waitForTimeout(1_000);
  const backup = await exportFile(page, 'backup.json');

  const prompts: string[] = [];
  page.on('dialog', (dialog) => {
    prompts.push(dialog.message());
    void dialog.accept();
  });
  await deleteArticle(page, '春');
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await page.locator('[data-testid="tag-row"][data-tag="修辞"]').first().getByTestId('tag-menu').click();
  await page.getByTestId('tag-delete').click();
  await expect(page.locator('[data-testid="tag-row"][data-tag="修辞"]')).toHaveCount(0);

  await page.getByTestId('library-import-file').setInputFiles(backup);
  await expect(page.getByTestId('notice')).toContainText('Restored');
  expect(prompts.some((m) => m.includes('deleted in this library'))).toBe(true);
  await page.getByRole('link', { name: '春' }).click();
  await expect(page.locator('.mk-highlight')).toHaveText(['比喻']);
  await expect(page.getByTestId('side-note').locator('textarea')).toHaveValue('以景起兴');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
  await expect(page.locator('[data-testid="tag-row"][data-tag="修辞"]')).toHaveCount(1);
});
