import { expect, test, type Page } from '@playwright/test';
import { addTag, deleteArticle, importText, openApp, selectText } from './helpers';

/** Opens a page without a reload (the in-memory library would be lost). */
const goTo = (page: Page, hash: string) => page.evaluate((h) => (window.location.hash = h), hash);

test('the Library page lists articles; its row menu edits details and deletes; a row opens the article', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await importText(page, '秋', '秋水共长天一色。');
  await goTo(page, '#/library');
  const rows = page.getByTestId('library-page').getByTestId('page-row');
  await expect(rows).toHaveCount(2);
  const spring = rows.filter({ hasText: '春' });
  await spring.getByTestId('row-menu').click();
  await spring.getByTestId('row-edit').click();
  await page.getByTestId('details-author').fill('佚名');
  await page.getByTestId('details-save').click();
  await expect(spring).toContainText('佚名');
  await rows.filter({ hasText: '秋' }).getByTestId('row-menu').click();
  await rows.filter({ hasText: '秋' }).getByTestId('row-delete').click();
  await expect(rows).toHaveCount(1);
  await spring.getByTestId('row-main').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
});

test('the Memos page shows each memo’s article; a row opens the memo with its article, and moves it', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await importText(page, '秋', '秋水共长天一色。');
  await goTo(page, '#/memos');
  const row = page.getByTestId('memos-page').getByTestId('page-row');
  await expect(row).toContainText('春');
  await row.getByTestId('row-menu').click();
  await row.getByTestId('row-move').click();
  await page.getByTestId('picker-search').fill('秋');
  await page.getByTestId('picker-item').click();
  await expect(row).toContainText('秋');
  await row.getByTestId('row-main').click();
  await expect(page.getByTestId('article-title')).toHaveText('秋');
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
});

test('the Tags page shows paths and counts; a row searches the tag; its menu renames and deletes', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await addTag(page, 'note-tags', '修辞');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
  await goTo(page, '#/tags');
  const row = page.getByTestId('tags-page').getByTestId('page-row');
  await expect(row).toContainText('修辞');
  await expect(row).toContainText('1');
  await row.getByTestId('row-main').click();
  await expect(page.getByTestId('search-tag')).toHaveText(['修辞']);
  await page.getByTestId('search-clear').click();
  await row.getByTestId('row-menu').click();
  await row.getByTestId('row-rename').click();
  await page.getByTestId('tag-rename-input').fill('修辞手法');
  await page.getByTestId('tag-rename-input').press('Enter');
  await expect(row).toContainText('修辞手法');
  await row.getByTestId('row-menu').click();
  await row.getByTestId('row-delete').click();
  await expect(row).toHaveCount(0);
});

test('the memo column shows only with an article or a memo open; the Trash takes the full width', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('memo-pane')).toBeHidden();
  await importText(page, '春', '春风又绿江南岸。');
  await expect(page.getByTestId('memo-pane')).toBeVisible();
  await page.getByTestId('trash-open').click();
  await expect(page.getByTestId('memo-pane')).toBeHidden();
  const reader = await page.locator('main.reader').boundingBox();
  const shell = await page.getByTestId('shell').boundingBox();
  const sidebar = await page.locator('nav.sidebar').boundingBox();
  expect(Math.round((reader?.width ?? 0) + (sidebar?.width ?? 0))).toBeGreaterThanOrEqual(Math.round((shell?.width ?? 0) - 2));
});

test('leaving an article with a memo for a page leaves the memo column behind; opening a memo there brings it (review)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-pane')).toBeVisible();
  await goTo(page, '#/library');
  await expect(page.getByTestId('memo-pane')).toBeHidden();
  await goTo(page, '#/trash');
  await expect(page.getByTestId('memo-pane')).toBeHidden();
  await deleteArticle(page, '春');
  await expect(page.getByTestId('memo-pane')).toBeHidden();
  await page.getByTestId('memo-list-item').click();
  await expect(page.getByTestId('memo-pane')).toBeVisible();
});

test('a page opens at its top, not at the scroll position of the article before (review of plan 8)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', Array.from({ length: 80 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n'));
  const reader = page.locator('main.reader');
  await reader.evaluate((el) => el.scrollBy(0, 1500));
  await goTo(page, '#/library');
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBe(0);
});
