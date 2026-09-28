import { expect, test, type Page } from '@playwright/test';
import { importText, openApp } from './helpers';

test('Text styles: an English and a Chinese typeface, each shown in its own face, plus size, spacing and width (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', 'Spring 他用比喻写春天。');
  const bar = page.getByTestId('article-bar');
  await bar.getByTestId('reading-open').click();
  const panel = page.getByTestId('reading-panel');
  await expect(panel).toContainText('Source Serif');
  await panel.getByTestId('reading-typeface').click();
  const inter = panel.getByTestId('reading-latin-inter');
  expect(await inter.locator('.ts-label').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Inter');
  await inter.click();
  await panel.getByTestId('reading-han-kai').click();
  await expect(inter).toHaveAttribute('aria-checked', 'true');
  await panel.getByTestId('reading-back').click();
  await expect(panel.getByTestId('reading-typeface')).toContainText('Inter');
  await panel.getByTestId('reading-width-down').click();
  await expect(panel.getByTestId('reading-width')).toHaveText('Narrow');
  const view = page.getByTestId('article-view');
  const family = await view.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family.indexOf('Inter')).toBeLessThan(family.indexOf('Kai'));
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px Inter'))).toBe(true);
});

test('opening Text styles moves focus into it; Escape brings it back to Aa', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他用比喻写春天。');
  const aa = page.getByTestId('article-bar').getByTestId('reading-open');
  await aa.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('reading-typeface')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(aa).toBeFocused();
});

test('the panel stays inside the window in a narrow memo column (Review Focus 2)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('jot.memoWidth', '240'));
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await importText(page, '春', '他用比喻写春天。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-bar').getByTestId('reading-open').click();
  const panel = await page.getByTestId('reading-panel').boundingBox();
  const viewport = page.viewportSize();
  expect(panel?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((panel?.x ?? 0) + (panel?.width ?? 9999)).toBeLessThanOrEqual(viewport?.width ?? 0);
});

test('☰ menus: arrow keys move between items, and Escape returns to ☰', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他用比喻写春天。');
  const menu = page.getByTestId('article-menu');
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('edit-start')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('article-details')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByTestId('article-delete')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('edit-start')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
});

test('long typeface names don’t cover the Typeface label (review)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() =>
    localStorage.setItem('jot.reading.article', JSON.stringify({ latin: 'atkinson', han: 'fangsong', size: 18, lineHeight: 1.9, width: 'medium' })),
  );
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await importText(page, '春', '他用比喻写春天。');
  await page.getByTestId('article-bar').getByTestId('reading-open').click();
  const label = page.getByTestId('reading-typeface').locator('.ts-label');
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const row = await page.getByTestId('reading-typeface').boundingBox();
  const panel = await page.getByTestId('reading-panel').boundingBox();
  expect((row?.x ?? 0) + (row?.width ?? 0)).toBeLessThanOrEqual((panel?.x ?? 0) + (panel?.width ?? 0) + 1);
});

test('each English typeface ships once per character set and style: no Greek, Cyrillic or Vietnamese files (review M5)', async ({ page }) => {
  await openApp(page);
  const literata = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Literata').length);
  expect(literata).toBe(6);
});

test('OpenDyslexic draws its own extended letters, such as pinyin tone marks (review I1)', async ({ page }) => {
  await openApp(page);
  const [dyslexic, fallback] = await page.evaluate(async () => {
    await document.fonts.load('16px OpenDyslexic', 'łāǎ');
    const width = (family: string) => {
      const probe = document.createElement('span');
      probe.style.cssText = `position:absolute;white-space:pre;font-size:16px;font-family:${family}`;
      probe.textContent = 'łłłāāāǎǎǎ';
      document.body.append(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return w;
    };
    return [width("'OpenDyslexic', monospace"), width('monospace')];
  });
  expect(Math.abs(dyslexic - fallback)).toBeGreaterThan(20);
});

/** The drawn width of the first `text` in the element. */
async function drawnWidth(page: Page, testId: string, text: string): Promise<number> {
  return page.getByTestId(testId).evaluate((root, t) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(t) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + t.length);
      return range.getBoundingClientRect().width;
    }
    return -1;
  }, text);
}

// Which marks leave the English face is pinned by fontFaces.test.ts; here, that the Chinese face draws them in
// Chinese text: …… and —— are full-width (two ems) there, and narrower in the English face.
test('Chinese punctuation comes from the Chinese face in a Chinese article; an English article keeps its own (review M6)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他说：“春风又绿江南岸……”——好');
  await expect.poll(() => drawnWidth(page, 'article-view', '……')).toBeGreaterThan(18 * 1.8);
  expect(await drawnWidth(page, 'article-view', '——')).toBeGreaterThan(18 * 1.8);
  await importText(page, 'Spring', 'He said, “Spring is here……”——fine');
  await expect.poll(() => drawnWidth(page, 'article-view', '……')).toBeLessThan(18 * 1.7);
  expect(await drawnWidth(page, 'article-view', '——')).toBeLessThan(18 * 1.7);
});

