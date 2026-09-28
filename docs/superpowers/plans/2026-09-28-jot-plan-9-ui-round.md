# Jot Plan 9: Sidebar Polish, Scrollbars, Memo Formatting and Text Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The product owner's third UI round (spec §6.11), plus the small items plan 8's review deferred:
- the **Text styles** panel, with bundled English typefaces and system Chinese ones;
- a formatting bubble menu in memos;
- tinted tabs for memos from another article;
- standalone memos;
- sidebar polish: empty sections, tag alignment, folded sections docking at the bottom;
- thin scrollbars that appear on hover.

**Architecture:**
- **Reading-style model:** replaced by one with separate English and Chinese typefaces and named widths measured in the text's own size (Task 1). It reads plan 8's stored settings.
- **The Aa panel:** rebuilt as the Text styles panel, with a Typeface page. It is placed with fixed positioning so no column clips it (Task 2).
- **Everything else:** CSS, and small component changes, each with end-to-end tests on Chromium and WebKit.

**Tech Stack:** as before, plus:
- `@fontsource/*` packages 5.3.0 (OFL-1.1): literata, piazzolla, source-serif-4, atkinson-hyperlegible, inter, ibm-plex-sans, public-sans, source-sans-3, opendyslexic;
- `@tiptap/extension-bubble-menu` 3.31.3, which `@tiptap/react/menus` needs.

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`. Relevant sections: §6.11 (and §6.10, which it builds on) and §9 M12.

**Branch:** `plan-9-ui-round` (the spec commit 653a1d6 is on it).

## Global Constraints

- **Plan 1–8 constraints still apply.** In particular:
  - Docker only.
  - Local edits go only through `Library.commit`.
  - i18n keys are identical in `en` and `zh-CN`.
  - Conventional commits with **no attribution lines**.
- **Commands:**
  - Run: `docker compose run --rm -T -e NO_COLOR=1 dev <cmd>`.
  - End-to-end: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e [spec]`.
- **After adding dependencies or editing `packages/`,** restart the dev server and the browser server, then wait for both:
  - `docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright`
  - `until docker compose exec -T web node -e "require('net').connect(3000,'localhost').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; do sleep 2; done`
  - `until docker compose exec -T web node -e "fetch('http://localhost:5173/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; do sleep 2; done`
- **Typefaces** (§6.11):
  - English: bundled, OFL-1.1, loaded only when used.
  - Chinese: system stacks, falling back to the reading font.
  - A column's font is the English family, then the Chinese stack.
- **Line widths:** Narrow 28 em, Medium 34 em, Wide 42 em, Full, measured in the text's own size (the CSS width is `em × size` px).
- **Defaults:**
  - articles: Source Serif with 宋体, 18 px, 1.9, Medium;
  - memos: Source Serif with 宋体, 16 px, 1.8, Full.
- **Test IDs kept:**
  - `reading-open`, `reading-panel`;
  - `reading-size`, `reading-lineHeight` and `reading-width`, each with `-up` and `-down`;
  - `reading-reset`.
  - `reading-font-*` is replaced by `reading-latin-<id>` and `reading-han-<id>`.

## Review Focus

These five inputs aren't covered by the happy paths and are most likely to cause problems. Each one has a test in the task that owns the code.

1. **Settings stored by plan 8, or damaged ones.**
   - Expected: its 宋体 / 黑体 / 楷体 choice becomes the Chinese face, and its width becomes the nearest named width. Damaged values fall back to the defaults.
   - Test: Task 1.
2. **The Text styles panel in a narrow memo column.**
   - Expected: the whole panel stays inside the window and is usable.
   - Test: Task 2.
3. **Folding sections in different combinations.**
   - Expected: trailing folded sections dock at the bottom in order; a folded middle section stays in place.
   - Test: Task 3.
4. **Formatting a memo selection, then clicking a link chip.**
   - Expected: the bubble menu formats the text, and it doesn't appear for a chip (a node selection).
   - Test: Task 4.
5. **Two saves of Edit details at once (a double Enter), and moving a memo into an article just deleted elsewhere.**
   - Expected: one write; a readable message, not a raw error.
   - Test: Task 6.

---

### Task 1: The text-style model and the bundled English typefaces

**Files:**
- Create: `apps/client/src/reading/fonts.ts`
- Modify:
  - `apps/client/src/reading/readingStyle.ts` (replace), `readingStyle.test.ts` (replace)
  - `apps/client/src/main.tsx`
  - `apps/client/package.json`, `pnpm-lock.yaml`
- Test: `apps/client/src/reading/readingStyle.test.ts`

**Interfaces:**
- Produces:
  - `type LatinFace`, `type HanFace` and `type LineWidth = 'narrow' | 'medium' | 'wide' | 'full'`
  - `interface ReadingStyle { latin: LatinFace; han: HanFace; size: number; lineHeight: number; width: LineWidth }`
  - `LATIN_FACES: { id; name; family; group: 'serif' | 'sans' }[]` and `HAN_FACES: { id; family }[]`
  - `WIDTHS`, `DEFAULT_STYLE`, `LIMITS`, `parseStyle`, `stepStyle` and `styleVars`, with the same signatures as plan 8 except the style type
  - `fontStack(style): string`
  - `useReadingStyle` is unchanged.

- [ ] **Step 1: Add the font packages**

Run: `docker compose run --rm -T dev pnpm --filter @jot/client add @fontsource/literata@^5.3.0 @fontsource/piazzolla@^5.3.0 @fontsource/source-serif-4@^5.3.0 @fontsource/atkinson-hyperlegible@^5.3.0 @fontsource/inter@^5.3.0 @fontsource/ibm-plex-sans@^5.3.0 @fontsource/public-sans@^5.3.0 @fontsource/source-sans-3@^5.3.0 @fontsource/opendyslexic@^5.3.0`
Expected: `apps/client/package.json` and `pnpm-lock.yaml` list the nine packages.

- [ ] **Step 2: Write the failing tests**

Replace `apps/client/src/reading/readingStyle.test.ts` with:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, parseStyle, stepStyle, styleVars } from './readingStyle';

