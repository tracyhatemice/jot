import { expect, test, type Page } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

const results = (page: Page) => page.getByTestId('search-result');

/** An article with a highlight on 比喻 and a side note (on 春风) that mentions 比喻. */
async function setup(page: Page) {
  await openApp(page);
  await importText(page, '春日', '春风又绿江南岸。他用比喻写春天，比喻很生动。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await selectText(page, '春风');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('这个比喻很妙');
}

test('finds articles, markups and side notes by 1- and 2-character Chinese queries, marking the match', async ({ page }) => {
  await setup(page);
  await page.getByTestId('search-input').fill('比喻');
  await expect(results(page)).toHaveCount(3);
  await expect(page.getByTestId('search-panel').locator('mark').first()).toHaveText('比喻');
  await page.getByTestId('search-input').fill('喻');
  await expect(results(page)).toHaveCount(3);
  await expect(page.getByTestId('search-panel').locator('mark').first()).toHaveText('喻');
});

test('filters by item type, and a markup result jumps to the passage', async ({ page }) => {
  await setup(page);
  await page.getByTestId('search-input').fill('比喻');
  await page.getByTestId('search-type-side_note').click();
  await expect(results(page)).toHaveCount(1);
  await expect(results(page)).toHaveAttribute('data-entity-type', 'side_note');
  await page.getByTestId('search-type-side_note').click();
  await page.getByTestId('search-type-markup').click();
  await expect(results(page)).toHaveCount(1);
  await results(page).click();
  await expect(page.locator('.flash')).toHaveText('比喻');
});

test('narrows by tag, and the inherit toggle adds items inside tagged articles (spec §10 step 4)', async ({ page }) => {
  await setup(page);
  await addTag(page, 'article-tags', '写景');
  await page.getByTestId('search-input').fill('比喻');
  await page.getByTestId('search-add-tag').click();
  await page.getByTestId('tag-input').fill('写景');
  await page.getByTestId('tag-input').press('Enter');
  await expect(page.getByTestId('search-tag')).toHaveText(['写景']);
  await expect(results(page)).toHaveCount(1);
  await expect(results(page)).toHaveAttribute('data-entity-type', 'article');
  await page.getByTestId('search-inherit').check();
  await expect(results(page)).toHaveCount(3);
});

test('opens a memo from its search result', async ({ page }) => {
  await setup(page);
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('比喻的用法');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(2);
  await page.getByTestId('search-input').fill('用法');
  await expect(results(page)).toHaveCount(1);
  await results(page).click();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
});

test('treats search syntax as plain text and ignores blank queries (Review Focus 1)', async ({ page }) => {
  await setup(page);
  await page.getByTestId('search-input').fill('") OR * NEAR(');
  await expect(page.getByTestId('search-empty')).toBeVisible();
  await page.getByTestId('search-input').fill('"比喻"');
  await expect(results(page)).toHaveCount(3);
  await page.getByTestId('search-input').fill('   ');
  await expect(page.getByTestId('library-list')).toBeVisible();
  await expect(page.getByTestId('error-banner')).toHaveCount(0);
});

test('results follow deletions (Review Focus 5)', async ({ page }) => {
  await setup(page);
  await page.getByTestId('search-input').fill('比喻');
  await expect(results(page)).toHaveCount(3);
  await page.locator('.mk-highlight', { hasText: '比喻' }).click();
  await page.getByTestId('popover-remove').click();
  await expect(results(page)).toHaveCount(2);
  await expect(page.locator('[data-testid="search-result"][data-entity-type="markup"]')).toHaveCount(0);
});

test('does not search input-method text that is still being composed (Review Focus 2)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'input-method composition is driven through the Chrome DevTools Protocol');
  await setup(page);
  await page.getByTestId('search-input').click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'bi', selectionStart: 2, selectionEnd: 2 });
  await expect(page.getByTestId('search-input')).toHaveValue('bi');
  await expect(page.getByTestId('library-list')).toBeVisible();
  await cdp.send('Input.insertText', { text: '比' });
  await expect(page.getByTestId('search-input')).toHaveValue('比');
  await expect(results(page)).toHaveCount(3);
});