test('a memo’s punctuation follows the language of its own text (review M6)', async ({ page }) => {
  await openApp(page);
  await importText(page, 'Spring', 'Spring is here.');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('他说：“春风又绿江南岸……”');
  await expect.poll(() => drawnWidth(page, 'memo-editor', '……')).toBeGreaterThan(16 * 1.8);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('He said, “Spring is here……”');
  await expect.poll(() => drawnWidth(page, 'memo-editor', '……')).toBeLessThan(16 * 1.7);
});

test('the Text styles panel logs no React warnings (review M1)', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') warnings.push(m.text());
  });
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('article-bar').getByTestId('reading-open').click();
  await page.getByTestId('reading-typeface').click();
  await expect(page.getByTestId('reading-latin-inter')).toBeVisible();
  expect(warnings.filter((w) => w.includes('key'))).toEqual([]);
});

test('the panel stays under Aa and inside the window when the window shrinks (review M2)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  const open = page.getByTestId('memo-bar').getByTestId('reading-open');
  await open.click();
  const panel = page.getByTestId('reading-panel');
  await expect(panel).toBeVisible();
  await page.setViewportSize({ width: 900, height: 720 });
  await expect
    .poll(async () => {
      const p = await panel.boundingBox();
      const b = await open.boundingBox();
      return (p?.x ?? 9999) + (p?.width ?? 0) <= 900 && (p?.x ?? -1) >= 0 && Math.abs((p?.y ?? 0) - ((b?.y ?? 0) + (b?.height ?? 0) + 4)) < 2;
    })
    .toBe(true);
});

test('the panel lands under Aa when it opens while the bar slides in (review M2)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', Array.from({ length: 80 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n'));
  const reader = page.locator('main.reader');
  await reader.hover();
  await page.mouse.wheel(0, 1200);
  const bar = page.getByTestId('article-bar');
  await expect(bar).toHaveClass(/hidden/);
  // Keyboard focus brings the bar back with a slide; the panel opens in the same moment.
  await bar.getByTestId('reading-open').evaluate((button: HTMLElement) => {
    button.focus();
    button.click();
  });
  const panel = page.getByTestId('reading-panel');
  await expect(panel).toBeVisible();
  const open = bar.getByTestId('reading-open');
  await expect
    .poll(async () => {
      const p = await panel.boundingBox();
      const b = await open.boundingBox();
      return Math.abs((p?.y ?? 0) - ((b?.y ?? 0) + (b?.height ?? 0) + 4));
    })
    .toBeLessThan(2);
});

test('the typefaces are two radio groups, English and Chinese: Tab reaches the current choice, arrow keys pick the next (review M3)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('article-bar').getByTestId('reading-open').click();
  await page.getByTestId('reading-typeface').click();
  const english = page.getByRole('radiogroup', { name: 'English' });
  const chinese = page.getByRole('radiogroup', { name: 'Chinese' });
  await expect(english.getByRole('radio')).toHaveCount(9);
  await expect(chinese.getByRole('radio')).toHaveCount(4);
  await expect(english.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
  await expect(page.getByTestId('reading-latin-source-serif')).toHaveAttribute('tabindex', '0');
  await page.getByTestId('reading-latin-source-serif').focus();
  await page.keyboard.press('ArrowDown');
  // From the last serif face to the first sans face: one group.
  await expect(page.getByTestId('reading-latin-atkinson')).toBeFocused();
  await expect(page.getByTestId('reading-latin-atkinson')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('reading-latin-source-serif')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('reading-latin-literata').click();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('reading-latin-opendyslexic')).toBeFocused();
  await expect(page.getByTestId('reading-latin-opendyslexic')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('reading-han-song')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('reading-han-hei')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('reading-han-hei')).toBeFocused();
});

test('from the keyboard the panel follows Aa: Shift+Tab from its first control returns to Aa, Tab past its last moves on and closes it (review I2)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  const bar = page.getByTestId('memo-bar');
  const open = bar.getByTestId('reading-open');
  await open.click();
  const panel = page.getByTestId('reading-panel');
  await expect(page.getByTestId('reading-typeface')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(open).toBeFocused();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('reading-typeface')).toBeFocused();
  await page.getByTestId('reading-reset').focus();
  await page.keyboard.press('Tab');
  await expect(bar.getByTestId('memo-menu')).toBeFocused();
  await expect(panel).toHaveCount(0);
});

test('the panel closes when its column goes away, e.g. on a keyboard route change (review I2)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-bar').getByTestId('reading-open').click();
  await expect(page.getByTestId('reading-panel')).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#/trash';
  });
  await expect(page.getByTestId('reading-panel')).toHaveCount(0);
});

test('the typeface page’s back button looks like the bar’s icon buttons (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  const bar = page.getByTestId('article-bar');
  await bar.getByTestId('reading-open').click();
  await page.getByTestId('reading-typeface').click();
  const look = (el: Element) => {
    const c = getComputedStyle(el);
    return [c.borderTopWidth, c.backgroundColor];
  };
  expect(await page.getByTestId('reading-back').evaluate(look)).toEqual(await bar.getByTestId('reading-open').evaluate(look));
});