describe('text styles', () => {
  it('repairs damaged or out-of-range settings (Review Focus 1)', () => {
    expect(parseStyle(null, 'article')).toEqual(DEFAULT_STYLE.article);
    expect(parseStyle('nonsense', 'memo')).toEqual(DEFAULT_STYLE.memo);
    expect(parseStyle({ latin: 'comic', han: 'wingdings', size: 99, lineHeight: 0.2, width: 'huge' }, 'article')).toEqual({
      ...DEFAULT_STYLE.article,
      size: 26,
      lineHeight: 1.4,
    });
  });

  it('carries plan 8 settings over: its typeface becomes the Chinese face, its width the nearest named width (Review Focus 1)', () => {
    expect(parseStyle({ typeface: 'kai', size: 18, lineHeight: 2, width: 40 }, 'article')).toEqual({
      latin: 'source-serif',
      han: 'kai',
      size: 18,
      lineHeight: 2,
      width: 'medium',
    });
    expect(parseStyle({ typeface: 'hei', size: 18, width: 50 }, 'article').width).toBe('wide');
    expect(parseStyle({ typeface: 'song', size: 18, width: 30 }, 'article').width).toBe('narrow');
    expect(parseStyle({ typeface: 'song', size: 16, width: 0 }, 'memo').width).toBe('full');
  });

  it('steps within the limits, and through the named widths', () => {
    const s = DEFAULT_STYLE.article;
    expect(stepStyle(s, 'size', 1).size).toBe(19);
    expect(stepStyle({ ...s, size: 26 }, 'size', 1).size).toBe(26);
    expect(stepStyle(s, 'lineHeight', 1).lineHeight).toBe(2);
    expect(stepStyle(s, 'width', 1).width).toBe('wide');
    expect(stepStyle({ ...s, width: 'wide' }, 'width', 1).width).toBe('full');
    expect(stepStyle({ ...s, width: 'full' }, 'width', 1).width).toBe('full');
    expect(stepStyle({ ...s, width: 'narrow' }, 'width', -1).width).toBe('narrow');
  });

  it('turns a style into its column’s variables, the width in the text’s own size', () => {
    const article = styleVars(DEFAULT_STYLE.article, 'article');
    expect(article['--read-font'].startsWith("'Source Serif 4', 'Songti SC'")).toBe(true);
    expect([article['--read-size'], article['--read-line'], article['--read-width']]).toEqual(['18px', '1.9', '612px']);
    const memo = styleVars({ ...DEFAULT_STYLE.memo, latin: 'inter', han: 'hei' }, 'memo');
    expect(memo['--memo-font'].startsWith("'Inter', 'PingFang SC'")).toBe(true);
    expect(memo['--memo-width']).toBe('none');
    expect(styleVars({ ...DEFAULT_STYLE.article, width: 'full' }, 'article')['--read-width']).toBe('1fr');
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/reading`
Expected: FAIL: the old model has no `latin`, `han` or named widths.

- [ ] **Step 3: Implement**

Replace `apps/client/src/reading/readingStyle.ts` with:
```ts
/** Text styles for the article and memo columns (spec §6.11), kept on this device. */
export type LatinFace =
  | 'literata' | 'piazzolla' | 'source-serif' | 'atkinson' | 'inter' | 'ibm-plex-sans' | 'public-sans' | 'source-sans' | 'opendyslexic';
export type HanFace = 'song' | 'hei' | 'kai' | 'fangsong';
export type LineWidth = 'narrow' | 'medium' | 'wide' | 'full';
export type ReadingKind = 'article' | 'memo';

export interface ReadingStyle {
  /** The English typeface: Latin letters. */
  latin: LatinFace;
  /** The Chinese typeface: Chinese characters. */
  han: HanFace;
  /** Font size in px. */
  size: number;
  lineHeight: number;
  width: LineWidth;
}

/** Bundled from Fontsource (OFL-1.1); `family` is the CSS family name its package declares. */
export const LATIN_FACES: readonly { id: LatinFace; name: string; family: string; group: 'serif' | 'sans' }[] = [
  { id: 'literata', name: 'Literata', family: "'Literata'", group: 'serif' },
  { id: 'piazzolla', name: 'Piazzolla', family: "'Piazzolla'", group: 'serif' },
  { id: 'source-serif', name: 'Source Serif', family: "'Source Serif 4'", group: 'serif' },
  { id: 'atkinson', name: 'Atkinson Hyperlegible', family: "'Atkinson Hyperlegible'", group: 'sans' },
  { id: 'inter', name: 'Inter', family: "'Inter'", group: 'sans' },
  { id: 'ibm-plex-sans', name: 'IBM Plex Sans', family: "'IBM Plex Sans'", group: 'sans' },
  { id: 'public-sans', name: 'Public Sans', family: "'Public Sans'", group: 'sans' },
  { id: 'source-sans', name: 'Source Sans', family: "'Source Sans 3'", group: 'sans' },
  { id: 'opendyslexic', name: 'OpenDyslexic', family: "'OpenDyslexic'", group: 'sans' },
];

const SONG = "'Songti SC', 'STSong', 'SimSun', 'Noto Serif CJK SC', 'Source Han Serif SC', serif";

/** The computer's own Chinese fonts (macOS, Windows, Linux); a missing one falls back to 宋体 (spec §6.11). */
export const HAN_FACES: readonly { id: HanFace; family: string }[] = [
  { id: 'song', family: SONG },
  { id: 'hei', family: "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif" },
  { id: 'kai', family: `'Kaiti SC', 'STKaiti', 'KaiTi', 'BiauKai', 'AR PL UKai CN', ${SONG}` },
  { id: 'fangsong', family: `'STFangsong', 'FangSong', 'FangSong_GB2312', ${SONG}` },
];

export const WIDTHS: readonly LineWidth[] = ['narrow', 'medium', 'wide', 'full'];

/** Line widths in the text's own ems (spec §6.11). */
const WIDTH_EM: Record<Exclude<LineWidth, 'full'>, number> = { narrow: 28, medium: 34, wide: 42 };

export const DEFAULT_STYLE: Record<ReadingKind, ReadingStyle> = {
  article: { latin: 'source-serif', han: 'song', size: 18, lineHeight: 1.9, width: 'medium' },
  memo: { latin: 'source-serif', han: 'song', size: 16, lineHeight: 1.8, width: 'full' },
};

export const LIMITS = {
  size: { min: 14, max: 26, step: 1 },
  lineHeight: { min: 1.4, max: 2.6, step: 0.1 },
} as const;

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isLatin = (v: unknown): v is LatinFace => LATIN_FACES.some((f) => f.id === v);
const isHan = (v: unknown): v is HanFace => HAN_FACES.some((f) => f.id === v);
const isWidth = (v: unknown): v is LineWidth => WIDTHS.includes(v as LineWidth);

/**
 * The named width nearest a plan 8 width in em (0 = full). Plan 8's article ems were of the 15 px
 * interface font; its memo ems were of the memo text.
 */
function widthFromEm(em: number, kind: ReadingKind, size: number): LineWidth {
  if (em === 0) return 'full';
  const textEms = (em * (kind === 'article' ? 15 : size)) / size;
  let best: LineWidth = 'medium';
  let gap = Number.POSITIVE_INFINITY;
  for (const w of ['narrow', 'medium', 'wide'] as const) {
    const d = Math.abs(WIDTH_EM[w] - textEms);
    if (d < gap) {
      gap = d;
      best = w;
    }
  }
  return best;
}

/** A stored style, repaired: unknown or missing values fall back to the defaults; plan 8's settings carry over. */
export function parseStyle(raw: unknown, kind: ReadingKind): ReadingStyle {
  const d = DEFAULT_STYLE[kind];
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const size = clamp(Math.round(num(o.size, d.size)), LIMITS.size.min, LIMITS.size.max);
  // Plan 8 stored `typeface` (song, hei or kai) and a numeric `width`.
  const han = isHan(o.han) ? o.han : isHan(o.typeface) ? o.typeface : d.han;
  const width = isWidth(o.width) ? o.width : typeof o.width === 'number' && Number.isFinite(o.width) ? widthFromEm(o.width, kind, size) : d.width;
  return {
    latin: isLatin(o.latin) ? o.latin : d.latin,
    han,
    size,
    lineHeight: round1(clamp(num(o.lineHeight, d.lineHeight), LIMITS.lineHeight.min, LIMITS.lineHeight.max)),
    width,
  };
}

/** One step up or down; the width steps through its names. */
export function stepStyle(style: ReadingStyle, field: 'size' | 'lineHeight' | 'width', direction: 1 | -1): ReadingStyle {
  if (field === 'width') return { ...style, width: WIDTHS[clamp(WIDTHS.indexOf(style.width) + direction, 0, WIDTHS.length - 1)] };
  if (field === 'lineHeight') {
    return { ...style, lineHeight: round1(clamp(style.lineHeight + direction * LIMITS.lineHeight.step, LIMITS.lineHeight.min, LIMITS.lineHeight.max)) };
  }
  return { ...style, size: clamp(style.size + direction * LIMITS.size.step, LIMITS.size.min, LIMITS.size.max) };
}

/** The CSS font-family of a style: the English face for Latin letters, then the Chinese one (spec §6.11). */
export function fontStack(style: ReadingStyle): string {
  const latin = LATIN_FACES.find((f) => f.id === style.latin) ?? LATIN_FACES[2];
  const han = HAN_FACES.find((f) => f.id === style.han) ?? HAN_FACES[0];
  return `${latin.family}, ${han.family}`;
}

/** The CSS custom properties a column reads: `--read-*` for articles, `--memo-*` for memos. */
export function styleVars(style: ReadingStyle, kind: ReadingKind): Record<string, string> {
  const p = kind === 'article' ? '--read' : '--memo';
  return {
    [`${p}-font`]: fontStack(style),
    [`${p}-size`]: `${style.size}px`,
    [`${p}-line`]: String(style.lineHeight),
    [`${p}-width`]: style.width === 'full' ? (kind === 'article' ? '1fr' : 'none') : `${WIDTH_EM[style.width] * style.size}px`,
  };
}
```

`apps/client/src/reading/fonts.ts`:
```ts
/** The bundled English typefaces (spec §6.11): Fontsource, OFL-1.1. A face downloads only when text uses it. */
import '@fontsource/literata/400.css';
import '@fontsource/literata/700.css';
import '@fontsource/literata/400-italic.css';
import '@fontsource/piazzolla/400.css';
import '@fontsource/piazzolla/700.css';
import '@fontsource/piazzolla/400-italic.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/700.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/atkinson-hyperlegible/400-italic.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/400-italic.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/700.css';
import '@fontsource/public-sans/400-italic.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/700.css';
import '@fontsource/source-sans-3/400-italic.css';
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
import '@fontsource/opendyslexic/400-italic.css';
```

In `apps/client/src/main.tsx`, add `import './reading/fonts';` directly after `import './styles/app.css';`.

`ReadingControls.tsx` still uses the old fields until Task 2, so typecheck fails in between. Tasks 1 and 2 are committed together at the end of Task 2.

- [ ] **Step 4: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/reading`
Expected: 4 passed.

---

### Task 2: The Text styles panel and keyboard menus

**Files:**
- Modify:
  - `apps/client/src/components/ReadingControls.tsx` (replace), `Menu.tsx`
  - `apps/client/src/i18n/en.ts`, `zh-CN.ts` (replace the `reading` block)
  - `apps/client/src/styles/app.css`
  - `apps/client/e2e/article-bar.spec.ts`
- Test: `apps/client/e2e/article-bar.spec.ts`, `apps/client/e2e/text-styles.spec.ts` (new)

**Interfaces:**
- Consumes: from Task 1, `LATIN_FACES`, `HAN_FACES`, `DEFAULT_STYLE`, `stepStyle` and the types.
- Produces:
  - `ReadingControls`, with the same props as before, and test IDs:
    - `reading-open`, `reading-panel`;
    - `reading-typeface`, `reading-back`;
    - `reading-latin-<id>` and `reading-han-<id>`;
    - `reading-size`, `reading-lineHeight` and `reading-width`, each with `-up` and `-down`;
    - `reading-reset`.
  - `Menu`: opening focuses the first item; ArrowUp/ArrowDown/Home/End move between items.

- [ ] **Step 1: Write the failing tests**

`apps/client/e2e/text-styles.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
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
```

In `apps/client/e2e/article-bar.spec.ts`, in 'Aa changes the typeface, size, line spacing and width, and they stay after a reload':
- replace `await bar.getByTestId('reading-font-kai').click();` with:
```ts
  await bar.getByTestId('reading-typeface').click();
  await bar.getByTestId('reading-han-kai').click();
  await bar.getByTestId('reading-back').click();
```
- replace `await expect(bar.getByTestId('reading-width')).toHaveText('35em');` with `await expect(bar.getByTestId('reading-width')).toHaveText('Narrow');`

The panel is fixed-positioned but still inside the bar's element, so `bar.getByTestId(…)` still finds its controls.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e text-styles --project chromium --timeout 20000`
Expected: FAIL: there is no `reading-typeface`.

- [ ] **Step 2: Implement the panel**

Replace `apps/client/src/components/ReadingControls.tsx` with:
```tsx
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_STYLE, HAN_FACES, LATIN_FACES, stepStyle, type HanFace, type LineWidth, type ReadingKind, type ReadingStyle,
} from '../reading/readingStyle';

const PANEL_WIDTH = 300;
const HAN_LABEL = { song: 'reading.hanSong', hei: 'reading.hanHei', kai: 'reading.hanKai', fangsong: 'reading.hanFangsong' } as const satisfies Record<HanFace, string>;
const WIDTH_LABEL = {
  narrow: 'reading.widthNarrow',
  medium: 'reading.widthMedium',
  wide: 'reading.widthWide',
  full: 'reading.widthFull',
} as const satisfies Record<LineWidth, string>;

interface Props {
  kind: ReadingKind;
  style: ReadingStyle;
  onChange(next: ReadingStyle): void;
  onOpenChange?(open: boolean): void;
}

/** The Aa button and the Text styles panel (spec §6.11): typefaces, size, line spacing and line width. */
export function ReadingControls({ kind, style, onChange, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<'main' | 'typeface'>('main');
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const changed = useRef(onOpenChange);
  changed.current = onOpenChange;

  useEffect(() => {
    changed.current?.(open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  // Fixed under the button and kept inside the window: a narrow memo column would clip a panel inside it.
  useLayoutEffect(() => {
    if (!open) return;
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8)) });
    setPage('main');
  }, [open]);

  // Opening, or turning a page, puts focus on the panel's first control.
  useEffect(() => {
    if (open && at) panelRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [open, at, page]);

  const latin = LATIN_FACES.find((f) => f.id === style.latin) ?? LATIN_FACES[2];

  const stepper = (field: 'size' | 'lineHeight' | 'width', icon: ReactNode, label: string, value: string) => (
    <div className="ts-row">
      <span className="ts-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="ts-label">{label}</span>
      <output className="ts-value" data-testid={`reading-${field}`}>
        {value}
      </output>
      <span className="ts-steps">
        <button type="button" aria-label={`${label} −`} onClick={() => onChange(stepStyle(style, field, -1))} data-testid={`reading-${field}-down`}>
          −
        </button>
        <button type="button" aria-label={`${label} +`} onClick={() => onChange(stepStyle(style, field, 1))} data-testid={`reading-${field}-up`}>
          +
        </button>
      </span>
    </div>
  );

  const choice = (checked: boolean, family: string, label: string, onPick: () => void, testId: string) => (
    <button type="button" role="radio" aria-checked={checked} className="ts-row ts-choice" onClick={onPick} data-testid={testId}>
      <span className="ts-label" style={{ fontFamily: family }}>
        {label}
      </span>
      <span className={checked ? 'ts-radio on' : 'ts-radio'} aria-hidden="true" />
    </button>
  );

  return (
    <div className="reading" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon reading-button"
        aria-label={t('reading.title')}
        title={t('reading.title')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="reading-open"
      >
        Aa
      </button>
      {open && at && (
        <div
          ref={panelRef}
          className="reading-panel"
          style={{ top: at.top, left: at.left, width: PANEL_WIDTH }}
          role="dialog"
          aria-label={t('reading.title')}
          data-testid="reading-panel"
        >
          {page === 'main' ? (
            <>
              <h3 className="ts-title">{t('reading.title')}</h3>
              <div className="ts-group">
                <button type="button" className="ts-row ts-link" onClick={() => setPage('typeface')} data-testid="reading-typeface">
                  <span className="ts-icon" aria-hidden="true">
                    Aa
                  </span>
                  <span className="ts-label">{t('reading.typeface')}</span>
                  <span className="ts-value">
                    {latin.name} · {t(HAN_LABEL[style.han])}
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
                {stepper('size', 'TT', t('reading.size'), `${style.size}px`)}
                {stepper('lineHeight', '≡', t('reading.lineHeight'), style.lineHeight.toFixed(1))}
                {stepper('width', '↔', t('reading.width'), t(WIDTH_LABEL[style.width]))}
              </div>
              <button type="button" className="quiet ts-reset" onClick={() => onChange(DEFAULT_STYLE[kind])} data-testid="reading-reset">
                {t('reading.reset')}
              </button>
            </>
          ) : (
            <>
              <div className="ts-header">
                <button type="button" className="icon" aria-label={t('reading.back')} onClick={() => setPage('main')} data-testid="reading-back">
                  ‹
                </button>
                <h3 className="ts-title">{t('reading.typeface')}</h3>
              </div>
              {(['serif', 'sans'] as const).map((group) => (
                <div key={group}>
                  <p className="ts-group-title">
                    {t('reading.english')} · {t(group === 'serif' ? 'reading.serif' : 'reading.sans')}
                  </p>
                  <div className="ts-group" role="radiogroup" aria-label={t(group === 'serif' ? 'reading.serif' : 'reading.sans')}>
                    {LATIN_FACES.filter((f) => f.group === group).map((f) =>
                      choice(style.latin === f.id, f.family, f.name, () => onChange({ ...style, latin: f.id }), `reading-latin-${f.id}`),
                    )}
                  </div>
                </div>
              ))}
              <p className="ts-group-title">{t('reading.chinese')}</p>
              <div className="ts-group" role="radiogroup" aria-label={t('reading.chinese')}>
                {HAN_FACES.map((f) => choice(style.han === f.id, f.family, t(HAN_LABEL[f.id]), () => onChange({ ...style, han: f.id }), `reading-han-${f.id}`))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

In `apps/client/src/components/Menu.tsx`:
1. Change the react import to `import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';`.
2. After `const buttonRef = useRef<HTMLButtonElement>(null);`, add:
```ts
  const listRef = useRef<HTMLDivElement>(null);

  // Opening focuses the first item; arrow keys, Home and End move between items (spec §6.11).
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown' ? (i + 1) % items.length
      : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    items[next]?.focus();
  };
```
3. Change `<div className="menu-list" role="menu">` to `<div className="menu-list" role="menu" ref={listRef} onKeyDown={onListKey}>`.

In `apps/client/src/i18n/en.ts`, replace the whole `reading` block with:
```ts
  reading: {
    title: 'Text styles',
    typeface: 'Typeface',
    back: 'Back',
    english: 'English',
    chinese: 'Chinese',
    serif: 'Serif',
    sans: 'Sans Serif',
    hanSong: 'Songti 宋体',
    hanHei: 'Heiti 黑体',
    hanKai: 'Kaiti 楷体',
    hanFangsong: 'Fangsong 仿宋',
    size: 'Font size',
    lineHeight: 'Line spacing',
    width: 'Line width',
    widthNarrow: 'Narrow',
    widthMedium: 'Medium',
    widthWide: 'Wide',
    widthFull: 'Full',
    reset: 'Reset',
  },
```

In `apps/client/src/i18n/zh-CN.ts`, replace the whole `reading` block with:
```ts
  reading: {
    title: '文字样式',
    typeface: '字体',
    back: '返回',
    english: '英文',
    chinese: '中文',
    serif: '衬线',
    sans: '无衬线',
    hanSong: '宋体',
    hanHei: '黑体',
    hanKai: '楷体',
    hanFangsong: '仿宋',
    size: '字号',
    lineHeight: '行距',
    width: '行宽',
    widthNarrow: '窄',
    widthMedium: '中',
    widthWide: '宽',
    widthFull: '全宽',
    reset: '恢复默认',
  },
```

In `apps/client/src/styles/app.css`, replace the rules for `.reading-panel`, `.reading-fonts`, `.reading-fonts button`, `.reading-fonts button.active`, `.reading-row`, `.reading-row > span` and `.reading-row output` with:
```css
.reading-panel { position: fixed; z-index: 40; display: flex; flex-direction: column; gap: 8px; max-height: calc(100vh - 80px); overflow: auto; padding: 12px; font-size: 13px; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); }
.ts-title { margin: 0; font-size: 13px; font-weight: 600; }
.ts-header { display: flex; align-items: center; gap: 4px; }
.ts-group-title { margin: 6px 0 2px; font-size: 12px; color: var(--muted); }
.ts-group { display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.ts-row { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 10px; color: inherit; font: inherit; text-align: left; background: none; border: none; }
.ts-row + .ts-row { border-top: 1px solid var(--line); }
.ts-link:hover, .ts-choice:hover { background: var(--bg); }
.ts-icon { width: 22px; flex: none; color: var(--muted); font-family: var(--font-read); text-align: center; }
.ts-label { flex: 1; min-width: 0; }
.ts-value { color: var(--muted); white-space: nowrap; }
.ts-steps { display: flex; gap: 2px; }
.ts-steps button { width: 26px; height: 26px; padding: 0; border-radius: 6px; }
.ts-choice .ts-label { font-size: 15px; }
.ts-radio { width: 16px; height: 16px; flex: none; border: 1.5px solid var(--line); border-radius: 50%; }
.ts-radio.on { border: 5px solid var(--accent); }
.ts-reset { align-self: flex-start; }
```

- [ ] **Step 3: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: everything passes.

Restart the services (new dependencies), then run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e text-styles article-bar memo-bar pages`
Expected:
- `text-styles` passes 4 on each browser. On WebKit, `document.fonts.check` behaves the same; if WebKit reports the check differently, record a ruling and assert the computed family instead.
- The others pass.

- [ ] **Step 4: Commit (Tasks 1 and 2)**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "feat(client): Text styles with English and Chinese typefaces, named widths, and keyboard menus"
```

---

### Task 3: Sidebar polish: empty sections, tag alignment, standalone memos, docking

**Files:**
- Modify:
  - `apps/client/src/components/Sidebar.tsx`, `MemoList.tsx`, `TagTree.tsx`
  - `apps/client/src/i18n/en.ts`, `zh-CN.ts`
  - `apps/client/src/styles/app.css`
  - `apps/client/e2e/sidebar.spec.ts`
- Test: `apps/client/e2e/sidebar.spec.ts`

**Interfaces:**
- Produces:
  - Test ID `memo-standalone-new` for the Memos **+**.
  - Classes `sidebar-sections`, `sidebar-section`, `dock-start` and `section-empty`.
  - i18n `memoList.new`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/client/e2e/sidebar.spec.ts`:
```ts
test('empty sections read as quietly as items, and tag names line up with article titles (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill('技巧');
  await page.getByTestId('tag-name-input').press('Enter');
  const link = await page.getByTestId('library-list').getByRole('link').first().boundingBox();
  const empty = page.getByTestId('memo-list-empty');
  expect(Math.abs(((await empty.boundingBox())?.x ?? 0) - (link?.x ?? 99))).toBeLessThanOrEqual(1);
  expect(await empty.evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).fontSize])).toEqual(['8px', '13px']);
  const tag = page.getByTestId('tag-name').first();
  expect(Math.abs(((await tag.boundingBox())?.x ?? 0) - (link?.x ?? 99))).toBeLessThanOrEqual(1);
  expect(await tag.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('8px');
});

test('Memos + creates a standalone memo and opens it (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('memo-standalone-new').click();
  await expect(page.getByTestId('memo-pane')).toBeVisible();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
  await expect(page.getByTestId('memo-list-item')).toContainText('No article');
});

