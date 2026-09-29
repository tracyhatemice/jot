import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText, startFixing } from './helpers';

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

test('in a Chinese article an apostrophe in an English word keeps the English face; Chinese single quotes use the Chinese one', async ({ page }) => {
  await openApp(page);
  await importText(page, '莎', '他引用 Shakespeare’s 名句：“‘生存还是毁灭’，这是个问题。”');
  const apostrophes = page.getByTestId('article-view').locator('.latin-apostrophe');
  await expect(apostrophes).toHaveText(['’']);
  expect(await apostrophes.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Source Serif 4"?,/);
  await startFixing(page);
  const editing = page.getByTestId('article-editor').locator('.latin-apostrophe');
  await expect(editing).toHaveText(['’']);
  expect(await editing.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Source Serif 4"?,/);
});

test('in a Chinese memo an apostrophe in an English word keeps the English face', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('作者用 don’t 和‘不’表达否定。');
  const apostrophes = page.getByTestId('memo-editor').locator('.latin-apostrophe');
  await expect(apostrophes).toHaveText(['’']);
  expect(await apostrophes.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Source Serif 4"?,/);
});

test('a highlight across an apostrophe in a Chinese article keeps its exact text (guard)', async ({ page }) => {
  await openApp(page);
  await importText(page, '莎', '他引用 Shakespeare’s 名句。');
  await selectText(page, 'Shakespeare’s');
  await page.getByTestId('toolbar-highlight').click();
  await expect
    .poll(() => page.getByTestId('article-view').locator('.mk').evaluateAll((els) => els.map((e) => e.textContent).join('')))
    .toBe('Shakespeare’s');
});

test('English text keeps its apostrophes unmarked, so highlights and kerning stay whole (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, 'Spring', 'It’s the students’ view, don’t you think? Shakespeare’s spring.');
  await expect(page.getByTestId('article-view')).toContainText('Shakespeare’s');
  await expect(page.getByTestId('article-view').locator('.latin-apostrophe')).toHaveCount(0);
  await startFixing(page);
  await expect(page.getByTestId('article-editor')).toContainText('Shakespeare’s');
  await expect(page.getByTestId('article-editor').locator('.latin-apostrophe')).toHaveCount(0);
  await page.getByTestId('edit-cancel').click();
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('The writer’s choice: don’t explain.');
  await expect(page.getByTestId('memo-editor')).toContainText('don’t');
  await expect(page.getByTestId('memo-editor').locator('.latin-apostrophe')).toHaveCount(0);
});

const lines = (n: number) => Array.from({ length: n }, (_, i) => `第${i}行札记`);

test('focus leaving Aa and the panel closes it, so a memo switched to from the keyboard can still hide its bar (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  for (const line of lines(60)) {
    await page.keyboard.insertText(line);
    await page.keyboard.press('Enter');
  }
  await page.getByTestId('memo-tab').first().click();
  const bar = page.getByTestId('memo-bar');
  await bar.getByTestId('reading-open').click();
  await page.keyboard.press('Shift+Tab');
  await expect(bar.getByTestId('reading-open')).toBeFocused();
  await page.getByTestId('memo-tab').nth(1).focus();
  await expect(page.getByTestId('reading-panel')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 2');
  await page.locator('aside.memo').evaluate((el) => el.scrollBy(0, 600));
  await expect(page.getByTestId('memo-bar')).toHaveAttribute('data-shown', 'false');
});

