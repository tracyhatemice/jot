import { expect, test, type Page } from '@playwright/test';
import { deleteArticle, importText, openApp } from './helpers';

const tabs = (page: Page) => page.getByTestId('article-tab');
const tab = (page: Page, title: string) => tabs(page).filter({ has: page.getByRole('tab', { name: title, exact: true }) });
const titles = (page: Page) => tabs(page).getByRole('tab').allTextContents();
const fromSidebar = (page: Page, title: string) => page.getByTestId('library-list').getByRole('link', { name: title, exact: true }).click();

test('articles open in one preview tab, slanted and dimmed, which the next opened article replaces (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await importText(page, '秋', '秋水共长天一色。');
  await expect(tabs(page)).toHaveCount(1);
  await expect(tab(page, '秋')).toHaveClass(/preview/);
  await fromSidebar(page, '春');
  await expect(page.getByTestId('article-title')).toHaveText('春');
  expect(await titles(page)).toEqual(['春']);
  await expect(tab(page, '春').getByRole('tab')).toHaveAttribute('aria-selected', 'true');
  const look = await tab(page, '春').getByRole('tab').evaluate((el) => ({ style: getComputedStyle(el).fontStyle, opacity: Number(getComputedStyle(el).opacity) }));
  expect(look.style).toBe('italic');
  expect(look.opacity).toBeLessThan(0.9);
});

test('double-clicking the preview tab keeps it; the next article gets its own preview tab after the active one (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await tab(page, '春').getByRole('tab').dblclick();
  await expect(tab(page, '春')).not.toHaveClass(/preview/);
  await importText(page, '秋', '秋水共长天一色。');
  expect(await titles(page)).toEqual(['春', '秋']);
  await expect(tab(page, '秋')).toHaveClass(/preview/);
  await tab(page, '春').getByRole('tab').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
  await expect(tab(page, '春')).toHaveClass(/active/);
  await importText(page, '冬', '冬雪压青松。');
  expect(await titles(page)).toEqual(['春', '冬']);
});

test('a section page shows the strip with no tab active; clicking a tab goes back to its article (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('section-library-open').click();
  await expect(page.getByTestId('library-page')).toBeVisible();
  await expect(tabs(page)).toHaveCount(1);
  await expect(page.getByTestId('article-tabs').getByRole('tab', { selected: true })).toHaveCount(0);
  await tab(page, '春').getByRole('tab').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
});

test('closing a tab shows its right-hand neighbour, else the left-hand one; closing the last empties the column (spec §6.13)', async ({ page }) => {
  await openApp(page);
  for (const [title, text] of [['春', '春风又绿江南岸。'], ['秋', '秋水共长天一色。'], ['冬', '冬雪压青松。']]) {
    await importText(page, title, text);
    await tab(page, title).getByRole('tab').dblclick();
  }
  await tab(page, '秋').getByRole('tab').click();
  await tab(page, '秋').getByTestId('article-tab-close').click();
  await expect(page.getByTestId('article-title')).toHaveText('冬');
  await tab(page, '冬').getByTestId('article-tab-close').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
  await tab(page, '春').getByTestId('article-tab-close').click();
  await expect(page.getByTestId('article-tabs')).toHaveCount(0);
  await expect(page.locator('main.reader > p.empty')).toBeVisible();
});

test('moving an article to the Trash closes its tab; restoring it doesn’t reopen it (spec §6.13)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await tab(page, '春').getByRole('tab').dblclick();
  await importText(page, '秋', '秋水共长天一色。');
  await deleteArticle(page, '秋');
  await expect.poll(() => titles(page)).toEqual(['春']);
  await page.getByTestId('trash-open').click();
  await page.getByTestId('trash-entry').getByTestId('trash-restore').click();
  await expect(page.getByTestId('trash-entry')).toHaveCount(0);
  expect(await titles(page)).toEqual(['春']);
});

test('open tabs and the preview are remembered after a reload; a tab of an article that is gone drops out (spec §6.13, Review Focus 4)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await openApp(page, { memory: false });
  await importText(page, '春', '春风又绿江南岸。');
  await tab(page, '春').getByRole('tab').dblclick();
  await importText(page, '秋', '秋水共长天一色。');
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('jot.articleTabs') ?? '[]') as unknown[];
    localStorage.setItem('jot.articleTabs', JSON.stringify([...stored, { id: 'no-such-article', preview: false }, 'junk']));
  });
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => titles(page)).toEqual(['春', '秋']);
  await expect(tab(page, '秋')).toHaveClass(/preview/);
  await expect(tab(page, '春')).not.toHaveClass(/preview/);
});