test('folded sections at the end stack at the bottom; a folded middle section stays in place (Review Focus 3)', async ({ page }) => {
  await openApp(page);
  const box = (id: string) => page.getByTestId(id).boundingBox();
  const footerTop = async () => (await page.locator('.sidebar footer').boundingBox())?.y ?? 0;
  await page.getByTestId('section-tags-fold').click();
  let tags = await box('section-tags');
  expect((await footerTop()) - ((tags?.y ?? 0) + (tags?.height ?? 0))).toBeLessThan(24);
  await page.getByTestId('section-memos-fold').click();
  const memos = await box('section-memos');
  tags = await box('section-tags');
  expect((tags?.y ?? 0) - ((memos?.y ?? 0) + (memos?.height ?? 0))).toBeLessThan(24);
  expect((await footerTop()) - ((tags?.y ?? 0) + (tags?.height ?? 0))).toBeLessThan(24);
  await page.getByTestId('section-tags-fold').click();
  const library = await box('section-library');
  const middle = await box('section-memos');
  expect((middle?.y ?? 999) - ((library?.y ?? 0) + (library?.height ?? 0))).toBeLessThan(80);
});
```

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar --project chromium --timeout 20000`
Expected: the three new tests FAIL (alignment, no `memo-standalone-new`, no docking).

