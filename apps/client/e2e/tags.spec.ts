import { expect, test, type Page } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

const chipsIn = (page: Page, area: string) => page.getByTestId(area).getByTestId('tag-chip');

async function setup(page: Page, memory = true) {
  await openApp(page, { memory });
  await importText(page, '标签', '春风又绿江南岸。他用比喻写春天。');
}

test('tags an article, a highlight, a side note and a memo', async ({ page }) => {
  await setup(page);
  await addTag(page, 'article-tags', '写景');
  await expect(chipsIn(page, 'article-tags')).toHaveText(['写景']);

  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await page.locator('.mk-highlight').click();
  await addTag(page, 'markup-tags', '修辞');
  await expect(chipsIn(page, 'markup-tags')).toHaveText(['修辞']);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('markup-popover')).toHaveCount(0);

  await selectText(page, '春风');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await addTag(page, 'note-tags', '写景');
  await expect(chipsIn(page, 'note-tags')).toHaveText(['写景']);

  await page.getByTestId('memo-new').click();
  await addTag(page, 'memo-tags', '结构');
  await expect(chipsIn(page, 'memo-tags')).toHaveText(['结构']);
  await expect(page.getByTestId('error-banner')).toHaveCount(0);
});

test('reuses a tag whose name differs only by case or width (Review Focus 3)', async ({ page }) => {
  await setup(page);
  await addTag(page, 'article-tags', 'Craft');
  await expect(chipsIn(page, 'article-tags')).toHaveText(['Craft']);
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-tags').getByTestId('tag-add').click();
  await page.getByTestId('tag-input').fill('ＣＲＡＦＴ');
  await expect(page.getByTestId('tag-create')).toHaveCount(0);
  await page.getByTestId('tag-input').press('Enter');
  await expect(chipsIn(page, 'memo-tags')).toHaveText(['Craft']);
  await expect(page.getByTestId('error-banner')).toHaveCount(0);
});

test('removes a tag from an item', async ({ page }) => {
  await setup(page);
  await addTag(page, 'article-tags', '写景');
  await addTag(page, 'article-tags', '抒情');
  await expect(chipsIn(page, 'article-tags')).toHaveText(['写景', '抒情']);
  await page.getByRole('button', { name: 'Remove tag “写景”' }).click();
  await expect(chipsIn(page, 'article-tags')).toHaveText(['抒情']);
});

test('Escape closes the tag picker but keeps the markup menu open', async ({ page }) => {
  await setup(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await page.locator('.mk-highlight').click();
  await page.getByTestId('markup-tags').getByTestId('tag-add').click();
  await page.getByTestId('tag-input').press('Escape');
  await expect(page.getByTestId('tag-input')).toHaveCount(0);
  await expect(page.getByTestId('markup-popover')).toBeVisible();
});

test('keeps tags after a reload', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await addTag(page, 'article-tags', '写景');
  await expect(chipsIn(page, 'article-tags')).toHaveText(['写景']);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(chipsIn(page, 'article-tags')).toHaveText(['写景'], { timeout: 30_000 });
});

test('tags a new side note before anything is written in it', async ({ page }) => {
  await setup(page);
  await selectText(page, '春风');
  await page.getByTestId('toolbar-note').click();
  await addTag(page, 'note-tags', '写景');
  await expect(page.getByTestId('side-note')).toHaveCount(1);
  await expect(chipsIn(page, 'note-tags')).toHaveText(['写景']);
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await page.getByTestId('article-title').click();
  await expect(page.getByTestId('side-note')).toHaveCount(1);
});
