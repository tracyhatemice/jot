import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

async function setup(page: Page) {
  await openApp(page);
  await importText(page, '修订', '春风又绿江南岸。他用比喻写春天。明月何时照我还。');
}

async function startEditingAtTop(page: Page) {
  await page.getByTestId('edit-start').click();
  await page.getByTestId('article-editor').click();
  await page.keyboard.press('Control+Home');
}

test('fixes the text; markups and side notes stay on their words (spec §10 step 5)', async ({ page }) => {
  await setup(page);
  await selectText(page, '明月');
  await page.getByTestId('toolbar-highlight').click();
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('修辞');
  await startEditingAtTop(page);
  await expect(page.locator('.mk-highlight')).toHaveCount(0);
  await page.keyboard.insertText('【注】');
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('article-view')).toContainText('【注】春风又绿江南岸。');
  await expect(page.locator('.mk-highlight')).toHaveText(['比喻', '明月']);
  await expect(page.getByTestId('edit-notice')).toContainText('found in place: 2');
  await expect(page.getByTestId('side-note')).toBeVisible();
});

test('discarding the changes leaves the text as it was', async ({ page }) => {
  await setup(page);
  await startEditingAtTop(page);
  await page.keyboard.insertText('多余的字');
  await page.getByTestId('edit-cancel').click();
  await expect(page.getByTestId('article-view')).not.toContainText('多余的字');
  await expect(page.getByTestId('edit-start')).toBeVisible();
});

test('saving without changes says so (Review Focus 4)', async ({ page }) => {
  await setup(page);
  await page.getByTestId('edit-start').click();
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('edit-notice')).toContainText('No changes to save.');
});

test('refuses to save an empty article and keeps editing (Review Focus 4)', async ({ page }) => {
  await setup(page);
  await page.getByTestId('edit-start').click();
  await page.getByTestId('article-editor').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('error-banner')).toContainText('The article can’t be empty.');
  await expect(page.getByTestId('article-editor')).toBeVisible();
});

test('memo links and cited marks follow the edited text (Review Focus 2)', async ({ page }) => {
  await setup(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  const chip = page.getByTestId('memo-editor').locator('.anchor-chip');
  await expect(chip).toHaveText(['比喻']);
  await expect(page.locator('.cited')).toHaveText('比喻');
  await startEditingAtTop(page);
  await page.keyboard.insertText('【注】');
  await page.getByTestId('edit-save').click();
  await expect(page.locator('.cited')).toHaveText('比喻');
  await chip.click();
  await expect(page.locator('.flash')).toHaveText('比喻');
});

test('types Chinese with an input method while fixing the text (risk check M0.3, Review Focus 3)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'input-method composition is driven through the Chrome DevTools Protocol');
  await setup(page);
  await startEditingAtTop(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'xin', selectionStart: 3, selectionEnd: 3 });
  await cdp.send('Input.insertText', { text: '新' });
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('article-view')).toContainText('新春风又绿江南岸。');
  await expect(page.getByTestId('article-view')).not.toContainText('xin');
});

test('a typo fixed inside a highlight shows the corrected words in its menu (Review Focus 2)', async ({ page }) => {
  await openApp(page);
  await importText(page, '错字', '前面的一些文字。春风又绿江男岸，明月何时照我还。后面的一些文字。');
  await selectText(page, '春风又绿江男岸');
  await page.getByTestId('toolbar-highlight').click();
  await page.getByTestId('edit-start').click();
  await page.getByTestId('article-editor').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('前面的一些文字。春风又绿江南岸，明月何时照我还。后面的一些文字。');
  await page.getByTestId('edit-save').click();
  await expect(page.locator('.mk-highlight')).toHaveText(['春风又绿江南岸']);
  await page.locator('.mk-highlight').click();
  await expect(page.getByTestId('popover-item')).toContainText('春风又绿江南岸');
});

test('keeps the text where it is on screen when editing starts, is discarded and is saved', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', Array.from({ length: 120 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n'));
  const line = (area: string, text: string) => page.getByTestId(area).getByText(text, { exact: true });
  const topOf = async (area: string, text: string) => (await line(area, text).boundingBox())!.y;
  const fifty = '第50段：春风又绿江南岸。';
  await line('article-view', fifty).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const start = await topOf('article-view', fifty);

  await page.getByTestId('edit-start').click();
  await expect(page.getByTestId('article-editor')).toBeVisible();
  expect(Math.abs((await topOf('article-editor', fifty)) - start)).toBeLessThan(6);
  await page.getByTestId('edit-cancel').click();
  await expect(page.getByTestId('article-view')).toBeVisible();
  await expect.poll(async () => Math.abs((await topOf('article-view', fifty)) - start)).toBeLessThan(6);

  await page.getByTestId('edit-start').click();
  await line('article-editor', fifty).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('补');
  const before = await topOf('article-editor', `${fifty}补`);
  await page.getByTestId('edit-save').click();
  await expect(line('article-view', `${fifty}补`)).toBeVisible();
  await expect.poll(async () => Math.abs((await topOf('article-view', `${fifty}补`)) - before)).toBeLessThan(6);
  await expect(page.getByTestId('edit-notice')).toBeInViewport();
});
