import { expect, test, type Page } from '@playwright/test';
import { importText, openApp } from './helpers';

async function setup(page: Page, memory = true) {
  await openApp(page, { memory });
  await importText(page, '札记测试', '春风又绿江南岸，明月何时照我还。');
}

async function newMemo(page: Page) {
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
}

test('creates a memo and types Chinese and English into it (risk check M0.4)', async ({ page }) => {
  await setup(page);
  await expect(page.getByTestId('memo-empty')).toBeVisible();
  await newMemo(page);
  await page.keyboard.insertText('开头写景，');
  await page.keyboard.type('then feeling.');
  await expect(page.getByTestId('memo-editor')).toContainText('开头写景，then feeling.');
  await expect(page.getByTestId('memo-tab')).toHaveCount(1);
});

test('undo removes only the latest typing', async ({ page }) => {
  // Yjs groups undo steps by Date.now(); the page clock keeps time moving forward even if the
  // machine's wall clock is stepped back (WSL2 does this under load), which would merge the steps.
  await page.clock.install();
  await setup(page);
  await newMemo(page);
  await page.keyboard.insertText('保留');
  await page.waitForTimeout(700); // Yjs groups edits closer than 500 ms into one undo step
  await page.keyboard.insertText('删掉');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('memo-editor')).toContainText('保留');
  await expect(page.getByTestId('memo-editor')).not.toContainText('删掉');
});

test('keeps memo text across a reload, and Undo after the reload keeps it (Review Focus 1)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await newMemo(page);
  await page.keyboard.insertText('先写景，后抒情。');
  await page.waitForTimeout(1_000);
  await page.reload();
  const editor = page.getByTestId('memo-editor');
  await expect(editor).toContainText('先写景，后抒情。', { timeout: 30_000 });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).toContainText('先写景，后抒情。');
});

test('renames, switches between and deletes memos', async ({ page }) => {
  await setup(page);
  await newMemo(page);
  await page.keyboard.insertText('第一篇');
  await page.getByTestId('memo-title').fill('结构');
  await page.getByTestId('memo-title').press('Enter');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(2);
  await page.getByTestId('memo-tab').filter({ hasText: '结构' }).click();
  await expect(page.getByTestId('memo-editor')).toContainText('第一篇');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('memo-delete').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(1);
  await expect(page.getByTestId('memo-tab')).not.toContainText('结构');
});

test('keeps text typed right before a reload (Review Focus 1)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await newMemo(page);
  await page.keyboard.insertText('先写景，');
  await page.waitForTimeout(1_000);
  await page.keyboard.insertText('刚打的字');
  await page.reload();
  await expect(page.getByTestId('memo-editor')).toContainText('先写景，刚打的字', { timeout: 30_000 });
});

test('memo headings get smaller from level 1 to level 4, and the column heading keeps its size', async ({ page }) => {
  await setup(page);
  await newMemo(page);
  for (const [marks, text] of [['#', '标题一'], ['##', '标题二'], ['###', '标题三'], ['####', '标题四']]) {
    await page.keyboard.type(`${marks} `);
    await page.keyboard.insertText(text);
    await page.keyboard.press('Enter');
  }
  const size = (selector: string) => page.locator(selector).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const [h1, h2, h3, h4] = [
    await size('[data-testid="memo-editor"] h1'),
    await size('[data-testid="memo-editor"] h2'),
    await size('[data-testid="memo-editor"] h3'),
    await size('[data-testid="memo-editor"] h4'),
  ];
  expect(h1).toBeGreaterThan(h2);
  expect(h2).toBeGreaterThan(h3);
  expect(h3).toBeGreaterThan(h4);
  expect(await size('.memo-header h2')).toBe(14);
});