- [ ] **Step 2: Implement**

In `apps/client/src/components/Sidebar.tsx`:
1. After the three `useStoredFlag` lines, add:
```ts
  // Folded sections at the end stack at the bottom, above the footer; a folded middle one stays put (spec §6.11).
  const dockFrom = tagsFolded ? (memosFolded ? (libraryFolded ? 'library' : 'memos') : 'tags') : null;
  const section = (name: 'library' | 'memos' | 'tags') => (name === dockFrom ? 'sidebar-section dock-start' : 'sidebar-section');
```
2. Wrap the three sections in the non-search branch: replace the fragment `<> … </>` that holds `SectionHeading` (library), the library list, `<MemoList …/>` and `<TagTree …/>` with:
```tsx
        <div className="sidebar-sections">
          <div className={section('library')}>
            {/* the library SectionHeading and its {!libraryFolded && (…)} block, unchanged */}
          </div>
          <div className={section('memos')}>
            <MemoList folded={memosFolded} onFold={setMemosFolded} />
          </div>
          <div className={section('tags')}>
            <TagTree folded={tagsFolded} onFold={setTagsFolded} onSelect={(tagId) => onSearch({ ...EMPTY_SEARCH, tagIds: [tagId] })} />
          </div>
        </div>
```
3. On the library-empty `<p>`, change `className="muted"` to `className="section-empty"`.

