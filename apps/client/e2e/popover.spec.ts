import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

async function setup(page: Page) {
  await openApp(page);
  await importText(page, '弹窗', '春风又绿江南岸，明月何时照我还。他用比喻写春天。');
}

async function term(page: Page, needle: string) {
  await selectText(page, needle);
  await page.getByTestId('toolbar-highlight').click();
}

test('removes a markup from its popover', async ({ page }) => {
  await setup(page);
  await term(page, '比喻');
  await page.locator('.mk-highlight').click();
  await expect(page.getByTestId('popover-item')).toHaveCount(1);
  await page.getByTestId('popover-remove').click();
  await expect(page.locator('.mk-highlight')).toHaveCount(0);
  await expect(page.getByTestId('markup-popover')).toHaveCount(0);
});

test('offers every markup under an overlapping click (Review Focus 3)', async ({ page }) => {
  await setup(page);
  await term(page, '春风又绿');
  await term(page, '绿江南');
  await page.locator('.mk-highlight').filter({ hasText: /^绿$/ }).click();
  await expect(page.getByTestId('popover-item')).toHaveCount(2);
});

test('adds a side note from the popover', async ({ page }) => {
  await setup(page);
  await term(page, '比喻');
  await page.locator('.mk-highlight').click();
  await page.getByTestId('popover-add-note').click();
  await expect(page.getByTestId('side-note').locator('textarea')).toBeFocused();
});

test('closes on Escape and on a click in plain text', async ({ page }) => {
  await setup(page);
  await term(page, '比喻');
  await page.locator('.mk-highlight').click();
  await expect(page.getByTestId('markup-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('markup-popover')).toHaveCount(0);
  await page.locator('.mk-highlight').click();
  await expect(page.getByTestId('markup-popover')).toBeVisible();
  await page.getByTestId('article-title').click();
  await page.locator('[data-testid="article-view"] p').click({ position: { x: 4, y: 10 } });
  await expect(page.getByTestId('markup-popover')).toHaveCount(0);
});
