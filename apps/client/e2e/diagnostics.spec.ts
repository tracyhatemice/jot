import { expect, test } from '@playwright/test';

const READY = { timeout: 30_000 };

test.skip(({ browserName }) => browserName === 'webkit', 'OPFS unavailable in ephemeral Playwright WebKit contexts; Safari OPFS is still unverified (open risk from spec M0.2)');

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(await page.locator('body').innerText());
});

test('the OPFS driver passes every conformance case', async ({ page }) => {
  await page.goto('/#/diagnostics');
  await expect(page.getByTestId('diag-status')).toHaveText('ok', READY);
  await expect(page.getByTestId('platform')).toHaveText('web');
  await expect(page.getByTestId('diag-case')).toHaveCount(8);
});

test('library data survives a reload', async ({ page }) => {
  await page.goto('/#/diagnostics');
  await expect(page.getByTestId('diag-status')).toHaveText('ok', READY);
  const first = Number(await page.getByTestId('boot-count').textContent());
  await page.reload();
  await expect(page.getByTestId('diag-status')).toHaveText('ok', READY);
  await expect(page.getByTestId('boot-count')).toHaveText(String(first + 1));
});

test('a second tab is told the library is open elsewhere', async ({ page, context }) => {
  await page.goto('/#/diagnostics');
  await expect(page.getByTestId('diag-status')).toHaveText('ok', READY);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByTestId('db-locked')).toBeVisible(READY);
});
