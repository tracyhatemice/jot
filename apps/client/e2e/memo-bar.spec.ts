import { expect, test } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

test('a memo whose article is deleted moves to another article (spec §10 step 8, Review Focus 2)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.insertText('写景起笔');
  await page.waitForTimeout(1_000);
  await importText(page, '秋', '秋水共长天一色。');
  await page.getByTestId('library-list').getByRole('link', { name: '春' }).click();
  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-delete').click();

  await page.getByTestId('memo-list-item').click();
  await page.getByTestId('memo-menu').click();
  await page.getByTestId('memo-move').click();
  await page.getByTestId('picker-search').fill('秋');
  await expect(page.getByTestId('picker-item')).toHaveCount(1);
  await page.getByTestId('picker-item').click();
  await expect(page.getByTestId('article-title')).toHaveText('秋');
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
  await expect(page.locator('.memo-tab.active').getByRole('button', { name: 'Close memo' })).toHaveCount(0);
  await expect(page.getByTestId('memo-editor')).toContainText('写景起笔');
  await expect(page.getByTestId('memo-list-item')).toContainText('秋');
});

test('the memo has its own Aa settings, and no heading', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-pane').getByRole('heading', { name: 'Memo' })).toHaveCount(0);
  const bar = page.getByTestId('memo-bar');
  await bar.getByTestId('reading-open').click();
  await page.getByTestId('reading-size-down').click();
  await expect(page.getByTestId('memo-editor')).toHaveCSS('font-size', '15px');
  await expect(page.getByTestId('article-view')).toHaveCSS('font-size', '18px');
});

test('many memo tabs stay on one row that scrolls sideways, each as tall as the strip (Review Focus 4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  for (let i = 0; i < 8; i++) await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(8);
  const strip = page.getByTestId('memo-tabs');
  const tops = await page.getByTestId('memo-tab').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const stripBox = await strip.boundingBox();
  const tabBox = await page.getByTestId('memo-tab').first().boundingBox();
  expect(Math.abs((stripBox?.height ?? 0) - (tabBox?.height ?? 0))).toBeLessThan(2);
});

test('with many tabs the tabs keep their full height: the strip’s scroll bar lies over them (user review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  const tab = page.getByTestId('memo-tab').first();
  const before = (await tab.boundingBox())?.height ?? 0;
  for (let i = 0; i < 7; i++) await page.getByTestId('memo-new').click();
  const strip = page.getByTestId('memo-tabs');
  expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await strip.hover();
  // No room is kept under the tabs for a scroll bar.
  expect(await strip.evaluate((el: HTMLElement) => el.offsetHeight - el.clientHeight)).toBe(0);
  expect(Math.abs(((await tab.boundingBox())?.height ?? 0) - before)).toBeLessThan(1);
});

