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