In `apps/client/src/components/MemoList.tsx`:
1. Change the imports to add `createMemo` from `@jot/db`, `reportError` from `../data/errors`, and `useLibrary` from `../data/LibraryContext`.
2. After `const { data: memos } = …`, add:
```ts
  const lib = useLibrary();
  // A standalone memo belongs to no article; it opens in the memo column (spec §6.11).
  const create = async () => {
    const id = await createMemo(lib, { title: t('memo.defaultTitle', { n: (memos?.length ?? 0) + 1 }), homeArticleId: null });
    bridge.showMemo(id);
  };
```
3. Give the `SectionHeading` an action:
```tsx
        action={
          <button type="button" className="icon" aria-label={t('memoList.new')} title={t('memoList.new')} onClick={() => void create().catch(reportError)} data-testid="memo-standalone-new">
            +
          </button>
        }
```
4. On the memo-list-empty `<p>`, change `className="muted"` to `className="section-empty"`. Re-indent the `{!folded && (<>…</>)}` body by two spaces (plan 8 left it unindented).

In `apps/client/src/components/TagTree.tsx`:
- change `const menuIndent = { marginLeft: node.depth * INDENT + 20 };` to `const menuIndent = { marginLeft: node.depth * INDENT };`;
- on the tags-empty `<p className="muted">`, change the class to `section-empty`;
- re-indent the `{!folded && (<>…</>)}` body by two spaces.

In `apps/client/src/i18n/en.ts`, in `memoList`, add `new: 'New memo (no article)',`. In `zh-CN.ts`, add `new: '新建独立札记',`.

In `apps/client/src/styles/app.css`:
- replace `.tag-toggle { width: 18px; flex: none; padding: 0; text-align: center; }` with `.tag-toggle { position: absolute; top: 50%; width: 16px; margin-left: -16px; padding: 0; text-align: center; transform: translateY(-50%); }`;
- replace `.tag-row { display: flex; align-items: center; gap: 2px; border-radius: 6px; }` with `.tag-row { position: relative; display: flex; align-items: center; border-radius: 6px; }`;
- in the `.tag-name` rule, change `padding: 4px;` to `padding: 4px 8px;`;
- append:
```css
/* Sidebar sections (spec §6.11) */
.sidebar-sections { flex: 1 0 auto; display: flex; flex-direction: column; gap: 10px; }
.sidebar-section { display: flex; flex-direction: column; gap: 4px; }
.dock-start { margin-top: auto; }
.section-empty { margin: 0; padding: 2px 8px 6px; font-size: 13px; color: var(--muted); }
```

- [ ] **Step 3: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: everything passes.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar tagtree tags shell memolist`
Expected: `sidebar` passes 7 on each browser; the others pass.

- [ ] **Step 4: Commit**

```bash
git add apps/client
git commit -m "feat(client): sidebar polish: quiet empty sections, aligned tags, standalone memos, folded sections dock at the bottom"
```

---

### Task 4: The memo bubble menu and tinted foreign tabs

**Files:**
- Create: `apps/client/src/memo/MemoBubbleMenu.tsx`
- Modify:
  - `apps/client/src/memo/MemoEditor.tsx`, `apps/client/src/components/MemoPane.tsx`
  - `apps/client/src/i18n/en.ts`, `zh-CN.ts`
  - `apps/client/src/styles/app.css`
  - `apps/client/package.json`, `pnpm-lock.yaml`
  - `apps/client/e2e/memo-bar.spec.ts`
- Test: `apps/client/e2e/memo-bar.spec.ts`

**Interfaces:**
- Produces:
  - `<MemoBubbleMenu editor />`, with test IDs `memo-bubble` and `fmt-bold`, `fmt-italic`, `fmt-strike`, `fmt-h1`, `fmt-h2`, `fmt-h3`, `fmt-bullet`, `fmt-ordered`, `fmt-quote`.
  - Memo tabs from another article carry class `foreign` and a `title`.

- [ ] **Step 1: Add the dependency**

Run: `docker compose run --rm -T dev pnpm --filter @jot/client add @tiptap/extension-bubble-menu@^3.31.3`
Expected: it is added to `apps/client/package.json`.

- [ ] **Step 2: Write the failing tests**

Append to `apps/client/e2e/memo-bar.spec.ts`:
```ts
test('selecting memo text shows a formatting menu; a link chip does not (spec §6.11, Review Focus 4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('论比喻的写法');
  await page.keyboard.press('Shift+Home');
  const bubble = page.getByTestId('memo-bubble');
  await expect(bubble).toBeVisible();
  await bubble.getByTestId('fmt-bold').click();
  await expect(page.getByTestId('memo-editor').locator('strong')).toHaveText('论比喻的写法');
  await expect(bubble.getByTestId('fmt-bold')).toHaveAttribute('aria-pressed', 'true');
  await bubble.getByTestId('fmt-h2').click();
  await expect(page.getByTestId('memo-editor').locator('h2')).toHaveText('论比喻的写法');
  await bubble.getByTestId('fmt-quote').click();
  await expect(page.getByTestId('memo-editor').locator('blockquote')).toContainText('论比喻的写法');
  await page.keyboard.press('End');
  await expect(bubble).toBeHidden();
  await page.getByTestId('memo-editor').locator('.anchor-chip').click({ modifiers: ['Alt'] });
  await expect(bubble).toBeHidden();
});

