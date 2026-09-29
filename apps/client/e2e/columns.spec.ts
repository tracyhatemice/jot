import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

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

/** 1100 px with the sidebar open: an article column of 556 px, so side notes are icons and the memo column is docked. */
const ICONS = { width: 1100, height: 720 };

/** Marks up `needle` with a side note and types `text` into it, once the new note's box has the focus. */
async function noteOn(page: Page, needle: string, text: string) {
  await selectText(page, needle);
  await page.getByTestId('toolbar-note').click();
  await expect(page.locator('[data-testid="side-note"] textarea:focus')).toHaveCount(1);
  await page.keyboard.insertText(text);
}

test('in a narrower window side notes turn into icons after their passages; an icon opens its notes in a card (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸，明月何时照我还。');
  await noteOn(page, '明月', '以景起兴');
  await page.getByTestId('article-title').click();
  await page.setViewportSize(ICONS);
  await expect(page.getByTestId('margin')).toHaveCount(0);
  const icon = page.getByTestId('article-view').locator('.note-icon');
  await expect(icon).toHaveCount(1);
  const mark = await page.getByTestId('article-view').locator('.mk-highlight').last().boundingBox();
  const at = await icon.boundingBox();
  expect(Math.abs((at?.x ?? 0) - ((mark?.x ?? 0) + (mark?.width ?? 0)))).toBeLessThan(6);
  await icon.click();
  const card = page.getByTestId('note-float');
  await expect(card.getByTestId('side-note').locator('textarea')).toHaveValue('以景起兴');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await icon.click();
  await expect(card).toBeVisible();
  await icon.click();
  await expect(card).toHaveCount(0);
  await icon.click();
  await page.getByTestId('article-title').click();
  await expect(card).toHaveCount(0);
});

test('adding a side note while notes are icons opens its card, ready to type (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await page.setViewportSize(ICONS);
  await importText(page, '春', '春风又绿江南岸，明月何时照我还。');
  await noteOn(page, '春风', '比兴');
  const card = page.getByTestId('note-float');
  await expect(card.locator('textarea')).toHaveValue('比兴');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await page.getByTestId('article-view').locator('.note-icon').click();
  await expect(card.locator('textarea')).toHaveValue('比兴');
});

test('a side note being typed when the window narrows keeps its text, now under its icon (Review Focus 3)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸，明月何时照我还。');
  await noteOn(page, '明月', '未完的');
  await page.setViewportSize(ICONS);
  await page.getByTestId('article-view').locator('.note-icon').click();
  await expect(page.getByTestId('note-float').locator('textarea')).toHaveValue('未完的');
});
