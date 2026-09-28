import { expect, test } from '@playwright/test';
import { deleteArticle, importText, openApp } from './helpers';

test('sections fold and remember it; their headings open the section pages', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('section-library-fold').click();
  await expect(page.getByTestId('library-list')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('library-list')).toHaveCount(0);
  await page.getByTestId('section-library-fold').click();
  // Unfolded again; the in-memory library is empty after the reload.
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await page.getByTestId('section-memos-open').click();
  await expect(page.getByTestId('memos-page')).toBeVisible();
  await page.getByTestId('section-tags-open').click();
  await expect(page.getByTestId('tags-page')).toBeVisible();
  await page.getByTestId('section-library-open').click();
  await expect(page.getByTestId('library-page')).toBeVisible();
});

test('Library + imports; article rows have no delete button; the Trash button shows no count', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.sidebar > header').getByTestId('import-open')).toHaveCount(0);
  await expect(page.getByTestId('section-library').getByTestId('import-open')).toBeVisible();
  await importText(page, '春', '春风又绿江南岸。');
  await expect(page.getByTestId('library-list').getByRole('button')).toHaveCount(0);
  page.once('dialog', (dialog) => void dialog.accept());
  await deleteArticle(page, '春');
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('trash-open')).toBeVisible();
  await expect(page.getByTestId('trash-count')).toHaveCount(0);
});

test('the new-tag input lines up with the tag names', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill('技巧');
  await page.getByTestId('tag-name-input').press('Enter');
  await page.getByTestId('tag-new').click();
  const input = await page.getByTestId('tag-name-input').boundingBox();
  const name = await page.getByTestId('tag-name').first().boundingBox();
  expect(Math.abs((input?.x ?? 0) - (name?.x ?? 100))).toBeLessThanOrEqual(2);
});

test('the Tags + unfolds the section to create a tag (review)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('section-tags-fold').click();
  await page.getByTestId('tag-new').click();
  await expect(page.getByTestId('tag-name-input')).toBeVisible();
});

test('empty sections read as quietly as items, and tag names line up with article titles (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill('技巧');
  await page.getByTestId('tag-name-input').press('Enter');
  const link = await page.getByTestId('library-list').getByRole('link').first().boundingBox();
  const empty = page.getByTestId('memo-list-empty');
  expect(Math.abs(((await empty.boundingBox())?.x ?? 0) - (link?.x ?? 99))).toBeLessThanOrEqual(1);
  expect(await empty.evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).fontSize])).toEqual(['8px', '13px']);
  const tag = page.getByTestId('tag-name').first();
  expect(Math.abs(((await tag.boundingBox())?.x ?? 0) - (link?.x ?? 99))).toBeLessThanOrEqual(1);
  expect(await tag.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('8px');
});

test('Memos + creates a standalone memo and opens it (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('memo-standalone-new').click();
  await expect(page.getByTestId('memo-pane')).toBeVisible();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
  await expect(page.getByTestId('memo-list-item')).toContainText('No article');
});

test('standalone memos are numbered among themselves, and a double click on either + makes one memo (review M7)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-list-item')).toHaveCount(2);
  await page.getByTestId('memo-standalone-new').dblclick();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('memo-list-item')).toHaveCount(3);
  await page.getByTestId('memo-standalone-new').click();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 2');
  await page.getByTestId('memo-new').dblclick();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('memo-list-item')).toHaveCount(5);
});

test('folded sections at the end stack at the bottom; a folded middle section stays in place (Review Focus 3)', async ({ page }) => {
  await openApp(page);
  const box = (id: string) => page.getByTestId(id).boundingBox();
  const footerTop = async () => (await page.locator('.sidebar footer').boundingBox())?.y ?? 0;
  await page.getByTestId('section-tags-fold').click();
  let tags = await box('section-tags');
  expect((await footerTop()) - ((tags?.y ?? 0) + (tags?.height ?? 0))).toBeLessThan(24);
  await page.getByTestId('section-memos-fold').click();
  const memos = await box('section-memos');
  tags = await box('section-tags');
  expect((tags?.y ?? 0) - ((memos?.y ?? 0) + (memos?.height ?? 0))).toBeLessThan(24);
  expect((await footerTop()) - ((tags?.y ?? 0) + (tags?.height ?? 0))).toBeLessThan(24);
  await page.getByTestId('section-tags-fold').click();
  const library = await box('section-library');
  const middle = await box('section-memos');
  expect((middle?.y ?? 999) - ((library?.y ?? 0) + (library?.height ?? 0))).toBeLessThan(80);
});
