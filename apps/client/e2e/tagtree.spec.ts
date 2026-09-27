import { expect, test, type Page } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

/** The row of tag `name`, optionally only at tree level `level` (1 = top). */
const row = (page: Page, name: string, level?: number) =>
  page.locator(`[role="treeitem"]${level ? `[aria-level="${level}"]` : ''} > [data-testid="tag-row"][data-tag="${name}"]`);

async function newTag(page: Page, name: string) {
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill(name);
  await page.getByTestId('tag-name-input').press('Enter');
  await expect(row(page, name).first()).toBeVisible();
}

async function menu(page: Page, name: string, item: string) {
  await row(page, name).first().getByTestId('tag-menu').click();
  await page.getByTestId(item).click();
}

async function addParentByMenu(page: Page, child: string, parent: string) {
  await menu(page, child, 'tag-add-parent');
  await page.getByTestId('tag-input').fill(parent);
  await page.getByTestId('tag-input').press('Enter');
}

test('arranges tags by dragging; Alt-drag adds a second parent (spec §6.4)', async ({ page }) => {
  await openApp(page);
  for (const name of ['技巧', '修辞', '比喻', '意象']) await newTag(page, name);
  await row(page, '修辞').dragTo(row(page, '技巧'));
  await expect(row(page, '修辞', 2)).toBeVisible();
  await row(page, '比喻').dragTo(row(page, '修辞'));
  await expect(row(page, '比喻', 3)).toBeVisible();
  await page.keyboard.down('Alt');
  await row(page, '比喻').dragTo(row(page, '意象'));
  await page.keyboard.up('Alt');
  await expect(row(page, '比喻')).toHaveCount(2);
  await expect(row(page, '比喻', 3)).toHaveCount(1);
  await expect(row(page, '比喻', 2)).toHaveCount(1);
});

test('refuses to put a tag under its own subtag, and never offers one as a parent (Review Focus 4)', async ({ page }) => {
  await openApp(page);
  await newTag(page, '技巧');
  await newTag(page, '修辞');
  await addParentByMenu(page, '修辞', '技巧');
  await expect(row(page, '修辞', 2)).toBeVisible();
  await row(page, '技巧').dragTo(row(page, '修辞'));
  await expect(page.getByTestId('error-banner')).toContainText('can’t go under itself');
  await expect(row(page, '技巧', 1)).toBeVisible();
  await expect(row(page, '修辞', 2)).toBeVisible();
  await menu(page, '技巧', 'tag-add-parent');
  await page.getByTestId('tag-input').fill('修辞');
  await expect(page.getByTestId('tag-option')).toHaveCount(0);
  await expect(page.getByTestId('tag-create')).toHaveCount(0);
});

test('takes a tag out of its parent, renames, and deleting a parent keeps its subtags', async ({ page }) => {
  await openApp(page);
  for (const name of ['技巧', '修辞', '比喻']) await newTag(page, name);
  await addParentByMenu(page, '修辞', '技巧');
  await addParentByMenu(page, '比喻', '技巧');
  await expect(row(page, '修辞', 2)).toBeVisible();
  await menu(page, '修辞', 'tag-remove-from');
  await expect(row(page, '修辞', 1)).toBeVisible();
  await menu(page, '技巧', 'tag-rename');
  await page.getByTestId('tag-rename-input').fill('手法');
  await page.getByTestId('tag-rename-input').press('Enter');
  await expect(row(page, '手法', 1)).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await menu(page, '手法', 'tag-delete');
  await expect(row(page, '手法')).toHaveCount(0);
  await expect(row(page, '比喻', 1)).toBeVisible();
});

test('finds a side note by tag 技巧 and the query 比喻, and the inherit toggle (spec §10 step 4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春日', '春风又绿江南岸。他用比喻写春天，比喻很生动。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await selectText(page, '春风');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('这里的比喻很妙');
  for (const name of ['技巧', '修辞', '比喻', '意象']) await newTag(page, name);
  await addParentByMenu(page, '修辞', '技巧');
  await addParentByMenu(page, '比喻', '修辞');
  await addParentByMenu(page, '比喻', '意象');
  await expect(row(page, '比喻')).toHaveCount(2);
  await addTag(page, 'note-tags', '比喻');
  await addTag(page, 'article-tags', '修辞');
  await row(page, '技巧').getByTestId('tag-name').click();
  await expect(page.getByTestId('search-tag')).toHaveText(['技巧']);
  await expect(page.getByTestId('search-result')).toHaveCount(2);
  await page.getByTestId('search-input').fill('比喻');
  await expect(page.locator('[data-testid="search-result"][data-entity-type="side_note"]')).toHaveCount(1);
  await expect(page.getByTestId('search-result')).toHaveCount(2);
  await page.getByTestId('search-inherit').check();
  await expect(page.getByTestId('search-result')).toHaveCount(3);
  await expect(page.locator('[data-testid="search-result"][data-entity-type="markup"]')).toHaveCount(1);
});