test('the tab strip’s scroll bar shows over the tabs on hover and while it scrolls, and can be dragged (user review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  const strip = page.getByTestId('memo-tabs');
  const thumb = page.getByTestId('memo-tabs-thumb');
  await strip.hover();
  await expect(thumb).toBeHidden();
  for (let i = 0; i < 7; i++) await page.getByTestId('memo-new').click();
  await strip.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.getByTestId('article-view').hover();
  await expect(thumb).toBeHidden({ timeout: 3_000 });
  await strip.hover();
  await expect(thumb).toBeVisible();
  const sb = await strip.boundingBox();
  const tb = await thumb.boundingBox();
  // Drawn over the bottom edge of the tabs, inside the strip.
  expect(tb?.y ?? 0).toBeGreaterThan((sb?.y ?? 0) + (sb?.height ?? 0) / 2);
  expect((tb?.y ?? 0) + (tb?.height ?? 0)).toBeLessThanOrEqual((sb?.y ?? 0) + (sb?.height ?? 0) + 0.5);
  expect(tb?.width ?? 0).toBeLessThan(sb?.width ?? 0);
  await page.mouse.move((tb?.x ?? 0) + (tb?.width ?? 0) / 2, (tb?.y ?? 0) + (tb?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move((tb?.x ?? 0) + (tb?.width ?? 0) / 2 + 80, (tb?.y ?? 0) + (tb?.height ?? 0) / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(40);
  const moved = await thumb.boundingBox();
  expect(moved?.x ?? 0).toBeGreaterThan(tb?.x ?? 0);
  // While the strip scrolls without the pointer over it, e.g. to show a new tab.
  await page.getByTestId('article-view').hover();
  await expect(thumb).toBeHidden({ timeout: 3_000 });
  await strip.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await expect(thumb).toBeVisible();
  await expect(thumb).toBeHidden({ timeout: 3_000 });
});

test('with many tabs, + stays in reach, the new tab scrolls into view, and the mouse wheel scrolls the strip (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  for (let i = 0; i < 8; i++) await page.getByTestId('memo-new').click();
  const strip = page.getByTestId('memo-tabs');
  const sb = await strip.boundingBox();
  const plus = await page.getByTestId('memo-new').boundingBox();
  const active = await page.locator('.memo-tab.active').boundingBox();
  const right = (sb?.x ?? 0) + (sb?.width ?? 0);
  expect((plus?.x ?? 9999) + (plus?.width ?? 0)).toBeLessThanOrEqual(right + 1);
  expect(active?.x ?? -1).toBeGreaterThanOrEqual((sb?.x ?? 0) - 1);
  expect((active?.x ?? 9999) + (active?.width ?? 0)).toBeLessThanOrEqual((plus?.x ?? 0) + 1);
  await strip.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.mouse.move((sb?.x ?? 0) + (sb?.width ?? 0) / 2, (sb?.y ?? 0) + (sb?.height ?? 0) / 2);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

test('selecting memo text shows a formatting menu; a link chip does not (spec §6.11, Review Focus 4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('论比喻的写法');
  await page.keyboard.press('Shift+Home');
  const bubble = page.getByTestId('memo-bubble');
  await expect(bubble).toBeVisible();
  await bubble.getByTestId('fmt-bold').click();
  await expect(page.getByTestId('memo-editor').locator('strong')).toHaveText('论比喻的写法');
  await expect(bubble.getByTestId('fmt-bold')).toHaveAttribute('aria-pressed', 'true');
  await bubble.getByTestId('fmt-h2').click();
  await expect(page.getByTestId('memo-editor').locator('h2')).toHaveText('论比喻的写法');
  await bubble.getByTestId('fmt-quote').click();
  await expect(page.getByTestId('memo-editor').locator('blockquote')).toContainText('论比喻的写法');
  // After a click in the menu the memo has the focus back, a frame later, with the text still selected.
  await expect(page.getByTestId('memo-editor')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('论比喻的写法');
  await page.keyboard.press('End');
  await expect(bubble).toBeHidden();
  // Select the link chip itself (a node selection): the menu must stay away, also after its 250 ms delay.
  // Up to the chip's line, then left over the space after the chip and onto the chip. One key at a time, at a
  // writer's pace: ProseMirror reads each move of the caret before the next key.
  for (const key of ['ArrowUp', 'End', 'ArrowLeft', 'ArrowLeft']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
  }
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveClass(/ProseMirror-selectednode/);
  await page.waitForTimeout(400);
  await expect(bubble).toBeHidden();
});

test('the formatting menu goes away when the writer clicks elsewhere after using it (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('论比喻的写法');
  await page.keyboard.press('Shift+Home');
  const bubble = page.getByTestId('memo-bubble');
  await bubble.getByTestId('fmt-bold').click();
  await expect(page.getByTestId('memo-editor').locator('strong')).toHaveText('论比喻的写法');
  await page.getByTestId('article-view').click();
  await expect(bubble).toBeHidden();
});

test('the formatting menu sits above the memo bar and follows the memo when it scrolls (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.insertText(`第${i}行札记`);
    await page.keyboard.press('Enter');
  }
  const memo = page.locator('aside.memo');
  const line = page.getByTestId('memo-editor').getByText('第20行札记', { exact: true });
  // Put that line just under the memo bar, then select it.
  await memo.evaluate((el, target) => {
    const p = [...el.querySelectorAll('.memo-editor p')].find((x) => x.textContent === target) as HTMLElement;
    el.scrollTop += p.getBoundingClientRect().top - el.getBoundingClientRect().top - 80;
  }, '第20行札记');
  await line.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  const bubble = page.getByTestId('memo-bubble');
  await expect(bubble).toBeVisible();
  const b = await bubble.getByTestId('fmt-bold').boundingBox();
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
    [(b?.x ?? 0) + (b?.width ?? 0) / 2, (b?.y ?? 0) + (b?.height ?? 0) / 2],
  );
  expect(hit).toBe('fmt-bold');
  await memo.evaluate((el) => el.scrollBy(0, 200));
  await expect
    .poll(async () => {
      if (!(await bubble.isVisible())) return true;
      const menu = await bubble.boundingBox();
      const text = await line.boundingBox();
      return Math.abs((menu?.y ?? 0) - (text?.y ?? 0)) < 80;
    })
    .toBe(true);
});

test('a memo from another article has its own tab colour and names its article (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await importText(page, '秋', '秋水共长天一色。');
  const foreign = page.locator('.memo-tab.foreign');
  await expect(foreign).toHaveCount(1);
  await expect(foreign.getByRole('tab')).toHaveAttribute('title', /春/);
  await page.getByTestId('memo-new').click();
  await expect(page.locator('.memo-tab:not(.foreign)')).toHaveCount(1);
  const strip = await page.getByTestId('memo-tabs').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await foreign.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(strip);
});

test('a moved memo becomes an ordinary memo of its new article; the picker leaves out its current one (review of plan 8)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await importText(page, '秋', '秋水共长天一色。');
  await page.getByTestId('memo-menu').click();
  await page.getByTestId('memo-move').click();
  await expect(page.getByTestId('picker-item')).toHaveCount(1);
  await expect(page.getByTestId('picker-item')).toContainText('秋');
  await page.getByTestId('picker-item').click();
  await page.getByTestId('memo-new').click();
  await importText(page, '夏', '接天莲叶无穷碧。');
  await expect(page.getByTestId('memo-tab').filter({ hasText: 'Memo 1' })).toHaveCount(0);
});

test('a foreign tab names its article on the tab itself, and never slants Chinese letters (review M4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await importText(page, '秋', '秋水共长天一色。');
  const tab = page.locator('.memo-tab.foreign').getByRole('tab');
  await expect(tab).toHaveAccessibleDescription(/春/);
  expect(await tab.evaluate((el) => getComputedStyle(el).getPropertyValue('font-synthesis-style'))).toBe('none');
});

test('Ctrl+Home and Ctrl+End reach the ends of a memo that starts with a link chip, also with Shift (review M11)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  const editor = page.getByTestId('memo-editor');
  await expect(editor.locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('第二行');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('第三行');
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.insertText('甲');
  await expect(editor.locator('p').first()).toHaveText(/^甲春风/);
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('乙');
  await expect(editor.locator('p').last()).toHaveText('第三行乙');
  await page.keyboard.press('ControlOrMeta+Shift+Home');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toContain('第二行');
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+Shift+End');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toContain('第三行乙');
});
