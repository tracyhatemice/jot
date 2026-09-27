import { expect, test } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

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
  await expect(fresh.getByTestId('notice')).toContainText('articles: 1');
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
