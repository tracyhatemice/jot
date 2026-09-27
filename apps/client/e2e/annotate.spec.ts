import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

const TEXT = ['春风又绿江南岸，明月何时照我还。他用比喻写春天。', '她笑😀了。第二句在这里。', '第三段只有一句话。'].join('\n\n');

async function setup(page: Page, memory = true) {
  await openApp(page, { memory });
  await importText(page, '标注', TEXT);
}

test('marks a term, a line and a paragraph', async ({ page }) => {
  await setup(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-term').click();
  await expect(page.locator('.mk-term')).toHaveText('比喻');
  await selectText(page, '第二句');
  await page.getByTestId('toolbar-line').click();
  await expect(page.locator('.mk-line')).toHaveText('第二句在这里。');
  await selectText(page, '只有');
  await page.getByTestId('toolbar-paragraph').click();
  await expect(page.locator('.mk-paragraph')).toHaveText('第三段只有一句话。');
});

test('renders overlapping markups and emoji (Review Focus 3)', async ({ page }) => {
  await setup(page);
  await selectText(page, '春风又绿');
  await page.getByTestId('toolbar-term').click();
  await selectText(page, '绿江南');
  await page.getByTestId('toolbar-term').click();
  const overlap = page.locator('.mk-term').filter({ hasText: /^绿$/ });
  await expect(overlap).toHaveCount(1);
  expect(((await overlap.getAttribute('class')) ?? '').match(/mk-id-/g)).toHaveLength(2);
  await selectText(page, '😀');
  await page.getByTestId('toolbar-term').click();
  await expect(page.locator('.mk-term').filter({ hasText: '😀' })).toHaveText('😀');
});

test('ignores collapsed selections and ones that reach outside the article (Review Focus 2)', async ({ page }) => {
  await setup(page);
  await page.getByTestId('article-view').click();
  await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
  await page.evaluate(() => {
    const title = document.querySelector('[data-testid="library-list"] a')?.firstChild as Node;
    const view = document.querySelector('[data-testid="article-view"]') as Element;
    const text = document.createTreeWalker(view, NodeFilter.SHOW_TEXT).nextNode() as Node;
    const range = document.createRange();
    range.setStart(title, 0);
    range.setEnd(text, 3);
    const selection = window.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
    view.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
});

test('selects text with a real mouse drag in the read-only view (risk check M0.3)', async ({ page }) => {
  await setup(page);
  const box = await page.locator('[data-testid="article-view"] p').first().boundingBox();
  if (!box) throw new Error('paragraph not rendered');
  await page.mouse.move(box.x + 2, box.y + 17);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 17, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('selection-toolbar')).toBeVisible();
  await page.getByTestId('toolbar-term').click();
  await expect(page.locator('.mk-term')).toHaveCount(1);
  expect(((await page.locator('.mk-term').textContent()) ?? '').length).toBeGreaterThan(1);
});

test('keeps markups after a reload', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-term').click();
  await expect(page.locator('.mk-term')).toHaveText('比喻');
  await page.reload();
  await expect(page.locator('.mk-term')).toHaveText('比喻', { timeout: 30_000 });
});
