import { expect, test, type Locator, type Page } from '@playwright/test';
import { deleteArticle, importText, openApp } from './helpers';

const tagRow = (page: Page, name: string) => page.locator(`[role="treeitem"] > [data-testid="tag-row"][data-tag="${name}"]`);

async function newTag(page: Page, name: string) {
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill(name);
  await page.getByTestId('tag-name-input').press('Enter');
  await expect(tagRow(page, name).first()).toBeVisible();
}

/** Where an element's text starts: its left edge plus its left padding. */
const textStart = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));

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
  // Compare where text starts, not box edges.
  const input = page.getByTestId('tag-name-input');
  const inputText = await input.evaluate(
    (el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).borderLeftWidth),
  );
  expect(Math.abs(inputText - (await textStart(page.getByTestId('tag-name').first())))).toBeLessThanOrEqual(2);
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
  const link = await textStart(page.getByTestId('library-list').getByRole('link').first());
  const empty = page.getByTestId('memo-list-empty');
  expect(Math.abs((await textStart(empty)) - link)).toBeLessThanOrEqual(1);
  expect(await empty.evaluate((el) => getComputedStyle(el).fontSize)).toBe('13px');
  expect(Math.abs((await textStart(page.getByTestId('tag-name').first())) - link)).toBeLessThanOrEqual(1);
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

test('every sidebar row has the same hover background, equally inset on both sides (spec §6.12, Review Focus 1)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春风又绿江南岸：一个很长很长的标题，长到要在侧栏里用省略号收尾才行', '春风又绿江南岸。');
  await importText(page, 'Spring', 'Spring is here.');
  await page.getByTestId('memo-new').click();
  await newTag(page, '技巧');
  const nav = page.locator('nav.sidebar');
  const inner = await nav.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.left + el.clientWidth };
  });
  const plain = page.getByTestId('library-list').locator('li:not(.active)');
  const rows = [page.getByTestId('section-library'), plain, page.getByTestId('memo-list-item').first(), page.getByTestId('tag-row').first()];
  const colors = new Set<string>();
  for (const row of rows) {
    await row.hover();
    const box = await row.boundingBox();
    const left = (box?.x ?? 0) - inner.left;
    const right = inner.right - ((box?.x ?? 0) + (box?.width ?? 0));
    expect(Math.abs(left - right), await row.evaluate((el) => el.className)).toBeLessThanOrEqual(1);
    const bg = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    colors.add(bg);
  }
  expect(colors.size).toBe(1);
  // The long title ends in an ellipsis inside its row.
  expect(await plain.getByRole('link').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  // The open article keeps a stronger background in the same shape.
  await page.mouse.move(700, 400);
  const active = page.getByTestId('library-list').locator('li.active');
  const a = await active.boundingBox();
  expect(Math.abs((a?.x ?? 0) - inner.left - (inner.right - ((a?.x ?? 0) + (a?.width ?? 0))))).toBeLessThanOrEqual(1);
  expect(await active.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe([...colors][0]);
});

test('items start where the heading text starts; a top-level tag’s arrow hangs just left of its name (spec §6.12)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await newTag(page, '技巧');
  await newTag(page, '修辞');
  await tagRow(page, '修辞').dragTo(tagRow(page, '技巧'));
  await expect(page.locator('[role="treeitem"][aria-level="2"]')).toHaveCount(1);
  const heading = await page.getByTestId('section-library-open').evaluate((el) => el.getBoundingClientRect().left);
  const near = (x: number, target: number) => expect(Math.abs(x - target)).toBeLessThanOrEqual(1);
  near(await textStart(page.getByTestId('library-list').getByRole('link').first()), heading);
  near(await textStart(page.getByTestId('memo-list-item').first()), heading);
  const top = page.locator('[role="treeitem"][aria-level="1"] > [data-testid="tag-row"]');
  near(await textStart(top.getByTestId('tag-name')), heading);
  near(await textStart(page.locator('[role="treeitem"][aria-level="2"] > [data-testid="tag-row"]').getByTestId('tag-name')), heading + 14);
  const arrow = await top.locator('button.tag-toggle').boundingBox();
  const fold = await page.getByTestId('section-tags-fold').boundingBox();
  near((arrow?.x ?? 0) + (arrow?.width ?? 0) / 2, (fold?.x ?? 0) + (fold?.width ?? 0) / 2);
  expect((arrow?.x ?? 0) + (arrow?.width ?? 0)).toBeLessThanOrEqual(heading + 0.5);
});
