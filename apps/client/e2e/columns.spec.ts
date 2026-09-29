import { expect, test, type Page } from '@playwright/test';
import { importText, openApp } from './helpers';

/** The memo column's share of the space right of the sidebar, and the side-note column's share of the article column. */
const shares = (page: Page) =>
  page.evaluate(() => {
    const width = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().width ?? 0;
    const space = width('[data-testid="shell"]') - width('nav.sidebar') - 6;
    return { memo: width('aside.memo') / space, notes: width('[data-testid="margin"]') / width('main.reader'), memoWidth: width('aside.memo'), reader: width('main.reader') };
  });

async function drag(page: Page, dx: number) {
  const handle = await page.getByTestId('memo-splitter').boundingBox();
  if (!handle) throw new Error('splitter not rendered');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + dx, handle.y + 100, { steps: 5 });
  await page.mouse.up();
}

test('the article, side-note and memo columns keep their proportions as the window and the sidebar change (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  const at1280 = await shares(page);
  expect(at1280.memo).toBeCloseTo(1 / 3, 2);
  expect(at1280.notes).toBeCloseTo(0.36, 2);
  await page.setViewportSize({ width: 1600, height: 800 });
  await expect.poll(async () => (await shares(page)).memo).toBeCloseTo(1 / 3, 2);
  expect((await shares(page)).notes).toBeCloseTo(0.36, 2);
  await page.getByTestId('sidebar-toggle').click();
  await expect.poll(async () => (await shares(page)).memo).toBeCloseTo(1 / 3, 2);
  expect((await shares(page)).notes).toBeCloseTo(0.36, 2);
});

test('dragging the divider sets the memo column’s share, which the next resize keeps (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  const before = (await shares(page)).memo;
  await drag(page, -150);
  const dragged = (await shares(page)).memo;
  expect(dragged).toBeGreaterThan(before + 0.1);
  await page.setViewportSize({ width: 1500, height: 800 });
  await expect.poll(async () => (await shares(page)).memo).toBeCloseTo(dragged, 2);
});

test('the divider can’t narrow the article column below 400 px, so a drag never makes the memo column float (Review Focus 5)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await drag(page, -900);
  const after = await shares(page);
  expect(after.reader).toBeGreaterThanOrEqual(399.5);
  await expect(page.getByTestId('memo-splitter')).toBeVisible();
});

test('a memo width saved before this round becomes a share; below its share the memo column keeps 240 px (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('jot.memoWidth', '400'));
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await importText(page, '春', '春风又绿江南岸。');
  expect(Math.abs((await shares(page)).memoWidth - 400)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => localStorage.getItem('jot.memoWidth'))).toBeNull();
  await page.evaluate(() => localStorage.setItem('jot.memoShare', '0.1'));
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await importText(page, '秋', '秋水共长天一色。');
  expect((await shares(page)).memoWidth).toBeCloseTo(240, 0);
});