test('a memo from another article has its own tab colour and names its article (spec §6.11)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await importText(page, '秋', '秋水共长天一色。');
  const foreign = page.locator('.memo-tab.foreign');
  await expect(foreign).toHaveCount(1);
  await expect(foreign).toHaveAttribute('title', /春/);
  await page.getByTestId('memo-new').click();
  await expect(page.locator('.memo-tab:not(.foreign)')).toHaveCount(1);
  const strip = await page.getByTestId('memo-tabs').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await foreign.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(strip);
});
```
Also add `selectText` to that spec's `./helpers` import if it isn't there.

The chip click uses Alt: a plain click on a chip follows the link (plan 3). With Alt the chip is only selected (a node selection), where the bubble must not appear. If Alt+click also follows the link in this build, record a ruling and select the chip with the keyboard instead (ArrowLeft from after it).

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e memo-bar --project chromium --timeout 20000 -g "formatting|tab colour"`
Expected: FAIL: there is no `memo-bubble`, and no `.memo-tab.foreign`.

- [ ] **Step 3: Implement**

`apps/client/src/memo/MemoBubbleMenu.tsx`:
```tsx
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useTranslation } from 'react-i18next';

interface Item {
  key: string;
  label:
    | 'memo.fmtBold' | 'memo.fmtItalic' | 'memo.fmtStrike' | 'memo.fmtH1' | 'memo.fmtH2' | 'memo.fmtH3'
    | 'memo.fmtBullet' | 'memo.fmtOrdered' | 'memo.fmtQuote';
  text: string;
  run(editor: Editor): void;
  active(editor: Editor): boolean;
}

const ITEMS: readonly Item[] = [
  { key: 'bold', label: 'memo.fmtBold', text: 'B', run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
  { key: 'italic', label: 'memo.fmtItalic', text: 'I', run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
  { key: 'strike', label: 'memo.fmtStrike', text: 'S', run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive('strike') },
  { key: 'h1', label: 'memo.fmtH1', text: 'H1', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive('heading', { level: 1 }) },
  { key: 'h2', label: 'memo.fmtH2', text: 'H2', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive('heading', { level: 2 }) },
  { key: 'h3', label: 'memo.fmtH3', text: 'H3', run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive('heading', { level: 3 }) },
  { key: 'bullet', label: 'memo.fmtBullet', text: '•', run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') },
  { key: 'ordered', label: 'memo.fmtOrdered', text: '1.', run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') },
  { key: 'quote', label: 'memo.fmtQuote', text: '❝', run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive('blockquote') },
];

/** Formatting for a text selection in a memo (spec §6.11); not for a selected link chip. */
export function MemoBubbleMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const active = useEditorState({ editor, selector: ({ editor: e }) => ITEMS.map((item) => (e ? item.active(e) : false)) });
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ state }) => !state.selection.empty && !(state.selection instanceof NodeSelection)}
      className="bubble-menu"
      data-testid="memo-bubble"
    >
      {ITEMS.map((item, i) => (
        <button
          key={item.key}
          type="button"
          className={active[i] ? 'active' : undefined}
          aria-pressed={active[i]}
          aria-label={t(item.label)}
          title={t(item.label)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => item.run(editor)}
          data-testid={`fmt-${item.key}`}
        >
          {item.text}
        </button>
      ))}
    </BubbleMenu>
  );
}
```

In `apps/client/src/memo/MemoEditor.tsx`:
- add `import { MemoBubbleMenu } from './MemoBubbleMenu';`;
- in `LoadedMemoEditor`'s JSX, directly after `<EditorContent editor={editor} />`, add `{editor && <MemoBubbleMenu editor={editor} />}`.

In `apps/client/src/components/MemoPane.tsx`:
1. Add `listArticles` to the `@jot/db` import.
2. After the `others` query, add:
```ts
  const articles = useLibraryQuery(listArticles, [], ['article']);
  const homeTitle = (m: MemoSummary) => articles.data?.find((a) => a.id === m.homeArticleId)?.title ?? null;
```
3. In the tab map, replace the opening `<span key={m.id} className={m.id === active?.id ? 'memo-tab active' : 'memo-tab'}>` with:
```tsx
          // A memo that doesn't belong to the open article gets its own tint and names its home (spec §6.11).
          <span
            key={m.id}
            className={['memo-tab', m.id === active?.id && 'active', articleId !== null && m.homeArticleId !== articleId && 'foreign'].filter(Boolean).join(' ')}
            title={
              articleId !== null && m.homeArticleId !== articleId
                ? homeTitle(m)
                  ? t('memo.fromArticle', { title: homeTitle(m) })
                  : t('memoList.noArticle')
                : undefined
            }
          >
```
   The map callback then needs a block body. Wrap the span in `(m) => (…)`; the comment goes above the span inside the parentheses as `{/* … */}` or before the arrow.

In `apps/client/src/i18n/en.ts`, in `memo`, add:
```ts
    fromArticle: 'From “{{title}}”',
    fmtBold: 'Bold',
    fmtItalic: 'Italic',
    fmtStrike: 'Strikethrough',
    fmtH1: 'Heading 1',
    fmtH2: 'Heading 2',
    fmtH3: 'Heading 3',
    fmtBullet: 'Bullet list',
    fmtOrdered: 'Numbered list',
    fmtQuote: 'Quote',
```
In `zh-CN.ts`, in `memo`, add:
```ts
    fromArticle: '来自《{{title}}》',
    fmtBold: '加粗',
    fmtItalic: '斜体',
    fmtStrike: '删除线',
    fmtH1: '一级标题',
    fmtH2: '二级标题',
    fmtH3: '三级标题',
    fmtBullet: '项目符号列表',
    fmtOrdered: '编号列表',
    fmtQuote: '引文',
```

In `apps/client/src/styles/app.css`:
- in `:root`, add `--tab-foreign: #dfe4ea;`; in the dark `:root`, add `--tab-foreign: #1d2733;`
- append:
```css
/* Memo formatting and foreign tabs (spec §6.11) */
.bubble-menu { display: flex; gap: 2px; padding: 4px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); }
.bubble-menu button { min-width: 28px; height: 28px; padding: 0 6px; font-size: 13px; background: none; border: none; border-radius: 6px; }
.bubble-menu button:hover { background: var(--panel); }
.bubble-menu button.active { color: var(--accent); background: var(--panel); }
.memo-tab.foreign { background: var(--tab-foreign); }
.memo-tab.foreign.active { background: var(--panel); box-shadow: inset 0 2px 0 var(--accent); }
.memo-tab.foreign > button:first-child { font-style: italic; }
```

