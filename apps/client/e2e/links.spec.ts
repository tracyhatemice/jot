import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

const TEXT = '春风又绿江南岸，明月何时照我还。他用比喻写春天。';

async function setup(page: Page, memory = true) {
  await openApp(page, { memory });
  await importText(page, '链接', TEXT);
}

const chips = (page: Page) => page.getByTestId('memo-editor').locator('.anchor-chip');

test('quotes a selection into a new memo as a link chip', async ({ page }) => {
  await setup(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  await expect(chips(page)).toHaveText(['比喻']);
  await expect(page.getByTestId('memo-tab')).toHaveCount(1);
});

test('links a highlight and a side note from their menus', async ({ page }) => {
  await setup(page);
  await selectText(page, '春风');
  await page.getByTestId('toolbar-highlight').click();
  await page.locator('.mk-highlight').click();
  await page.getByTestId('popover-link').click();
  await expect(chips(page)).toHaveText(['春风']);
  await selectText(page, '明月');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以月寄情');
  await page.getByTestId('note-link').click();
  await expect(chips(page)).toHaveText(['春风', '以月寄情']);
});

test('keeps link chips after a reload', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  await expect(chips(page)).toHaveText(['比喻']);
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(chips(page)).toHaveText(['比喻'], { timeout: 30_000 });
});
