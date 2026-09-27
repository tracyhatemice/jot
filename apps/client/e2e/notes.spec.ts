import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

const TEXT = ['春风又绿江南岸，明月何时照我还。他用比喻写春天。', '第二段。'].join('\n\n');

async function setup(page: Page, memory = true) {
  await openApp(page, { memory });
  await importText(page, '旁注', TEXT);
}

async function addNote(page: Page, needle: string, body: string) {
  await selectText(page, needle);
  await page.getByTestId('toolbar-note').click();
  const area = page.getByTestId('side-note').last().locator('textarea');
  await expect(area).toBeFocused();
  await area.fill(body);
  await page.getByTestId('article-title').click();
}

test('adds a side note beside its markup and saves it on blur', async ({ page }) => {
  await setup(page);
  await addNote(page, '比喻', '以春喻人');
  const note = page.getByTestId('side-note');
  await expect(note).toHaveCount(1);
  await expect(note.locator('textarea')).toHaveValue('以春喻人');
  const markupBox = await page.locator('.mk-term').boundingBox();
  const noteBox = await note.boundingBox();
  expect(Math.abs((noteBox?.y ?? 0) - (markupBox?.y ?? 0))).toBeLessThan(40);
});

test('removes a note left empty but keeps its markup', async ({ page }) => {
  await setup(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await expect(page.getByTestId('side-note').locator('textarea')).toBeFocused();
  await page.getByTestId('article-title').click();
  await expect(page.getByTestId('side-note')).toHaveCount(0);
  await expect(page.locator('.mk-term')).toHaveCount(1);
});

test('stacks notes on the same line without overlapping', async ({ page }) => {
  await setup(page);
  await addNote(page, '春风', '第一条');
  await addNote(page, '明月', '第二条');
  const boxes = await page
    .getByTestId('side-note')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom })));
  boxes.sort((a, b) => a.top - b.top);
  expect(boxes).toHaveLength(2);
  expect(boxes[1].top).toBeGreaterThanOrEqual(boxes[0].bottom);
});

test('keeps notes after a reload', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await addNote(page, '比喻', '留下来');
  await expect(page.getByTestId('side-note').locator('textarea')).toHaveValue('留下来');
  await page.reload();
  await expect(page.getByTestId('side-note').locator('textarea')).toHaveValue('留下来', { timeout: 30_000 });
});