- [ ] **Step 4: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: everything passes.

Restart the services (new dependency), then run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e memo-bar memo links suggest backlinks follow`
Expected: `memo-bar` passes 6 on each browser; the others pass.

- [ ] **Step 5: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "feat(client): a formatting bubble menu in memos, and tinted tabs for memos from another article"
```

---

### Task 5: Thin scrollbars that show on hover

**Files:**
- Modify: `apps/client/src/styles/app.css`, `apps/client/e2e/shell.spec.ts`
- Test: `apps/client/e2e/shell.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/client/e2e/shell.spec.ts`:
```ts
test('scrollbars are thin and show only while the pointer is over their area (spec §6.11)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit has no scrollbar-color; it gets the ::-webkit-scrollbar rules instead');
  await openApp(page);
  await importText(page, '长文', Array.from({ length: 80 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n'));
  const reader = page.locator('main.reader');
  const style = () => reader.evaluate((el) => [getComputedStyle(el).scrollbarWidth, getComputedStyle(el).scrollbarColor]);
  await page.locator('nav.sidebar').hover();
  const [width, idle] = await style();
  expect(width).toBe('thin');
  expect(idle).toMatch(/^rgba\(0, 0, 0, 0\)/);
  await reader.hover();
  expect((await style())[1]).not.toMatch(/^rgba\(0, 0, 0, 0\)/);
  await page.getByTestId('memo-new').click();
  for (const area of ['nav.sidebar', 'aside.memo', '[data-testid="memo-tabs"]']) {
    expect(await page.locator(area).evaluate((el) => getComputedStyle(el).scrollbarWidth), area).toBe('thin');
  }
});
```

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e shell --project chromium --timeout 20000 -g scrollbars`
Expected: FAIL: `scrollbarWidth` is `auto`.

- [ ] **Step 2: Implement**

In `apps/client/src/styles/app.css`:
- in `:root`, add `--scroll: rgba(0, 0, 0, 0.28);`; in the dark `:root`, add `--scroll: rgba(255, 255, 255, 0.28);`
- in the `.memo-tabs` rule, remove `scrollbar-width: thin;` (the rules below cover it);
- append:
```css
/* Scrollbars: thin and rounded, shown only while the pointer is over the area (spec §6.11) */
.sidebar, .reader, .memo, .memo-tabs { scrollbar-width: thin; scrollbar-color: transparent transparent; }
.sidebar:hover, .reader:hover, .memo:hover, .memo-tabs:hover { scrollbar-color: var(--scroll) transparent; }
.sidebar::-webkit-scrollbar, .reader::-webkit-scrollbar, .memo::-webkit-scrollbar { width: 8px; height: 8px; }
.memo-tabs::-webkit-scrollbar { height: 4px; }
.sidebar::-webkit-scrollbar-track, .reader::-webkit-scrollbar-track, .memo::-webkit-scrollbar-track, .memo-tabs::-webkit-scrollbar-track { background: transparent; }
.sidebar::-webkit-scrollbar-thumb, .reader::-webkit-scrollbar-thumb, .memo::-webkit-scrollbar-thumb, .memo-tabs::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
.sidebar:hover::-webkit-scrollbar-thumb, .reader:hover::-webkit-scrollbar-thumb, .memo:hover::-webkit-scrollbar-thumb, .memo-tabs:hover::-webkit-scrollbar-thumb { background: var(--scroll); }
```

- [ ] **Step 3: Run the tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e shell`
Expected: the new test passes on Chromium and is skipped on WebKit; the other shell tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/client
git commit -m "feat(client): thin rounded scrollbars that show on hover"
```

---

### Task 6: Plan 8 leftovers

**Files:**
- Modify:
  - `packages/db/src/articles.ts`, `packages/db/src/memos.ts`, `packages/db/src/trash.ts`
  - `packages/db/src/workspace.test.ts`, `packages/db/src/trash.test.ts`
  - `apps/client/src/components/Menu.tsx`, `MemoPane.tsx`, `ArticlePicker.tsx`, `SectionPages.tsx`, `ArticleDetailsDialog.tsx`, `Shell.tsx`, `Trash.tsx`
  - `apps/client/src/i18n/en.ts`, `zh-CN.ts`
  - `apps/client/src/styles/app.css`
  - `apps/client/e2e/article-bar.spec.ts`, `memo-bar.spec.ts`, `pages.spec.ts`
- Test: the files above

**Interfaces:**
- Produces:
  - `class MissingArticleError extends Error`, in `articles.ts`, thrown by `setMemoHome`;
  - `ArticlePicker` prop `excludeId?: string | null`;
  - i18n `memo.moveGone` and `page.pathJoin`;
  - `countTrash` is removed.

- [ ] **Step 1: Write the failing tests**

In `packages/db/src/workspace.test.ts`:
- add `MissingArticleError` to the `./articles` import;
- in 'refuses an article that is in the Trash', change `.rejects.toThrow('does not exist')` to `.rejects.toThrow(MissingArticleError)`;
- append to the 'updateArticleDetails, field by field' describe:
```ts
  it('two saves at once write once (a double Enter, Review Focus 5)', async () => {
    const lib = await open();
    const id = await article(lib, '春');
    const outbox = async () => Number((await lib.driver.query<{ n: number }>('SELECT count(*) AS n FROM outbox'))[0].n);
    const before = await outbox();
    const input = { title: '春之歌', author: '甲', source: null };
    await Promise.all([updateArticleDetails(lib, id, input), updateArticleDetails(lib, id, input)]);
    expect(await outbox()).toBe(before + 1);
  });
```

Append to `apps/client/e2e/article-bar.spec.ts`:
```ts
test('in fix mode the bar still hides on scrolling down; after a panel closes it hides again (review of plan 8)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', long(80));
  const bar = page.getByTestId('article-bar');
  const reader = page.locator('main.reader');
  await bar.getByTestId('reading-open').click();
  await page.keyboard.press('Escape');
  await reader.evaluate((el) => el.scrollBy(0, 600));
  await expect(bar).toHaveAttribute('data-shown', 'false');
  await reader.evaluate((el) => el.scrollTo(0, 0));
  await expect(bar).toHaveAttribute('data-shown', 'true');
  await startFixing(page);
  await reader.evaluate((el) => el.scrollBy(0, 600));
  await expect(bar).toHaveAttribute('data-shown', 'false');
});