test('the tab strip scrolls sideways under the wheel and hides the system scroll bar (spec §6.13)', async ({ page, browserName }) => {
  await openApp(page);
  for (let i = 0; i < 12; i++) {
    await importText(page, `一篇很长的文章标题 ${i}`, `第${i}篇。`);
    await tab(page, `一篇很长的文章标题 ${i}`).getByRole('tab').dblclick();
  }
  const strip = page.getByTestId('article-tabs');
  await strip.evaluate((el) => el.scrollTo({ left: 0 }));
  await strip.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  if (browserName === 'chromium') expect(await strip.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none');
});

test('double-clicking an article in the sidebar or on the Library page keeps its tab; a single click opens a preview (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await importText(page, '秋', '秋水共长天一色。');
  await page.getByTestId('library-list').getByRole('link', { name: '春', exact: true }).dblclick();
  await expect(page.getByTestId('article-title')).toHaveText('春');
  await expect(tab(page, '春')).not.toHaveClass(/preview/);
  await page.getByTestId('section-library-open').click();
  const row = (title: string) => page.getByTestId('library-page').getByTestId('row-main').filter({ hasText: title });
  await row('秋').dblclick();
  await expect(page.getByTestId('article-title')).toHaveText('秋');
  expect(await titles(page)).toEqual(['春', '秋']);
  await expect(tab(page, '秋')).not.toHaveClass(/preview/);
  await importText(page, '冬', '冬雪压青松。');
  await page.getByTestId('section-library-open').click();
  await row('春').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
  expect(await titles(page)).toEqual(['春', '秋', '冬']);
});

test('going back to an article’s tab shows it where the writer left it (Review Focus 1)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', Array.from({ length: 80 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n'));
  await tab(page, '长文').getByRole('tab').dblclick();
  await importText(page, '秋', '秋水共长天一色。');
  await tab(page, '长文').getByRole('tab').click();
  await expect(page.getByTestId('article-title')).toHaveText('长文');
  const reader = page.locator('main.reader');
  const top = () => reader.evaluate((el) => el.scrollTop);
  await reader.evaluate((el) => el.scrollTo(0, 1500));
  await reader.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await tab(page, '秋').getByRole('tab').click();
  await expect(page.getByTestId('article-title')).toHaveText('秋');
  await expect.poll(top).toBe(0);
  await tab(page, '长文').getByRole('tab').click();
  await expect(page.getByTestId('article-title')).toHaveText('长文');
  await expect.poll(top).toBe(1500);
});

async function newStandaloneMemo(page: Page, title: string) {
  await page.getByTestId('memo-standalone-new').click();
  // The new memo is shown once its default title is: the previous memo's editor would pass a visibility check.
  await expect(page.getByTestId('memo-title')).toHaveValue(/^Memo \d+$/);
  await page.getByTestId('memo-title').fill(title);
  await page.getByTestId('memo-title').press('Enter');
  await expect(page.locator('.memo-tab.active')).toContainText(title);
}
const memoTabs = (page: Page) => page.getByTestId('memo-tab');
const memoTab = (page: Page, title: string) => page.locator('.memo-tab').filter({ has: page.getByTestId('memo-tab').filter({ hasText: title }) });

test('memos opened from elsewhere share one preview tab; double-clicking its tab or its row keeps it (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await newStandaloneMemo(page, '甲');
  await expect(memoTab(page, '甲')).toHaveClass(/preview/);
  await newStandaloneMemo(page, '乙');
  await expect(memoTabs(page)).toHaveText(['乙']);
  await page.getByTestId('memo-list-item').filter({ hasText: '甲' }).click();
  await expect(memoTabs(page)).toHaveText(['甲']);
  await page.getByTestId('memo-tab').filter({ hasText: '甲' }).dblclick();
  await expect(memoTab(page, '甲')).not.toHaveClass(/preview/);
  await page.getByTestId('memo-list-item').filter({ hasText: '乙' }).click();
  await expect(memoTabs(page)).toHaveText(['甲', '乙']);
  await expect(memoTab(page, '乙')).toHaveClass(/preview/);
  await page.getByTestId('memo-list-item').filter({ hasText: '乙' }).dblclick();
  await expect(memoTab(page, '乙')).not.toHaveClass(/preview/);
});

