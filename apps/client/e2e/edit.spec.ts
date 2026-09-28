import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText, startFixing } from './helpers';

async function setup(page: Page) {
  await openApp(page);
  await importText(page, '修订', '春风又绿江南岸。他用比喻写春天。明月何时照我还。');
}

async function startEditingAtTop(page: Page) {
  await startFixing(page);
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
  await expect(page.getByTestId('article-menu')).toBeVisible();
});

test('saving without changes says so (Review Focus 4)', async ({ page }) => {
  await setup(page);
  await startFixing(page);
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('edit-notice')).toContainText('No changes to save.');
});

test('refuses to save an empty article and keeps editing (Review Focus 4)', async ({ page }) => {
  await setup(page);
  await startFixing(page);
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
  await startFixing(page);
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
  const reading = (await line('article-view', fifty).boundingBox())!;

  await startFixing(page);
  await expect(page.getByTestId('article-editor')).toBeVisible();
  // Same left edge and width, so lines wrap exactly as when reading; and no vertical jump.
  const editing = (await line('article-editor', fifty).boundingBox())!;
  expect(Math.abs(editing.x - reading.x)).toBeLessThan(1);
  expect(Math.abs(editing.width - reading.width)).toBeLessThan(1);
  expect(Math.abs(editing.y - start)).toBeLessThan(2);
  await page.getByTestId('edit-cancel').click();
  await expect(page.getByTestId('article-view')).toBeVisible();
  await expect.poll(async () => Math.abs((await topOf('article-view', fifty)) - start)).toBeLessThan(6);

  await startFixing(page);
  await line('article-editor', fifty).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('补');
  const before = await topOf('article-editor', `${fifty}补`);
  await page.getByTestId('edit-save').click();
  await expect(line('article-view', `${fifty}补`)).toBeVisible();
  await expect.poll(async () => Math.abs((await topOf('article-view', `${fifty}补`)) - before)).toBeLessThan(6);
  await expect(page.getByTestId('edit-notice')).toBeInViewport();
});

test('entering and leaving fix mode never shows the text out of place, not even for one frame', async ({ page }) => {
  await openApp(page);
  await importText(page, '闪', Array.from({ length: 60 }, (_, i) => `第${i}段：春风又绿江南岸，明月何时照我还。`).join('\n\n'));
  await page.locator('.reader').evaluate((el) => {
    el.scrollTop = 900;
  });
  // Sample the position of one paragraph on every frame while the view and the editor swap.
  const record = () =>
    page.evaluate(() => {
      const w = window as unknown as { tops: number[]; recording: boolean };
      w.tops = [];
      w.recording = true;
      const tick = () => {
        const p = [...document.querySelectorAll('.article-view p')].find((e) => e.textContent?.startsWith('第20段'));
        w.tops.push(p ? Math.round(p.getBoundingClientRect().top) : Number.NaN);
        if (w.recording) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  const stop = () =>
    page.evaluate(() => {
      const w = window as unknown as { tops: number[]; recording: boolean };
      w.recording = false;
      return w.tops;
    });
  const steady = (tops: number[]) => tops.every((top) => Math.abs(top - tops[0]) <= 2);

  await record();
  await page.waitForTimeout(100);
  await startFixing(page);
  await page.waitForTimeout(400);
  const entering = await stop();
  expect(steady(entering), `paragraph top per frame: ${entering.join(' ')}`).toBe(true);

  await record();
  await page.waitForTimeout(100);
  await page.getByTestId('edit-cancel').click();
  await page.waitForTimeout(400);
  const leaving = await stop();
  expect(steady(leaving), `paragraph top per frame: ${leaving.join(' ')}`).toBe(true);

  await startFixing(page);
  await page.getByTestId('article-editor').getByText('第20段：春风又绿江南岸，明月何时照我还。', { exact: true }).click();
  await page.keyboard.insertText('补');
  await record();
  await page.waitForTimeout(100);
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('article-view')).toContainText('补');
  await page.waitForTimeout(300);
  const saving = await stop();
  expect(steady(saving), `paragraph top per frame: ${saving.join(' ')}`).toBe(true);
});