test('a narrower line width narrows the text column (review of plan 8)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', long(10));
  const width = () => page.getByTestId('article-view').evaluate((el) => el.getBoundingClientRect().width);
  const before = await width();
  await page.getByTestId('article-bar').getByTestId('reading-open').click();
  await page.getByTestId('reading-width-down').click();
  expect(await width()).toBeLessThan(before - 40);
});
```

Append to `apps/client/e2e/memo-bar.spec.ts`:
```ts
test('a moved memo becomes an ordinary memo of its new article; the picker leaves out its current one (review of plan 8)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await importText(page, '秋', '秋水共长天一色。');
  await page.getByTestId('memo-menu').click();
  await page.getByTestId('memo-move').click();
  await expect(page.getByTestId('picker-item')).toHaveCount(1);
  await expect(page.getByTestId('picker-item')).toContainText('秋');
  await page.getByTestId('picker-item').click();
  await page.getByTestId('memo-new').click();
  await importText(page, '夏', '接天莲叶无穷碧。');
  await expect(page.getByTestId('memo-tab').filter({ hasText: 'Memo 1' })).toHaveCount(0);
});
```

Append to `apps/client/e2e/pages.spec.ts`:
```ts
test('a page opens at its top, not at the scroll position of the article before (review of plan 8)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', Array.from({ length: 80 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n'));
  const reader = page.locator('main.reader');
  await reader.evaluate((el) => el.scrollBy(0, 1500));
  await goTo(page, '#/library');
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBe(0);
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/workspace.test.ts`
Expected: FAIL: `MissingArticleError` isn't exported, and two concurrent saves write twice.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e article-bar memo-bar pages --project chromium --timeout 20000 -g "review of plan 8"`
Expected:
- 'in fix mode the bar still hides' FAILS (the bar stays pinned);
- 'a moved memo' FAILS (the picker lists 2, and Memo 1 is carried);
- 'a page opens at its top' FAILS;
- the width test passes already (a missing test, not a bug).

- [ ] **Step 2: Implement**

In `packages/db/src/articles.ts`:
1. After `EmptyTitleError`, add:
```ts
export class MissingArticleError extends Error {
  constructor(id: string) {
    super(`Article ${id} does not exist`);
    this.name = 'MissingArticleError';
  }
}
```
2. In `updateArticleDetails`, wrap everything after the empty-title check in `await lib.lock.run(async () => { … });` (read and write under the lock, so a second save sees the first). Keep `if (!title) throw new EmptyTitleError();` before it.

In `packages/db/src/memos.ts`:
- import `MissingArticleError` from `./articles`;
- in `setMemoHome`, replace `throw new Error(\`Article ${articleId} does not exist\`);` with `throw new MissingArticleError(articleId);`.

In `packages/db/src/trash.ts`, delete `countTrash`. In `packages/db/src/trash.test.ts`, remove it from the import and replace `expect(await countTrash(lib)).toBe(1);` with `expect(await listTrash(lib)).toHaveLength(1);`, and `expect(await countTrash(lib)).toBe(0);` with `expect(await listTrash(lib)).toEqual([]);`.

In `apps/client/src/components/Menu.tsx`, after the `changed.current = onOpenChange;` line, add:
```ts
  // A menu removed while open (Fix text hides the article menu) reports itself closed.
  useEffect(() => () => changed.current?.(false), []);
```

In `apps/client/src/components/ArticlePicker.tsx`:
- add `excludeId?: string | null;` to `Props`, and destructure it;
- change the `shown` filter's first condition to `(a) => a.id !== excludeId && (!q || …)`.

In `apps/client/src/components/MemoPane.tsx`:
1. Import `MissingArticleError` from `@jot/db`.
2. Replace `moveTo` with:
```ts
  // The moved memo becomes a home memo of that article: it shows among its tabs, not as a carried tab (spec §6.10).
  const moveTo = async (memo: MemoSummary, target: string) => {
    try {
      await setMemoHome(lib, memo.id, target);
    } catch (error) {
      reportError(error instanceof MissingArticleError ? new Error(t('memo.moveGone')) : error);
      return;
    }
    setOpenIds((ids) => ids.filter((id) => id !== memo.id));
    lastActive.current = { ...memo, homeArticleId: target };
    setActiveId(memo.id);
    if (target !== articleId) navigate({ name: 'article', id: target });
  };
```
3. Pass `excludeId={moving.homeArticleId}` to its `<ArticlePicker>`, and change `onPick={(target) => void moveTo(moving, target).catch(reportError)}` to `onPick={(target) => void moveTo(moving, target)}`.

In `apps/client/src/components/SectionPages.tsx`:
- import `MissingArticleError`;
- in `MemosPage`'s picker, pass `excludeId={moving.homeArticleId}`, and use `onPick={(target) => void setMemoHome(lib, moving.id, target).catch((error: unknown) => reportError(error instanceof MissingArticleError ? new Error(t('memo.moveGone')) : error))}`;
- in `TagsPage`, replace `.join('；')` with `.join(t('page.pathJoin'))`.

In `apps/client/src/components/ArticleDetailsDialog.tsx`:
- add `const [saving, setSaving] = useState(false);`;
- in `submit`, return early `if (saving) return;`, and set `setSaving(true)` before the `try` and `setSaving(false)` in a `finally`;
- give the save button `disabled={saving}`.

In `apps/client/src/components/Shell.tsx`:
- add `useLayoutEffect` to the react import, and `const readerRef = useRef<HTMLElement>(null);` with the other state;
- change `<main className="reader">` to `<main className="reader" ref={readerRef}>`;
- add:
```ts
  // Every screen opens at its top, not at the previous screen's scroll position.
  const routeKey = route.name === 'article' ? `article:${route.id}` : route.name;
  useLayoutEffect(() => {
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, [routeKey]);
```

In `apps/client/src/components/Trash.tsx`, change the TrashButton comment to `/** The Trash button at the bottom of the sidebar (spec §6.10: no count). */`.

In `apps/client/src/styles/app.css`, delete the line `/* The column's own heading only: headings written inside a memo have their own scale. */`.

In `apps/client/src/i18n/en.ts`:
- in `memo`, add `moveGone: 'That article is no longer in the library.',`;
- in `page`, add `pathJoin: ', ',`.

In `apps/client/src/i18n/zh-CN.ts`:
- in `memo`, add `moveGone: '那篇文章已不在文库中。',`;
- in `page`, add `pathJoin: '；',`.

- [ ] **Step 3: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db && pnpm test && pnpm typecheck && pnpm lint'`
Expected: everything passes.

Restart the services (packages changed), then run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e article-bar memo-bar pages trash edit`
Expected: everything passes, with the known skips.

- [ ] **Step 4: Commit**

```bash
git add packages/db apps/client
git commit -m "fix: plan 8 leftovers: the bar unpins after fix text, moved memos, a missing article, one save per double Enter, pages open at the top"
```

---

### Task 7: Docs and the full verification

**Files:** `README.md`

- [ ] **Step 1: README**

In `README.md`, in "## Working in Jot", add after the second bullet:
```markdown
- **Aa → Text styles** picks an English and a Chinese typeface (English ones are bundled; Chinese ones are your
  computer's), the font size, line spacing and line width. Selecting text in a memo shows a formatting bar.
- **+** next to Memos creates a memo that belongs to no article. A memo from another article shows a tinted tab.
```

- [ ] **Step 2: Run the complete verification**

Run:
```bash
docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test'
docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'
docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright
until docker compose exec -T web node -e "require('net').connect(3000,'localhost').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; do sleep 2; done
until docker compose exec -T web node -e "fetch('http://localhost:5173/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; do sleep 2; done
docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e
```
Expected: every command exits 0. The e2e run has no failures, and the only skips are the known WebKit ones plus the new Chromium-only scrollbar test.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: text styles, memo formatting and standalone memos"
```

---

## Done when

- **Text styles:** English and Chinese typefaces with previews, font size, line spacing and named widths. Plan 8's settings carry over, and the panel is usable in a narrow memo column.
- **Menus from the keyboard:** ☰ menus take arrow keys, and Text styles takes focus.
- **Sidebar:**
  - empty sections are quiet and aligned;
  - tags line up with articles;
  - Memos has a **+** for standalone memos;
  - folded trailing sections dock at the bottom.
- **Scrollbars** are thin and show on hover.
- **Memo column:** a bubble menu formats the text, and tabs of memos from another article are tinted and named.
- **Plan 8's leftovers are resolved.**
- **Tests:** `pnpm typecheck && pnpm lint && pnpm test` and `cargo test` pass, and the e2e suite passes on Chromium and WebKit.