test('double-clicking a memo on the Memos page keeps its tab; the article’s own memos stay plain tabs (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await expect(page.locator('.memo-tab.active')).not.toHaveClass(/preview/);
  await newStandaloneMemo(page, '甲');
  await page.getByTestId('section-memos-open').click();
  const row = page.getByTestId('memos-page').getByTestId('row-main').filter({ hasText: '甲' });
  await row.click();
  await expect(memoTab(page, '甲')).toHaveClass(/preview/);
  await row.dblclick();
  await expect(memoTab(page, '甲')).not.toHaveClass(/preview/);
});

test('a memo being written when the writer switches articles stays open as a kept tab (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('写景起笔');
  await importText(page, '秋', '秋水共长天一色。');
  await expect(memoTabs(page)).toHaveCount(1);
  await expect(page.locator('.memo-tab.foreign')).not.toHaveClass(/preview/);
});

test('memo tabs are remembered after a reload; a deleted memo’s tab drops out (spec §6.13, Review Focus 4)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await openApp(page, { memory: false });
  await importText(page, '春', '春风又绿江南岸。');
  await newStandaloneMemo(page, '甲');
  await page.getByTestId('memo-tab').filter({ hasText: '甲' }).dblclick();
  await newStandaloneMemo(page, '乙');
  await expect(memoTabs(page)).toHaveText(['甲', '乙']);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(memoTabs(page)).toHaveText(['甲', '乙']);
  await expect(memoTab(page, '乙')).toHaveClass(/preview/);
  // Deleted from the Memos page, not from its own tab: its tab drops out when the memo is found gone.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('section-memos-open').click();
  const row = page.getByTestId('memos-page').getByTestId('page-row').filter({ hasText: '乙' });
  await row.getByTestId('row-menu').click();
  await page.getByTestId('row-delete').click();
  await expect(page.getByTestId('memos-page').getByTestId('page-row').filter({ hasText: '乙' })).toHaveCount(0);
  await page.getByTestId('article-tab').getByRole('tab', { name: '春', exact: true }).click();
  await expect(memoTabs(page)).toHaveText(['甲']);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(memoTabs(page)).toHaveText(['甲']);
});

test('a kept memo tab of another article stays after a visit to that article (final review I2)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-title')).toHaveValue(/^Memo \d+$/);
  await page.getByTestId('memo-title').fill('甲');
  await page.getByTestId('memo-title').press('Enter');
  await newStandaloneMemo(page, '乙');
  await page.getByTestId('memo-tab').filter({ hasText: '乙' }).dblclick();
  await importText(page, '秋', '秋水共长天一色。');
  await page.getByTestId('memo-list-item').filter({ hasText: '甲' }).click();
  await page.getByTestId('memo-tab').filter({ hasText: '甲' }).dblclick();
  await expect(memoTabs(page)).toHaveText(['乙', '甲']);
  await fromSidebar(page, '春');
  await expect(page.getByTestId('article-title')).toHaveText('春');
  await page.getByTestId('memo-tab').filter({ hasText: '乙' }).click();
  await fromSidebar(page, '秋');
  await expect(page.getByTestId('article-title')).toHaveText('秋');
  await expect(memoTabs(page)).toHaveText(['乙', '甲']);
});

test('Enter on the active preview tab keeps it, and a screen reader hears that a tab is the preview (final review I4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  const button = tab(page, '春').getByRole('tab');
  await expect(button).toHaveAccessibleDescription(/preview/i);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(tab(page, '春')).not.toHaveClass(/preview/);
  await expect(button).not.toHaveAccessibleDescription(/preview/i);
  await newStandaloneMemo(page, '甲');
  const memoButton = page.getByTestId('memo-tab').filter({ hasText: '甲' });
  await expect(memoButton).toHaveAccessibleDescription(/preview/i);
  await memoButton.focus();
  await page.keyboard.press('Enter');
  await expect(memoTab(page, '甲')).not.toHaveClass(/preview/);
});