test('a memo switched to draws its own punctuation from its first frame (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('他说：“春风又绿江南岸……”');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('He said, “Spring is here…”');
  await expect(page.getByTestId('memo-editor')).toContainText('He said');
  // Sample what each frame is about to draw while switching back to the Chinese memo, until 60 frames after it
  // first shows (a switch waits for the memo's pending saves, which can take a while under load).
  await page.evaluate(() => {
    const w = window as unknown as { samples: string[]; seen: number; done: boolean };
    w.samples = [];
    w.seen = 0;
    w.done = false;
    const sample = () => {
      const text = document.querySelector('[data-testid=memo-editor]')?.textContent ?? '';
      const pane = document.querySelector('.memo-pane');
      const font = pane ? getComputedStyle(pane).getPropertyValue('--memo-font') : '';
      w.samples.push(`${text.slice(0, 2)}|${font.split(',')[0]}`);
      if (text.startsWith('他说')) w.seen++;
      if (w.seen < 60 && w.samples.length < 3000) requestAnimationFrame(sample);
      else w.done = true;
    };
    requestAnimationFrame(sample);
  });
  await page.getByTestId('memo-tab').first().click();
  await expect(page.getByTestId('memo-editor')).toContainText('他说', { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { done: boolean }).done), { timeout: 20_000 }).toBe(true);
  const samples = await page.evaluate(() => (window as unknown as { samples: string[] }).samples);
  const chinese = samples.filter((s) => s.startsWith('他说'));
  expect(chinese.length).toBeGreaterThan(0);
  expect(chinese.filter((s) => !s.includes(' zh'))).toEqual([]);
});

test('the active highlight is one continuous line above and below, closed only at its ends, also where other marks split it (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, '莎', '他引用 Shakespeare’s 名句。');
  await selectText(page, 'Shakespeare’s 名句');
  await page.getByTestId('toolbar-highlight').click();
  const pieces = page.getByTestId('article-view').locator('.mk-active');
  await expect.poll(() => pieces.count()).toBeGreaterThan(2);
  const look = await pieces.evaluateAll((els) =>
    els.map((el) => {
      const c = getComputedStyle(el);
      // Each shadow's x offset: a side edge has one, the lines above and below don't.
      const xs = [...c.boxShadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px [\d.]+px/g)].map((m) => Number(m[1]));
      return { outline: c.outlineStyle, left: xs.some((x) => x < 0), right: xs.some((x) => x > 0), lines: xs.filter((x) => x === 0).length };
    }),
  );
  expect(look.every((p) => p.outline === 'none' && p.lines >= 2)).toBe(true);
  expect(look[0].left).toBe(true);
  expect(look[look.length - 1].right).toBe(true);
  expect(look.slice(1, -1).every((p) => !p.left && !p.right)).toBe(true);
  expect(look[0].right || look[look.length - 1].left).toBe(false);
});

test('the active highlight stays one box across italic words, without dips at the joins (review)', async ({ page }) => {
  await openApp(page);
  await importText(page, 'Fox', 'The quick brown fox jumps over the lazy dog.');
  await startFixing(page);
  const editor = page.getByTestId('article-editor');
  await expect(editor).toContainText('brown');
  await expect(async () => {
    await editor.evaluate((root) => {
      const node = [...root.querySelectorAll('p')][0]?.firstChild;
      if (!node) return;
      const at = node.textContent?.indexOf('brown') ?? -1;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 5);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('brown');
  }).toPass();
  await page.keyboard.press('ControlOrMeta+i');
  await expect(editor.locator('em')).toHaveText('brown');
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('article-view').locator('em')).toHaveText('brown');
  await selectText(page, 'quick brown fox');
  await page.getByTestId('toolbar-highlight').click();
  const pieces = page.getByTestId('article-view').locator('.mk-active');
  await expect.poll(() => pieces.count()).toBe(3);
  const look = await pieces.evaluateAll((els) =>
    els.map((el) => {
      const c = getComputedStyle(el);
      const xs = [...c.boxShadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px [\d.]+px/g)].map((m) => Number(m[1]));
      return { left: xs.some((x) => x < 0), right: xs.some((x) => x > 0), radius: c.borderTopLeftRadius + c.borderTopRightRadius };
    }),
  );
  expect(look.map((p) => [p.left, p.right])).toEqual([
    [true, false],
    [false, false],
    [false, true],
  ]);
  expect(look.every((p) => p.radius === '0px0px')).toBe(true);
});
