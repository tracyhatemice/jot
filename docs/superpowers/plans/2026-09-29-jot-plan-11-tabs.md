# Plan 11: Article tabs, preview tabs and proportional columns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the article column a tab strip with one VS Code–style preview tab, give memos opened from elsewhere the same preview logic, make the article, side-note and memo columns keep their proportions as the window changes, and in narrow windows turn side notes into icons and then let the memo column float in from the right edge.

**Architecture:** A small pure tab model (`tabs/tabs.ts`: open, keep, close, retain, parse) is shared by the article strip and the memo column; both keep their tabs in localStorage. The route still names the active article; a hook turns route changes into tab changes. Column widths come from one pure function (`layout/columns.ts`) fed by the measured space right of the sidebar and a stored memo share; the same function decides when side notes become icons and when the memo column floats, and the shell hands its decisions to the article pane through a small context. No new dependencies, no data or sync changes.

**Tech Stack:** React 19, TypeScript, ProseMirror decorations, plain CSS, Vitest, Playwright e2e (Chromium + WebKit) in Docker.

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` §6.13 (M14, acceptance step 9). Where it differs it replaces §6.5, §6.10 and §6.11 for the article and memo columns.

## Global Constraints

- Everything runs in Docker; nothing is installed on the host (host Node 18 stays untouched).
- Unit tests for one file: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run <path>'` (run from the repo root; `pnpm --filter @jot/client exec vitest` hangs).
- Unit, typecheck and lint: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`.
- E2E: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e <spec> [--project chromium] [-g pattern] [--retries 0]`. If Vite misses new files, restart `web` and recreate `playwright` (`docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright`) and wait for ports 5173 and 3000.
- Conventional commit messages, no attribution lines.
- Every new string goes into both `apps/client/src/i18n/en.ts` and `zh-CN.ts` with identical structure (`i18n.test.ts` checks it). Chinese terms: 文章 article, 札记 memo, 旁注 side note, 关闭 close.
- React runs in StrictMode: every effect must be safe to run twice.
- Animations are about 0.2 s ease and none under `prefers-reduced-motion: reduce`.
- Chinese letters never slant (review M4: `font-synthesis-style: none` wherever italics are used).
- Test titles use typographic apostrophes (’), never straight ones.
- Playwright's default viewport is 1280×720; the sidebar is 260 px wide, 44 px collapsed; the memo divider is 6 px.

**Rulings made while planning (the product owner reviews them with the plan):**
- *Preview cue.* The spec says the preview tab's title is in italics. Chinese titles never slant (review M4), and memo tabs from other articles are already italic, so italics alone would not show a preview. A preview tab's title is set in italics **and dimmed** (opacity 0.72), which shows on Chinese titles and on foreign memo tabs.
- *Section-page rows.* A click on a Library or Memos page row replaces the page, so the second click of a double-click would land on the article. On those pages a single click waits 300 ms for a possible second click before opening; the sidebar, which stays in place, opens at once.
- *Side-note column width.* The spec says "a third of the article column (240 px in a 1280 px window)"; those two numbers disagree (a third of the 676 px column is 225 px). The plan keeps the 240 px: the column is 36 % of the article column (243 px at 1280 px).
- *Coming back to a tab* shows the article where the writer left it (for this session). The spec is silent; see Review Focus 1.

## Review Focus

1. Going back to an article's tab shows the article where the writer left it, not scrolled to the top (Task 4 test).
2. Escape inside the floating memo column first closes what is open there (the `[[` list), and only a second Escape slides the column out (Task 8 test).
3. A side note being typed when the window narrows keeps its text, which then shows in its icon's card (Task 7 test).
4. Stored tab lists that are malformed, repeat an id, or name articles or memos that are gone load as a clean list without errors (Task 1 unit test, Task 2 e2e test).
5. Dragging the divider can't make the article column narrower than 400 px, so a drag never makes the memo column float (Task 6 unit and e2e tests).

---

### Task 1: The tab model

**Files:**
- Create: `apps/client/src/tabs/tabs.ts`
- Create: `apps/client/src/tabs/useStoredTabs.ts`
- Test: `apps/client/src/tabs/tabs.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Tab { id: string; preview: boolean }`
  - `openTab(tabs: Tab[], id: string, after: string | null): Tab[]`
  - `keepTab(tabs: Tab[], id: string): Tab[]`
  - `closeTab(tabs: Tab[], id: string): Tab[]`
  - `tabAfterClose(tabs: readonly Tab[], id: string): string | null`
  - `retainTabs(tabs: Tab[], keep: (id: string) => boolean): Tab[]`
  - `parseTabs(raw: string | null): Tab[]`
  - Each returns the same `tabs` array when nothing changes, so React skips the update.
  - `useStoredTabs(key: string): [Tab[], Dispatch<SetStateAction<Tab[]>>]`

- [ ] **Step 1: Write the failing tests** — create `apps/client/src/tabs/tabs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { closeTab, keepTab, openTab, parseTabs, retainTabs, tabAfterClose, type Tab } from './tabs';

const kept = (id: string): Tab => ({ id, preview: false });
const preview = (id: string): Tab => ({ id, preview: true });

describe('openTab', () => {
  it('switches to a tab the id already has, kept or preview, and changes nothing', () => {
    const tabs = [kept('a'), preview('b')];
    expect(openTab(tabs, 'a', 'b')).toBe(tabs);
    expect(openTab(tabs, 'b', 'a')).toBe(tabs);
  });

  it('shows a new id in the preview tab, in that tab’s place', () => {
    expect(openTab([kept('a'), preview('b'), kept('c')], 'd', 'c')).toEqual([kept('a'), preview('d'), kept('c')]);
  });

  it('with no preview tab, adds one right after the given tab, or at the end', () => {
    expect(openTab([kept('a'), kept('b')], 'c', 'a')).toEqual([kept('a'), preview('c'), kept('b')]);
    expect(openTab([kept('a'), kept('b')], 'c', null)).toEqual([kept('a'), kept('b'), preview('c')]);
    expect(openTab([kept('a')], 'c', 'gone')).toEqual([kept('a'), preview('c')]);
    expect(openTab([], 'a', null)).toEqual([preview('a')]);
  });
});

describe('keepTab', () => {
  it('turns the preview tab into a kept one', () => {
    expect(keepTab([kept('a'), preview('b')], 'b')).toEqual([kept('a'), kept('b')]);
  });

  it('leaves a kept tab alone, and adds a missing one at the end', () => {
    const tabs = [kept('a')];
    expect(keepTab(tabs, 'a')).toBe(tabs);
    expect(keepTab(tabs, 'b')).toEqual([kept('a'), kept('b')]);
  });
});

describe('closing a tab', () => {
  it('shows the right-hand neighbour, else the left-hand one, else nothing', () => {
    const tabs = [kept('a'), kept('b'), kept('c')];
    expect(tabAfterClose(tabs, 'b')).toBe('c');
    expect(tabAfterClose(tabs, 'c')).toBe('b');
    expect(tabAfterClose([kept('a')], 'a')).toBeNull();
    expect(tabAfterClose(tabs, 'x')).toBeNull();
    expect(closeTab(tabs, 'b')).toEqual([kept('a'), kept('c')]);
    expect(closeTab(tabs, 'x')).toBe(tabs);
  });
});

describe('retainTabs', () => {
  it('drops the tabs of ids that are gone, and returns the same list when none are', () => {
    const tabs = [kept('a'), preview('b')];
    expect(retainTabs(tabs, (id) => id !== 'b')).toEqual([kept('a')]);
    expect(retainTabs(tabs, () => true)).toBe(tabs);
  });
});

describe('parseTabs (Review Focus 4)', () => {
  it('reads back what was stored', () => {
    expect(parseTabs(JSON.stringify([kept('a'), preview('b')]))).toEqual([kept('a'), preview('b')]);
  });

  it('drops malformed storage and entries, repeated ids and a second preview tab', () => {
    expect(parseTabs(null)).toEqual([]);
    expect(parseTabs('{not json')).toEqual([]);
    expect(parseTabs('{"id":"a"}')).toEqual([]);
    expect(parseTabs(JSON.stringify([kept('a'), { id: 3 }, null, 'b', { id: '' }, kept('a'), preview('c'), preview('d')]))).toEqual([
      kept('a'),
      preview('c'),
      kept('d'),
    ]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/tabs/tabs.test.ts'`
Expected: FAIL — `Failed to resolve import "./tabs"`.

- [ ] **Step 3: Write the model** — create `apps/client/src/tabs/tabs.ts`:

```ts
/** An open tab: an article's or a memo's id, and whether it is the preview tab (spec §6.13). */
export interface Tab {
  id: string;
  preview: boolean;
}

/**
 * Opens `id`. A tab it already has stays as it is. Otherwise it takes the preview tab's place, or, with no preview
 * tab, comes in as a new preview tab right after `after` (at the end when `after` is null or has no tab).
 */
export function openTab(tabs: Tab[], id: string, after: string | null): Tab[] {
  if (tabs.some((t) => t.id === id)) return tabs;
  const preview = tabs.findIndex((t) => t.preview);
  if (preview >= 0) return tabs.map((t, i) => (i === preview ? { id, preview: true } : t));
  const at = after === null ? -1 : tabs.findIndex((t) => t.id === after);
  const next = [...tabs];
  next.splice(at >= 0 ? at + 1 : tabs.length, 0, { id, preview: true });
  return next;
}

/** Makes `id` a kept tab, adding it at the end when it has no tab. */
export function keepTab(tabs: Tab[], id: string): Tab[] {
  const at = tabs.findIndex((t) => t.id === id);
  if (at < 0) return [...tabs, { id, preview: false }];
  if (!tabs[at].preview) return tabs;
  return tabs.map((t, i) => (i === at ? { id, preview: false } : t));
}

/** Removes `id`'s tab. */
export function closeTab(tabs: Tab[], id: string): Tab[] {
  return tabs.some((t) => t.id === id) ? tabs.filter((t) => t.id !== id) : tabs;
}

/** The tab shown after closing `id`'s: its right-hand neighbour, else its left-hand one, else none. */
export function tabAfterClose(tabs: readonly Tab[], id: string): string | null {
  const at = tabs.findIndex((t) => t.id === id);
  if (at < 0) return null;
  return tabs[at + 1]?.id ?? tabs[at - 1]?.id ?? null;
}

/** Keeps only the tabs `keep` accepts, e.g. those of articles that still exist. */
export function retainTabs(tabs: Tab[], keep: (id: string) => boolean): Tab[] {
  return tabs.every((t) => keep(t.id)) ? tabs : tabs.filter((t) => keep(t.id));
}

/** Tabs read back from storage: anything malformed is dropped; each id once, and at most one preview tab. */
export function parseTabs(raw: string | null): Tab[] {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const tabs: Tab[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, preview } = item as { id?: unknown; preview?: unknown };
    if (typeof id !== 'string' || id === '' || tabs.some((t) => t.id === id)) continue;
    tabs.push({ id, preview: preview === true && !tabs.some((t) => t.preview) });
  }
  return tabs;
}
```

- [ ] **Step 4: Write the storage hook** — create `apps/client/src/tabs/useStoredTabs.ts`:

```ts
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { parseTabs, type Tab } from './tabs';

/** Open tabs kept in localStorage, this device's view (spec §6.13); they last for the session when storage is blocked. */
export function useStoredTabs(key: string): [Tab[], Dispatch<SetStateAction<Tab[]>>] {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      return parseTabs(localStorage.getItem(key));
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(tabs));
    } catch {
      // storage blocked: keep the tabs for this session only
    }
  }, [key, tabs]);
  return [tabs, setTabs];
}
```

- [ ] **Step 5: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/tabs/tabs.test.ts'`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/tabs
git commit -m "feat(client): a tab model with one preview tab, stored per device"
```

---

### Task 2: The article tab strip

**Files:**
- Create: `apps/client/src/components/useTabStrip.ts`
- Create: `apps/client/src/components/ArticleTabs.tsx`
- Create: `apps/client/src/tabs/useArticleTabs.ts`
- Modify: `apps/client/src/components/MemoPane.tsx` (use `useTabStrip` instead of its two strip effects)
- Modify: `apps/client/src/components/Shell.tsx` (the hook; the strip at the top of `main.reader`; `.article-tabs` in the scroll listener)
- Modify: `apps/client/src/styles/app.css`
- Modify: `apps/client/src/i18n/en.ts`, `apps/client/src/i18n/zh-CN.ts`
- Test: `apps/client/e2e/tabs.spec.ts` (new)

**Interfaces:**
- Consumes (Task 1): `Tab`, `openTab`, `keepTab`, `closeTab`, `tabAfterClose`, `retainTabs`, `useStoredTabs`.
- Produces:
  - `useTabStrip(strip: RefObject<HTMLElement | null>, activeSelector: string, activeKey: unknown, count: number): void`
  - `useArticleTabs(activeId: string | null): { tabs: Tab[]; titles: ReadonlyMap<string, string>; keep(id: string): void; close(id: string): void }`, which Task 3 passes as `keep`.
  - localStorage key `jot.articleTabs`.
  - Test ids: `article-tabs`, `article-tab` (the tab's span, with classes `active` and `preview`), `article-tab-close`, `article-tabs-thumb`.
  - i18n `tabs.label`, `tabs.close`.

- [ ] **Step 1: Write the failing tests** — create `apps/client/e2e/tabs.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { deleteArticle, importText, openApp } from './helpers';

const tabs = (page: Page) => page.getByTestId('article-tab');
const tab = (page: Page, title: string) => tabs(page).filter({ has: page.getByRole('tab', { name: title, exact: true }) });
const titles = (page: Page) => tabs(page).getByRole('tab').allTextContents();
const fromSidebar = (page: Page, title: string) => page.getByTestId('library-list').getByRole('link', { name: title, exact: true }).click();

test('articles open in one preview tab, slanted and dimmed, which the next opened article replaces (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await importText(page, '秋', '秋水共长天一色。');
  await expect(tabs(page)).toHaveCount(1);
  await expect(tab(page, '秋')).toHaveClass(/preview/);
  await fromSidebar(page, '春');
  await expect(page.getByTestId('article-title')).toHaveText('春');
  expect(await titles(page)).toEqual(['春']);
  await expect(tab(page, '春').getByRole('tab')).toHaveAttribute('aria-selected', 'true');
  const look = await tab(page, '春').getByRole('tab').evaluate((el) => ({ style: getComputedStyle(el).fontStyle, opacity: Number(getComputedStyle(el).opacity) }));
  expect(look.style).toBe('italic');
  expect(look.opacity).toBeLessThan(0.9);
});

test('double-clicking the preview tab keeps it; the next article gets its own preview tab after the active one (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await tab(page, '春').getByRole('tab').dblclick();
  await expect(tab(page, '春')).not.toHaveClass(/preview/);
  await importText(page, '秋', '秋水共长天一色。');
  expect(await titles(page)).toEqual(['春', '秋']);
  await expect(tab(page, '秋')).toHaveClass(/preview/);
  await tab(page, '春').getByRole('tab').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
  await expect(tab(page, '春')).toHaveClass(/active/);
  await importText(page, '冬', '冬雪压青松。');
  expect(await titles(page)).toEqual(['春', '冬']);
});

test('a section page shows the strip with no tab active; clicking a tab goes back to its article (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('section-library-open').click();
  await expect(page.getByTestId('library-page')).toBeVisible();
  await expect(tabs(page)).toHaveCount(1);
  await expect(page.getByTestId('article-tabs').getByRole('tab', { selected: true })).toHaveCount(0);
  await tab(page, '春').getByRole('tab').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
});

test('closing a tab shows its right-hand neighbour, else the left-hand one; closing the last empties the column (spec §6.13)', async ({ page }) => {
  await openApp(page);
  for (const [title, text] of [['春', '春风又绿江南岸。'], ['秋', '秋水共长天一色。'], ['冬', '冬雪压青松。']]) {
    await importText(page, title, text);
    await tab(page, title).getByRole('tab').dblclick();
  }
  await tab(page, '秋').getByRole('tab').click();
  await tab(page, '秋').getByTestId('article-tab-close').click();
  await expect(page.getByTestId('article-title')).toHaveText('冬');
  await tab(page, '冬').getByTestId('article-tab-close').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
  await tab(page, '春').getByTestId('article-tab-close').click();
  await expect(page.getByTestId('article-tabs')).toHaveCount(0);
  await expect(page.locator('main.reader > p.empty')).toBeVisible();
});

test('moving an article to the Trash closes its tab; restoring it doesn’t reopen it (spec §6.13)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await tab(page, '春').getByRole('tab').dblclick();
  await importText(page, '秋', '秋水共长天一色。');
  await deleteArticle(page, '秋');
  await expect.poll(() => titles(page)).toEqual(['春']);
  await page.getByTestId('trash-open').click();
  await page.getByTestId('trash-entry').getByTestId('trash-restore').click();
  await expect(page.getByTestId('trash-entry')).toHaveCount(0);
  expect(await titles(page)).toEqual(['春']);
});

test('open tabs and the preview are remembered after a reload; a tab of an article that is gone drops out (spec §6.13, Review Focus 4)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await openApp(page, { memory: false });
  await importText(page, '春', '春风又绿江南岸。');
  await tab(page, '春').getByRole('tab').dblclick();
  await importText(page, '秋', '秋水共长天一色。');
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('jot.articleTabs') ?? '[]') as unknown[];
    localStorage.setItem('jot.articleTabs', JSON.stringify([...stored, { id: 'no-such-article', preview: false }, 'junk']));
  });
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => titles(page)).toEqual(['春', '秋']);
  await expect(tab(page, '秋')).toHaveClass(/preview/);
  await expect(tab(page, '春')).not.toHaveClass(/preview/);
});

test('the tab strip scrolls sideways under the wheel and hides the system scroll bar (spec §6.13)', async ({ page, browserName }) => {
  await openApp(page);
  for (let i = 0; i < 12; i++) {
    await importText(page, `一篇很长的文章标题 ${i}`, `第${i}篇。`);
    await tab(page, `一篇很长的文章标题 ${i}`).getByRole('tab').dblclick();
  }
  const strip = page.getByTestId('article-tabs');
  await strip.evaluate((el) => el.scrollTo({ left: 0 }));
  await strip.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  if (browserName === 'chromium') expect(await strip.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none');
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tabs --retries 0`
Expected: FAIL, all 7 tests — `getByTestId('article-tab')` resolves to 0 elements (`toHaveCount(1)` fails, or `dblclick` times out).

- [ ] **Step 3: Extract the strip behaviour** — create `apps/client/src/components/useTabStrip.ts`:

```ts
import { useEffect, type RefObject } from 'react';

/**
 * A tab strip's scrolling (spec §6.10, §6.13): the active tab scrolls into view when it changes or tabs come and go,
 * and a plain mouse wheel scrolls the strip sideways.
 */
export function useTabStrip(strip: RefObject<HTMLElement | null>, activeSelector: string, activeKey: unknown, count: number): void {
  useEffect(() => {
    strip.current?.querySelector(activeSelector)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [strip, activeSelector, activeKey, count]);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
}
```

In `MemoPane.tsx`, import it (`import { useTabStrip } from './useTabStrip';`) and replace the two effects that begin `// The active tab scrolls into view in the strip, clear of the + at its end.` and `// A plain mouse wheel scrolls the tab strip sideways.` with:

```ts
  // The active tab scrolls into view in the strip, clear of the + at its end; the wheel scrolls it sideways.
  useTabStrip(stripRef, '.memo-tab.active', active?.id, tabs.length);
```

- [ ] **Step 4: Write the tabs hook** — create `apps/client/src/tabs/useArticleTabs.ts`:

```ts
import { listArticles } from '@jot/db';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLibraryQuery } from '../data/LibraryContext';
import { navigate } from '../router';
import { closeTab, keepTab, openTab, retainTabs, tabAfterClose, type Tab } from './tabs';
import { useStoredTabs } from './useStoredTabs';

export interface ArticleTabs {
  tabs: Tab[];
  titles: ReadonlyMap<string, string>;
  keep(id: string): void;
  close(id: string): void;
}

/**
 * The open article tabs (spec §6.13). The route names the active article: opening one gives it a tab, the preview tab
 * unless it has one already. Tabs of articles that are gone (in the Trash, erased) drop out; the shown article keeps
 * its tab while the library list catches up with an import.
 */
export function useArticleTabs(activeId: string | null): ArticleTabs {
  const [tabs, setTabs] = useStoredTabs('jot.articleTabs');
  const { data: articles } = useLibraryQuery(listArticles, [], ['article']);
  // The article shown before this one: a new preview tab goes right after its tab.
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (activeId) setTabs((t) => openTab(t, activeId, previous.current));
    previous.current = activeId;
  }, [activeId, setTabs]);

  useEffect(() => {
    if (!articles) return;
    const live = new Set(articles.map((a) => a.id));
    setTabs((t) => retainTabs(t, (id) => live.has(id) || id === activeId));
  }, [articles, activeId, setTabs]);

  const titles = useMemo(() => new Map((articles ?? []).map((a) => [a.id, a.title] as const)), [articles]);
  const keep = useCallback((id: string) => setTabs((t) => keepTab(t, id)), [setTabs]);
  const close = useCallback(
    (id: string) => {
      const next = tabAfterClose(tabs, id);
      setTabs((t) => closeTab(t, id));
      if (id === activeId) navigate(next ? { name: 'article', id: next } : { name: 'home' });
    },
    [tabs, activeId, setTabs],
  );
  return { tabs, titles, keep, close };
}
```

- [ ] **Step 5: Write the strip** — create `apps/client/src/components/ArticleTabs.tsx`:

```tsx
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../router';
import type { Tab } from '../tabs/tabs';
import { OverlayScrollbar } from './OverlayScrollbar';
import { useTabStrip } from './useTabStrip';

interface Props {
  tabs: Tab[];
  titles: ReadonlyMap<string, string>;
  activeId: string | null;
  onKeep(id: string): void;
  onClose(id: string): void;
}

/**
 * The article column's tab strip (spec §6.13): a tab per open article, at most one of them the preview tab, which the
 * next opened article replaces. Double-clicking the preview tab keeps it.
 */
export function ArticleTabs({ tabs, titles, activeId, onKeep, onClose }: Props) {
  const { t } = useTranslation();
  const stripRef = useRef<HTMLDivElement>(null);
  useTabStrip(stripRef, '.article-tab.active', activeId, tabs.length);
  if (tabs.length === 0) return null;
  return (
    <div className="article-tabs-bar">
      <div className="article-tabs" role="tablist" aria-label={t('tabs.label')} ref={stripRef} data-testid="article-tabs">
        {tabs.map((tab) => {
          const title = titles.get(tab.id) ?? '';
          const active = tab.id === activeId;
          return (
            <span key={tab.id} className={['article-tab', active && 'active', tab.preview && 'preview'].filter(Boolean).join(' ')} data-testid="article-tab">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={title}
                onClick={() => navigate({ name: 'article', id: tab.id })}
                onDoubleClick={() => onKeep(tab.id)}
              >
                {title}
              </button>
              <button type="button" className="icon" aria-label={t('tabs.close', { title })} title={t('tabs.close', { title })} onClick={() => onClose(tab.id)} data-testid="article-tab-close">
                ×
              </button>
            </span>
          );
        })}
      </div>
      <OverlayScrollbar axis="x" testId="article-tabs-thumb" />
    </div>
  );
}
```

- [ ] **Step 6: Put the strip in the shell** — in `Shell.tsx`:
  - Add imports `import { useArticleTabs } from '../tabs/useArticleTabs';` and `import { ArticleTabs } from './ArticleTabs';`.
  - After `const activeId = …`, add `const articleTabs = useArticleTabs(activeId);`.
  - Make `<ArticleTabs tabs={articleTabs.tabs} titles={articleTabs.titles} activeId={activeId} onKeep={articleTabs.keep} onClose={articleTabs.close} />` the first child of `<main className="reader" ref={readerRef}>`, before the route's content.
  - In the scroll listener, change `area.matches('.sidebar-scroll, .reader, .memo, .memo-tabs')` to `area.matches('.sidebar-scroll, .reader, .memo, .memo-tabs, .article-tabs')`.

- [ ] **Step 7: Style it** — in `app.css`, after the `.memo .column-bar` rule, add:

```css
/* The article column's tab strip (spec §6.13), like the memo column's; the article bar sits under it. */
.article-tabs-bar { position: sticky; top: 0; z-index: 9; }
.article-tabs { display: flex; align-items: stretch; height: 36px; overflow-x: auto; overflow-y: hidden; background: var(--tabs); }
.article-tab { display: inline-flex; align-items: stretch; flex: none; max-width: 200px; border-right: 1px solid var(--line); }
.article-tab > button:first-child { overflow: hidden; height: 100%; padding: 0 4px 0 12px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; background: none; border: none; border-radius: 0; }
.article-tab.active { background: var(--bg); }
.article-tab.active > button:first-child { color: var(--text); }
.article-tab .icon { padding: 0 8px; color: var(--muted); background: none; border: none; visibility: hidden; }
.article-tab.active .icon, .article-tab:hover .icon, .article-tab .icon:focus-visible { visibility: visible; }
/* The preview tab: slanted where the typeface has italics (Chinese stays upright, review M4) and dimmed, which also
   shows on a Chinese title. */
.article-tab.preview > button:first-child { font-style: italic; font-synthesis-style: none; opacity: 0.72; }
.article-tabs-bar + .article-pane { min-height: calc(100% - 36px); }
.article-tabs-bar ~ .article-pane .column-bar { top: 36px; }
```

Add `.article-tabs` to the rule that hides system scroll bars, which becomes `.sidebar-scroll, .sidebar-rail, .reader, .memo, .memo-tabs, .article-tabs { scrollbar-width: none; }`, and add `.article-tabs::-webkit-scrollbar` to its `::-webkit-scrollbar { display: none; }` list.

- [ ] **Step 8: Add the strings** — in `en.ts`, before `sidebar: {`, add:

```ts
  tabs: {
    label: 'Open articles',
    close: 'Close {{title}}',
  },
```

In `zh-CN.ts`, before `sidebar: {`, add:

```ts
  tabs: {
    label: '打开的文章',
    close: '关闭{{title}}',
  },
```

- [ ] **Step 9: Run the tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tabs --retries 0`
Expected: PASS, 13 (the persistence test is skipped on WebKit).

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: PASS, including `i18n.test.ts`.

Run the whole e2e suite: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e`
Expected: every earlier test still passes. A test that now fails because an article's title shows twice (on its tab and on the page) gets its locator scoped to the place it meant, e.g. `page.getByTestId('article-title')` or `page.getByTestId('library-list')`, never loosened to `.first()`.

- [ ] **Step 10: Commit**

```bash
git add apps/client/src apps/client/e2e/tabs.spec.ts
git commit -m "feat(client): the article column has a tab strip with one preview tab"
```

---

### Task 3: Keeping a tab from the sidebar and the Library page

**Files:**
- Create: `apps/client/src/components/useRowOpen.ts`
- Modify: `apps/client/src/components/Sidebar.tsx` (prop `onKeepArticle`; double-click on a library row)
- Modify: `apps/client/src/components/SectionPages.tsx` (`LibraryPage` prop `onKeep`; rows open through `useRowOpen`)
- Modify: `apps/client/src/components/Shell.tsx` (pass `articleTabs.keep`)
- Test: `apps/client/e2e/tabs.spec.ts`

**Interfaces:**
- Consumes (Task 2): `useArticleTabs(...).keep(id: string): void`.
- Produces:
  - `useRowOpen(): (event: ReactMouseEvent, open: () => void, keep: () => void) => void`, which Task 5 uses for Memos page rows.
  - `ROW_DOUBLE_CLICK_MS = 300`.

- [ ] **Step 1: Write the failing test** — add to `tabs.spec.ts`:

```ts
test('double-clicking an article in the sidebar or on the Library page keeps its tab; a single click opens a preview (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await importText(page, '秋', '秋水共长天一色。');
  await page.getByTestId('library-list').getByRole('link', { name: '春', exact: true }).dblclick();
  await expect(page.getByTestId('article-title')).toHaveText('春');
  await expect(tab(page, '春')).not.toHaveClass(/preview/);
  await page.getByTestId('section-library-open').click();
  const row = (title: string) => page.getByTestId('library-page').getByTestId('row-main').filter({ hasText: title });
  await row('秋').dblclick();
  await expect(page.getByTestId('article-title')).toHaveText('秋');
  expect(await titles(page)).toEqual(['春', '秋']);
  await expect(tab(page, '秋')).not.toHaveClass(/preview/);
  await importText(page, '冬', '冬雪压青松。');
  await page.getByTestId('section-library-open').click();
  await row('春').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
  expect(await titles(page)).toEqual(['春', '秋', '冬']);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tabs --retries 0 -g "sidebar or on the Library page"`
Expected: FAIL — `tab(page, '春')` still has the class `preview`.

- [ ] **Step 3: Write the row hook** — create `apps/client/src/components/useRowOpen.ts`:

```ts
import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';

/** How long a click on a section page's row waits for a second click, which keeps the tab it opens (spec §6.13). */
export const ROW_DOUBLE_CLICK_MS = 300;

/**
 * Opening a section page's row replaces the page, so the second click of a double-click would land on what opened:
 * a single click waits a moment before opening, and a double click opens and keeps. A keyboard click opens at once;
 * a modified or middle click is left to the browser.
 */
export function useRowOpen(): (event: ReactMouseEvent, open: () => void, keep: () => void) => void {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useCallback((event: ReactMouseEvent, open: () => void, keep: () => void) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.clearTimeout(timer.current);
    if (event.detail === 0) {
      open();
    } else if (event.detail >= 2) {
      open();
      keep();
    } else {
      timer.current = window.setTimeout(open, ROW_DOUBLE_CLICK_MS);
    }
  }, []);
}
```

- [ ] **Step 4: Wire the sidebar and the Library page**
  - **`Sidebar.tsx`:**
    - Add to `SidebarProps`: `/** Keeps an article's tab (a double click on its row, spec §6.13). */ onKeepArticle(id: string): void;`.
    - Destructure `onKeepArticle` in `Sidebar(...)`.
    - Change the library row's link to `<a href={routeHash({ name: 'article', id: a.id })} onDoubleClick={() => onKeepArticle(a.id)}>{a.title}</a>`.
  - **`SectionPages.tsx`:**
    - Import `useRowOpen` from `./useRowOpen`.
    - Change `export function LibraryPage()` to `export function LibraryPage({ onKeep }: { onKeep(id: string): void })`.
    - Add `const rowOpen = useRowOpen();` after `const lib = useLibrary();`.
    - Give the row's `<a className="page-row-main" …>` the handler `onClick={(e) => rowOpen(e, () => navigate({ name: 'article', id: a.id }), () => onKeep(a.id))}`.
  - **`Shell.tsx`:** pass `onKeepArticle={articleTabs.keep}` to `<Sidebar …/>`, and render `<LibraryPage onKeep={articleTabs.keep} />`.

- [ ] **Step 5: Run the tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tabs pages sidebar --retries 0`
Expected: PASS (the pages tests still open articles from Library page rows with a single click).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src apps/client/e2e/tabs.spec.ts
git commit -m "feat(client): double-clicking an article in the sidebar or on the Library page keeps its tab"
```

---

### Task 4: Each article tab keeps its place

**Files:**
- Modify: `apps/client/src/components/Shell.tsx` (remember the reader's scroll per article; hand it to the pane)
- Modify: `apps/client/src/components/ArticlePane.tsx` (prop `place`; restore once the text is laid out)
- Test: `apps/client/e2e/tabs.spec.ts`

**Interfaces:**
- Consumes (Task 2): the article tabs.
- Produces: `ArticlePane` prop `place?: number`, the reader's scrollTop to restore.

- [ ] **Step 1: Write the failing test** — add to `tabs.spec.ts`:

```ts
test('going back to an article’s tab shows it where the writer left it (Review Focus 1)', async ({ page }) => {
  await openApp(page);
  await importText(page, '长文', Array.from({ length: 80 }, (_, i) => `第${i}段：春风又绿江南岸。`).join('\n\n'));
  await tab(page, '长文').getByRole('tab').dblclick();
  await importText(page, '秋', '秋水共长天一色。');
  await tab(page, '长文').getByRole('tab').click();
  await expect(page.getByTestId('article-title')).toHaveText('长文');
  const reader = page.locator('main.reader');
  const top = () => reader.evaluate((el) => el.scrollTop);
  await reader.evaluate((el) => el.scrollTo(0, 1500));
  await reader.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await tab(page, '秋').getByRole('tab').click();
  await expect(page.getByTestId('article-title')).toHaveText('秋');
  await expect.poll(top).toBe(0);
  await tab(page, '长文').getByRole('tab').click();
  await expect(page.getByTestId('article-title')).toHaveText('长文');
  await expect.poll(top).toBe(1500);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tabs --retries 0 -g "where the writer left it"`
Expected: FAIL — the last poll gets `0`, not `1500`.

- [ ] **Step 3: Remember and restore the place**
  - **`Shell.tsx`, the memory:** after `const routeKey = …`, add:

```ts
  // Where each screen was left, so going back to an article's tab shows the same place (spec §6.13, Review Focus 1).
  const places = useRef(new Map<string, number>());
  const routeKeyRef = useRef(routeKey);
  routeKeyRef.current = routeKey;
  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;
    const onScroll = () => places.current.set(routeKeyRef.current, reader.scrollTop);
    reader.addEventListener('scroll', onScroll, { passive: true });
    return () => reader.removeEventListener('scroll', onScroll);
  }, []);
  // Read as the screen changes, before the new screen's own scrolling is recorded.
  const place = useMemo(() => places.current.get(routeKey), [routeKey]);
```

  - **`Shell.tsx`, the handover:** render the pane as `<ArticlePane key={activeId} articleId={activeId} place={place} />`.
  - **`ArticlePane.tsx`, the prop:** change the signature to `export function ArticlePane({ articleId, place }: { articleId: string; place?: number })`.
  - **`ArticlePane.tsx`, the restore:** after the `useLayoutEffect` that restores `keepPlace`, add:

```ts
  // Going back to an article's tab shows it where the writer left it, once its text is laid out (spec §6.13).
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (placed.current || !handle) return;
    placed.current = true;
    const reader = layoutRef.current?.closest('.reader');
    if (reader && place !== undefined) reader.scrollTop = place;
  }, [handle, place]);
```

- [ ] **Step 4: Run the tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tabs shell --retries 0`
Expected: PASS. That includes shell.spec's check that every other screen opens at its top.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src apps/client/e2e/tabs.spec.ts
git commit -m "feat(client): going back to an article's tab shows it where it was left"
```

---

### Task 5: Memo preview tabs

**Files:**
- Modify: `apps/client/src/memo/bridge.ts` (`keepMemo`, `onKeepMemo`)
- Modify: `apps/client/src/components/MemoPane.tsx` (carried memos become stored tabs with one preview)
- Modify: `apps/client/src/components/MemoList.tsx` (double-click keeps)
- Modify: `apps/client/src/components/SectionPages.tsx` (`MemosPage` rows open through `useRowOpen`)
- Modify: `apps/client/src/styles/app.css`
- Test: `apps/client/e2e/tabs.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `openTab`, `keepTab`, `closeTab`, `retainTabs`, `useStoredTabs`.
  - From Task 3: `useRowOpen`.
- Produces:
  - `MemoBridge.keepMemo(memoId: string): void` and `MemoBridge.onKeepMemo(handler: ((memoId: string) => void) | null): void`.
  - localStorage key `jot.memoTabs`.
  - The memo tab's span gets the class `preview`.

- [ ] **Step 1: Write the failing tests** — add to `tabs.spec.ts`:

```ts
async function newStandaloneMemo(page: Page, title: string) {
  await page.getByTestId('memo-standalone-new').click();
  await expect(page.getByTestId('memo-editor')).toBeVisible();
  await page.getByTestId('memo-title').fill(title);
  await page.getByTestId('memo-title').press('Enter');
  await expect(page.locator('.memo-tab.active')).toContainText(title);
}
const memoTabs = (page: Page) => page.getByTestId('memo-tab');
const memoTab = (page: Page, title: string) => page.locator('.memo-tab').filter({ has: page.getByTestId('memo-tab').filter({ hasText: title }) });

test('memos opened from elsewhere share one preview tab; double-clicking its tab or its row keeps it (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await newStandaloneMemo(page, '甲');
  await expect(memoTab(page, '甲')).toHaveClass(/preview/);
  await newStandaloneMemo(page, '乙');
  await expect(memoTabs(page)).toHaveText(['乙']);
  await page.getByTestId('memo-list-item').filter({ hasText: '甲' }).click();
  await expect(memoTabs(page)).toHaveText(['甲']);
  await page.getByTestId('memo-tab').filter({ hasText: '甲' }).dblclick();
  await expect(memoTab(page, '甲')).not.toHaveClass(/preview/);
  await page.getByTestId('memo-list-item').filter({ hasText: '乙' }).click();
  await expect(memoTabs(page)).toHaveText(['甲', '乙']);
  await expect(memoTab(page, '乙')).toHaveClass(/preview/);
  await page.getByTestId('memo-list-item').filter({ hasText: '乙' }).dblclick();
  await expect(memoTab(page, '乙')).not.toHaveClass(/preview/);
});

test('double-clicking a memo on the Memos page keeps its tab; the article’s own memos stay plain tabs (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await expect(page.locator('.memo-tab.active')).not.toHaveClass(/preview/);
  await newStandaloneMemo(page, '甲');
  await page.getByTestId('section-memos-open').click();
  await page.getByTestId('memos-page').getByTestId('row-main').filter({ hasText: '甲' }).dblclick();
  await expect(memoTab(page, '甲')).not.toHaveClass(/preview/);
});

test('a memo being written when the writer switches articles stays open as a kept tab (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('写景起笔');
  await importText(page, '秋', '秋水共长天一色。');
  await expect(memoTabs(page)).toHaveCount(1);
  await expect(page.locator('.memo-tab.foreign')).not.toHaveClass(/preview/);
});

test('memo tabs are remembered after a reload; a deleted memo’s tab drops out (spec §6.13, Review Focus 4)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await openApp(page, { memory: false });
  await importText(page, '春', '春风又绿江南岸。');
  await newStandaloneMemo(page, '甲');
  await page.getByTestId('memo-tab').filter({ hasText: '甲' }).dblclick();
  await newStandaloneMemo(page, '乙');
  await expect(memoTabs(page)).toHaveText(['甲', '乙']);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(memoTabs(page)).toHaveText(['甲', '乙']);
  await expect(memoTab(page, '乙')).toHaveClass(/preview/);
  // Deleted from the Memos page, not from its own tab: its tab drops out when the memo is found gone.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('section-memos-open').click();
  const row = page.getByTestId('memos-page').getByTestId('page-row').filter({ hasText: '乙' });
  await row.getByTestId('row-menu').click();
  await page.getByTestId('row-delete').click();
  await expect(page.getByTestId('memos-page').getByTestId('page-row').filter({ hasText: '乙' })).toHaveCount(0);
  await page.getByTestId('article-tab').getByRole('tab', { name: '春', exact: true }).click();
  await expect(memoTabs(page)).toHaveText(['甲']);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(memoTabs(page)).toHaveText(['甲']);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tabs --retries 0 -g "memo"`
Expected: FAIL — `memoTab(page, '甲')` has no class `preview`, and after the second memo both 甲 and 乙 have tabs.

- [ ] **Step 3: Let the bridge keep memos** — in `bridge.ts`:
  - Add the field `private keepOpenMemo: ((memoId: string) => void) | null = null;` next to `openMemo`.
  - After `onOpenMemo`, add:

```ts
  onKeepMemo(handler: ((memoId: string) => void) | null): void {
    this.keepOpenMemo = handler;
  }
```

  - After `showMemo`, add:

```ts
  /** Keeps a memo's tab: a double click on its row or its preview tab (spec §6.13). */
  keepMemo(memoId: string): void {
    this.keepOpenMemo?.(memoId);
  }
```

- [ ] **Step 4: Turn carried memos into stored tabs** — in `MemoPane.tsx`:
  - Add imports `import { closeTab, keepTab, openTab, retainTabs } from '../tabs/tabs';` and `import { useStoredTabs } from '../tabs/useStoredTabs';`.
  - Replace the block from `// Memos opened from elsewhere (a "cited in" link, or kept open across an article switch).` down to the end of the `others` query with:

```ts
  // Memos opened from elsewhere (the sidebar, the Memos page, a "cited in" link) and memos carried across an article
  // switch, remembered on this device: at most one preview tab, the rest kept (spec §6.13).
  const [carried, setCarried] = useStoredTabs('jot.memoTabs');
  const carriedIds = carried.map((c) => c.id);
  const others = useLibraryQuery(
    (l) => Promise.all(carriedIds.map(async (id) => ({ id, memo: await getMemo(l, id) }))),
    [carriedIds.join('|')],
    ['memo'],
  );
  // Tabs of memos that are gone (deleted, erased) drop out.
  useEffect(() => {
    const gone = new Set((others.data ?? []).filter((r) => r.memo === null).map((r) => r.id));
    if (gone.size > 0) setCarried((t) => retainTabs(t, (id) => !gone.has(id)));
  }, [others.data, setCarried]);
```

  - Replace `const extraMemos = (others.data ?? []).filter((m) => !homeMemos.some((h) => h.id === m.id));` with:

```ts
  const extraMemos = (others.data ?? []).flatMap((r) => (r.memo && !homeMemos.some((h) => h.id === r.id) ? [r.memo] : []));
  const previewId = carried.find((c) => c.preview)?.id ?? null;
  // The open article's own memos have their own tabs, so opening or keeping one of them changes no carried tab.
  const homeIds = useRef(new Set<string>());
  homeIds.current = new Set(homeMemos.map((m) => m.id));
  // A carried memo that is one of the open article's own (it was moved here, or this is its home) shows as its plain tab.
  useEffect(() => {
    if (!home.data) return;
    const own = new Set(home.data.map((m) => m.id));
    setCarried((t) => retainTabs(t, (id) => !own.has(id)));
  }, [home.data, setCarried]);
```

  - Delete the `keepOpen` callback (`const keepOpen = useCallback(…)`).
  - In the effect that carries the memo being written, replace `keepOpen(previous.id);` with `setCarried((t) => keepTab(t, previous.id));`, and its dependency list `[articleId, keepOpen]` with `[articleId, setCarried]`.
  - Replace the `bridge.onOpenMemo` effect with:

```ts
  useEffect(() => {
    bridge.onOpenMemo((id) => {
      if (!homeIds.current.has(id)) setCarried((t) => openTab(t, id, null));
      setActiveId(id);
      setShownHere(true);
    });
    bridge.onKeepMemo((id) => {
      if (!homeIds.current.has(id)) setCarried((t) => keepTab(t, id));
    });
    return () => {
      bridge.onOpenMemo(null);
      bridge.onKeepMemo(null);
    };
  }, [bridge, setCarried]);
```

  - In `remove`, `close` and `moveTo`, replace each `setOpenIds((ids) => ids.filter((x) => x !== …))` (and `(id) => id !== …`) with `setCarried((t) => closeTab(t, <the same id>))`: `memo.id` in `remove` and `moveTo`, `id` in `close`.
  - In the tab markup, compute `const preview = m.id === previewId && !homeMemos.some((h) => h.id === m.id);` next to `foreign`.
    - Add `preview && 'preview'` to the span's class list.
    - Give the tab's first button `onDoubleClick={() => preview && setCarried((t) => keepTab(t, m.id))}`.

- [ ] **Step 5: Keep from the sidebar and the Memos page**
  - **`MemoList.tsx`:** give the `memo-list-item` button `onDoubleClick={() => bridge.keepMemo(m.id)}`.
  - **`SectionPages.tsx`, `MemosPage`:**
    - Add `const rowOpen = useRowOpen();`.
    - Change the row's `onClick={() => open(m)}` on `row-main` to `onClick={(e) => rowOpen(e, () => open(m), () => bridge.keepMemo(m.id))}`.
    - Leave the ☰ **Open** item as it is.

- [ ] **Step 6: Style the preview memo tab** — in `app.css`, change the article preview rule from Task 2 so it serves both strips:

```css
.article-tab.preview > button:first-child, .memo-tab.preview > button:first-child { font-style: italic; font-synthesis-style: none; opacity: 0.72; }
```

- [ ] **Step 7: Run the tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tabs memo memolist pages backlinks follow links search --retries 0`
Expected: PASS.

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src apps/client/e2e/tabs.spec.ts
git commit -m "feat(client): memos opened from elsewhere share one preview tab, kept by a double click"
```

---

### Task 6: Columns that keep their proportions

**Files:**
- Create: `apps/client/src/layout/columns.ts`
- Create: `apps/client/src/layout/columns.test.ts`
- Create: `apps/client/src/layout/useColumnSpace.ts`
- Create: `apps/client/src/layout/ColumnsContext.tsx`
- Modify: `apps/client/src/components/Shell.tsx` (measure the space; memo width from the share; divider sets the share; migrate `jot.memoWidth`; provide the context)
- Modify: `apps/client/src/components/ArticlePane.tsx` (the side-note column's width)
- Modify: `apps/client/src/styles/app.css`
- Test: `apps/client/e2e/columns.spec.ts` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - Constants `SPLITTER = 6`, `MEMO_MIN = 240`, `NOTES_MIN = 600`, `DOCK_MIN = 400`, `FLOAT_GAP = 48`, `NOTES_SHARE = 0.36`, `DEFAULT_MEMO_SHARE = 1 / 3`.
  - `columnLayout(space: number, share: number): ColumnLayout`, where `ColumnLayout = { memoWidth: number; articleWidth: number; notes: 'column' | 'icons'; memo: 'docked' | 'floating' }`.
  - `shareForWidth(space: number, memoWidth: number): number` and `notesWidth(articleWidth: number): number`.
  - `useColumnSpace(shell: RefObject<HTMLElement | null>, sidebarCollapsed: boolean): { width: number; left: number } | null`.
  - The context: `ColumnsProvider`, `useColumns(): Columns`, where `Columns = { notes: 'column' | 'icons'; notesWidth: number; memoFloating: boolean; revealMemo(): void }`. This task sets `notesWidth`; Task 7 uses `notes`; Task 8 fills `memoFloating` and `revealMemo`.
  - localStorage key `jot.memoShare` (replaces `jot.memoWidth`).

- [ ] **Step 1: Write the failing unit tests** — create `apps/client/src/layout/columns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { columnLayout, notesWidth, shareForWidth } from './columns';

describe('columnLayout', () => {
  it('keeps the earlier look in a 1280 px window: a 338 px memo column beside a 676 px article column', () => {
    expect(columnLayout(1020, 1 / 3)).toEqual({ memoWidth: 338, articleWidth: 676, notes: 'column', memo: 'docked' });
    expect(notesWidth(676)).toBe(243);
  });

  it('scales both columns with the space, keeping the share', () => {
    expect(columnLayout(1340, 1 / 3)).toMatchObject({ memoWidth: 444, articleWidth: 890 });
  });

  it('keeps the memo column at 240 px below its share, and the article column gives way', () => {
    expect(columnLayout(700, 0.2)).toMatchObject({ memoWidth: 240, articleWidth: 454 });
  });

  it('turns side notes into icons below a 600 px article column, then floats the memo column below 400 px', () => {
    expect(columnLayout(909, 1 / 3)).toMatchObject({ notes: 'column', memo: 'docked' });
    expect(columnLayout(900, 1 / 3)).toMatchObject({ notes: 'icons', memo: 'docked' });
    expect(columnLayout(646, 1 / 3)).toMatchObject({ notes: 'icons', memo: 'docked' });
    expect(columnLayout(645, 1 / 3)).toMatchObject({ notes: 'icons', memo: 'floating' });
  });

  it('hides side notes before the memo column floats, whatever the share', () => {
    for (const share of [0.15, 1 / 3, 0.5, 0.7]) {
      for (let space = 300; space <= 2000; space += 7) {
        const layout = columnLayout(space, share);
        if (layout.memo === 'floating') expect(layout.notes).toBe('icons');
      }
    }
  });
});

describe('shareForWidth (Review Focus 5)', () => {
  it('takes a dragged memo width as a share of the space', () => {
    expect(shareForWidth(1020, 507)).toBeCloseTo(0.5);
  });

  it('never goes below 240 px, nor so wide that the article column would float', () => {
    expect(shareForWidth(1020, 100)).toBeCloseTo(240 / 1014);
    expect(shareForWidth(1020, 900)).toBeCloseTo(614 / 1014);
    expect(columnLayout(1020, shareForWidth(1020, 900))).toMatchObject({ articleWidth: 400, memo: 'docked' });
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/layout/columns.test.ts'`
Expected: FAIL — `Failed to resolve import "./columns"`.

- [ ] **Step 3: Write the layout** — create `apps/client/src/layout/columns.ts`:

```ts
/** The divider between the article and memo columns (`.splitter`). */
export const SPLITTER = 6;
/** The memo column's narrowest width (spec §6.13). */
export const MEMO_MIN = 240;
/** Beside the memo column, an article column narrower than this shows side notes as icons. */
export const NOTES_MIN = 600;
/** Beside the memo column, an article column narrower than this makes the memo column float. */
export const DOCK_MIN = 400;
/** The strip of dimmed article left beside the sidebar while the floating memo column is shown. */
export const FLOAT_GAP = 48;
/** The side-note column's share of the article column: 243 px of the 676 px column in a 1280 px window, as before. */
export const NOTES_SHARE = 0.36;
/** The memo column's default share of the space right of the sidebar: 338 px in a 1280 px window, as before. */
export const DEFAULT_MEMO_SHARE = 1 / 3;

export interface ColumnLayout {
  /** The docked memo column's width. */
  memoWidth: number;
  /** The article column's width beside the docked memo column. */
  articleWidth: number;
  notes: 'column' | 'icons';
  memo: 'docked' | 'floating';
}

/**
 * The columns for `space` px right of the sidebar, the memo column having `share` of it (spec §6.13). Everything
 * follows from the docked widths, so a column that hides doesn't come straight back as the others widen.
 */
export function columnLayout(space: number, share: number): ColumnLayout {
  const memoWidth = Math.max(MEMO_MIN, Math.floor((space - SPLITTER) * share));
  const articleWidth = space - SPLITTER - memoWidth;
  return {
    memoWidth,
    articleWidth,
    notes: articleWidth < NOTES_MIN ? 'icons' : 'column',
    memo: articleWidth < DOCK_MIN ? 'floating' : 'docked',
  };
}

/** The share a drag to `memoWidth` sets: never below the memo column's minimum, never narrowing the article column past docking. */
export function shareForWidth(space: number, memoWidth: number): number {
  const room = space - SPLITTER;
  return Math.min(Math.max(memoWidth, MEMO_MIN), Math.max(MEMO_MIN, room - DOCK_MIN)) / room;
}

/** The side-note column's width beside the article text. */
export function notesWidth(articleWidth: number): number {
  return Math.round(articleWidth * NOTES_SHARE);
}
```

- [ ] **Step 4: Run the unit tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/layout/columns.test.ts'`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing e2e tests** — create `apps/client/e2e/columns.spec.ts`:

```ts
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
```

- [ ] **Step 6: Run them to make sure they fail**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e columns --retries 0`
Expected: FAIL. At 1600 px the memo share drops to about 0.25 (the column stays 338 px), `notes` is about 0.36 only at 1280 px, and the 900 px drag leaves the article column at about 3xx px (the splitter's old 720 px maximum).

- [ ] **Step 7: Measure the space** — create `apps/client/src/layout/useColumnSpace.ts`:

```ts
import { useLayoutEffect, useState, type RefObject } from 'react';

export interface ColumnSpace {
  /** The shell's width right of the sidebar. */
  width: number;
  /** Where that space starts: the sidebar's width. */
  left: number;
}

/** The space right of the sidebar, followed as the window resizes and the sidebar collapses (spec §6.13). */
export function useColumnSpace(shell: RefObject<HTMLElement | null>, sidebarCollapsed: boolean): ColumnSpace | null {
  const [space, setSpace] = useState<ColumnSpace | null>(null);
  useLayoutEffect(() => {
    const el = shell.current;
    if (!el) return;
    const sidebar = el.querySelector<HTMLElement>(':scope > nav.sidebar');
    const measure = () => {
      const left = sidebar?.offsetWidth ?? 0;
      const width = el.clientWidth - left;
      setSpace((s) => (s && s.width === width && s.left === left ? s : { width, left }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (sidebar) observer.observe(sidebar);
    return () => observer.disconnect();
  }, [shell, sidebarCollapsed]);
  return space;
}
```

- [ ] **Step 8: Write the context** — create `apps/client/src/layout/ColumnsContext.tsx`:

```tsx
import { createContext, useContext } from 'react';

/** What the shell's column layout tells the article pane (spec §6.13). */
export interface Columns {
  /** Side notes in their column, or as icons after their passages. */
  notes: 'column' | 'icons';
  /** The side-note column's width. */
  notesWidth: number;
  /** Whether the memo column floats off the right edge. */
  memoFloating: boolean;
  /** Slides the floating memo column in. */
  revealMemo(): void;
}

const ColumnsContext = createContext<Columns>({ notes: 'column', notesWidth: 240, memoFloating: false, revealMemo: () => undefined });

export const ColumnsProvider = ColumnsContext.Provider;

export function useColumns(): Columns {
  return useContext(ColumnsContext);
}
```

- [ ] **Step 9: Lay out the shell by the share** — in `Shell.tsx`:
  - **Imports:** add `import { columnLayout, DEFAULT_MEMO_SHARE, DOCK_MIN, MEMO_MIN, notesWidth, shareForWidth, SPLITTER } from '../layout/columns';`, `import { ColumnsProvider, type Columns } from '../layout/ColumnsContext';` and `import { useColumnSpace } from '../layout/useColumnSpace';`.
  - **State:** replace `const [memoWidth, setMemoWidth] = useStoredNumber('jot.memoWidth', 340);` with:

```ts
  const [memoShare, setMemoShare] = useStoredNumber('jot.memoShare', DEFAULT_MEMO_SHARE);
```

  - **Layout:** after `const [bridge] = useState(() => new MemoBridge());` (it needs `showMemo` and, in Task 8, `bridge` above it), add:

```ts
  // The columns share the space right of the sidebar in proportion (spec §6.13).
  const shellRef = useRef<HTMLDivElement>(null);
  const space = useColumnSpace(shellRef, sidebarCollapsed);
  const spaceWidth = space?.width ?? window.innerWidth - 260;
  const layout = columnLayout(spaceWidth, memoShare);
  // A memo width saved before plan 11 becomes a share, once.
  const migrated = useRef(false);
  useEffect(() => {
    if (!space || migrated.current) return;
    migrated.current = true;
    try {
      const old = Number(localStorage.getItem('jot.memoWidth'));
      localStorage.removeItem('jot.memoWidth');
      if (old > 0 && localStorage.getItem('jot.memoShare') === null) setMemoShare(shareForWidth(space.width, old));
    } catch {
      // storage blocked: nothing saved to carry over
    }
  }, [space, setMemoShare]);
  const columns = useMemo<Columns>(
    () => ({ notes: layout.notes, notesWidth: notesWidth(layout.articleWidth), memoFloating: false, revealMemo: () => undefined }),
    [layout.notes, layout.articleWidth],
  );
```

  - **Markup:**
    - Give `<div className="shell" data-testid="shell">` the prop `ref={shellRef}`.
    - Wrap everything inside `<TagProvider>` in `<ColumnsProvider value={columns}>…</ColumnsProvider>`.
    - Replace the splitter line with:

```tsx
          {showMemo && (
            <Splitter
              width={layout.memoWidth}
              min={MEMO_MIN}
              max={Math.max(MEMO_MIN, spaceWidth - SPLITTER - DOCK_MIN)}
              onResize={(width) => setMemoShare(shareForWidth(spaceWidth, width))}
            />
          )}
```

    - On the `<aside className="memo" …>`, set `style={{ width: layout.memoWidth }}`.

- [ ] **Step 10: Size the side-note column** — in `ArticlePane.tsx`:
  - Import `useColumns` from `../layout/ColumnsContext`.
  - Add `const { notesWidth } = useColumns();` after `const { bridge, focus, settle } = useMemoContext();`.
  - Give the root element the style `style={{ ...styleVars(style, 'article', a.lang === 'zh' ? 'zh' : 'en'), '--notes-width': `${notesWidth}px` } as CSSProperties}`.
  - In `app.css`, change `.article-layout`'s `grid-template-columns: minmax(0, var(--read-width, 40em)) 240px;` to `grid-template-columns: minmax(0, var(--read-width, 40em)) var(--notes-width, 240px);`.

- [ ] **Step 11: Run the tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e columns shell text-styles --retries 0`
Expected: PASS. That includes shell.spec's drag test and text-styles' "narrow memo column" test, which stores `jot.memoWidth = 240` and now gets a 240 px column through the migration.

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/client/src apps/client/e2e/columns.spec.ts
git commit -m "feat(client): the article, side-note and memo columns keep their proportions as the window changes"
```

---

### Task 7: Side notes turn into icons

**Files:**
- Modify: `apps/client/src/article/decorations.ts` (a note icon widget)
- Modify: `apps/client/src/article/decorations.test.ts`
- Modify: `apps/client/src/components/ArticleView.tsx` (props; icon clicks)
- Modify: `apps/client/src/components/Margin.tsx` (export `NoteCard`; add `NoteFloat`)
- Modify: `apps/client/src/components/ArticlePane.tsx` (icons mode)
- Modify: `apps/client/src/styles/app.css`
- Modify: `apps/client/src/i18n/en.ts`, `apps/client/src/i18n/zh-CN.ts` (`notes.show`)
- Test: `apps/client/e2e/columns.spec.ts`

**Interfaces:**
- Consumes (Task 6): `useColumns().notes`, and `Shell` providing `notes: layout.notes`.
- Produces:
  - `DecorationOptions.noteIcons?: { markupIds: readonly string[]; label: string }`.
  - Widget spec key `noteIcon: string` (the markup id).
  - `ArticleView` props `noteIcons?: readonly string[]`, `noteIconLabel?: string`, `onNoteIcon?(markupId: string, rect: DOMRect): void`.
  - Test ids and classes: button class `note-icon` with `data-note-markup`; the card `note-float`.

- [ ] **Step 1: Write the failing unit test** — add to `decorations.test.ts`, inside `describe('buildDecorations', …)`:

```ts
  it('puts a side-note icon right after each passage with notes, when asked (spec §6.13)', () => {
    const marks = [markup('a', 'highlight', 2, 4), markup('b', 'underline', 5, 7), markup('c', 'highlight', 1, 3, 'orphan')];
    const icons = (set: ReturnType<typeof buildDecorations>) =>
      set.find().flatMap((d) => {
        const id = (d.spec as { noteIcon?: string }).noteIcon;
        return id ? [[d.from, id]] : [];
      });
    expect(icons(buildDecorations(doc, marks, { noteIcons: { markupIds: ['a', 'c'], label: '旁注' } }))).toEqual([[5, 'a']]);
    expect(icons(buildDecorations(doc, marks))).toEqual([]);
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/article/decorations.test.ts'`
Expected: FAIL — `expected [] to deeply equal [[5, 'a']]`.

- [ ] **Step 3: Draw the icon** — in `decorations.ts`:
  - **The widget:** after the `cap` helper, add:

```ts
const SVG = 'http://www.w3.org/2000/svg';

/** A side note's icon after its passage while the side-note column is hidden (spec §6.13): a small speech bubble. */
const noteIcon = (markupId: string, label: string) => (view: EditorView) => {
  const doc = view.dom.ownerDocument;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'note-icon';
  button.dataset.noteMarkup = markupId;
  button.setAttribute('aria-label', label);
  button.title = label;
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M3 2.5h10A1.5 1.5 0 0 1 14.5 4v6a1.5 1.5 0 0 1-1.5 1.5H7.5L4.5 14v-2.5H3A1.5 1.5 0 0 1 1.5 10V4A1.5 1.5 0 0 1 3 2.5z');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  button.append(svg);
  return button;
};
```

  - **The option:** add to `DecorationOptions`:

```ts
  /** Markups whose side notes show as an icon after their text, and the icon's name (spec §6.13). */
  noteIcons?: { markupIds: readonly string[]; label: string };
```

  - **The loop:** in `buildDecorations`, before the `for (const m of markups)` loop, add `const noted = new Set(options.noteIcons?.markupIds ?? []);`. Inside the loop, after the active-markup caps, add:

```ts
    if (options.noteIcons && noted.has(m.id) && clamp(m.end) > clamp(m.start)) {
      const { label } = options.noteIcons;
      decorations.push(Decoration.widget(offsetToPos(clamp(m.end)), noteIcon(m.id, label), { side: 1, ignoreSelection: true, key: `note-${m.id}-${label}`, noteIcon: m.id }));
    }
```

- [ ] **Step 4: Run the unit test**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/article/decorations.test.ts'`
Expected: PASS.

- [ ] **Step 5: Write the failing e2e tests** — add to `columns.spec.ts` (and add `selectText` to its helpers import):

```ts
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
```

- [ ] **Step 6: Run them to make sure they fail**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e columns --retries 0 -g "icon"`
Expected: FAIL — `getByTestId('margin')` still resolves to one element at 1100 px.

- [ ] **Step 7: Let the article view show and report icons** — in `ArticleView.tsx`:
  - **Props:** add to `Props`:

```ts
  /** Markups whose side notes show as an icon after their text, the icon's name, and what a click on one does (spec §6.13). */
  noteIcons?: readonly string[];
  noteIconLabel?: string;
  onNoteIcon?(markupId: string, rect: DOMRect): void;
```

  - **Decorations:**
    - Destructure `noteIcons` and `noteIconLabel = ''` from `props` alongside `citations`.
    - Pass `noteIcons: latest.current.noteIcons ? { markupIds: latest.current.noteIcons, label: latest.current.noteIconLabel ?? '' } : undefined` in the first `buildDecorations` call.
    - Pass `noteIcons: noteIcons ? { markupIds: noteIcons, label: noteIconLabel } : undefined` in the effect's call.
    - Add `noteIcons, noteIconLabel` to that effect's dependency list.
  - **Clicks:** in the effect that listens for `mouseup`/`keyup`, make `onRelease` start with `if (event.target instanceof Element && event.target.closest('.note-icon')) return;`, and add a click listener beside it:

```ts
    const onClick = (event: MouseEvent) => {
      const icon = event.target instanceof Element ? event.target.closest<HTMLElement>('.note-icon') : null;
      if (icon?.dataset.noteMarkup) latest.current.onNoteIcon?.(icon.dataset.noteMarkup, icon.getBoundingClientRect());
    };
    host.addEventListener('click', onClick);
```

  - **Cleanup:** remove it in that effect's cleanup with `host.removeEventListener('click', onClick);`.

- [ ] **Step 8: The floating card** — in `Margin.tsx`:
  - Change `function NoteCard(` to `export function NoteCard(`.
  - Append:

```tsx
interface NoteFloatProps {
  notes: SideNoteView[];
  top: number;
  left: number;
  focusNoteId: string | null;
  onFocusHandled(): void;
  onActivate(markupId: string | null): void;
  onLink(note: SideNoteView, body: string): void;
  articleId: string;
  tagsOf(noteId: string): string[];
  onClose(): void;
}

/**
 * A passage's side notes in a card beside its icon, while the side-note column is hidden (spec §6.13). Escape or a
 * press outside closes it; the note being written is left first, so an empty one is removed and the rest is saved.
 */
export function NoteFloat({ notes, top, left, focusNoteId, onFocusHandled, onActivate, onLink, articleId, tagsOf, onClose }: NoteFloatProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const leave = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && rootRef.current?.contains(active)) active.blur();
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leave();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target && (rootRef.current?.contains(target) || target.closest('.note-icon'))) return;
      leave();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);
  if (notes.length === 0) return null;
  return (
    <div className="popover note-float" ref={rootRef} style={{ top, left }} data-testid="note-float">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          top={0}
          autoFocus={note.id === focusNoteId}
          register={() => undefined}
          onFocusHandled={onFocusHandled}
          onResize={() => undefined}
          onActivate={onActivate}
          onLink={(body) => onLink(note, body)}
          articleId={articleId}
          tagIds={tagsOf(note.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Icons mode in the article pane** — in `ArticlePane.tsx`:
  - **Imports:** import `NoteFloat` from `./Margin`, beside `Margin`.
  - **Hooks:** replace `const { notesWidth } = useColumns();` with `const { notes: notesMode, notesWidth } = useColumns();`. Then, before `const a = article.data;`, add:

```ts
  // In a narrow window side notes show as icons after their passages, each opening its notes in a card (spec §6.13).
  const icons = notesMode === 'icons';
  const [noteFloat, setNoteFloat] = useState<{ markupId: string; top: number; left: number } | null>(null);
  const notedMarkups = useMemo(() => [...new Set((notes.data ?? []).map((n) => n.markupId))], [notes.data]);
  useEffect(() => {
    if (!icons) setNoteFloat(null);
  }, [icons]);
```

  - **Opening a card:** after `const orphans = …`, add:

```ts
  const openNoteFloat = (markupId: string, rect: { bottom: number; left: number }) => {
    const box = layoutRef.current?.getBoundingClientRect();
    if (!box) return;
    setNoteFloat({ markupId, top: rect.bottom - box.top + 6, left: Math.max(0, Math.min(rect.left - box.left, box.width - 320)) });
  };
  const onNoteIcon = (markupId: string, rect: DOMRect) => {
    if (noteFloat?.markupId === markupId) setNoteFloat(null);
    else openNoteFloat(markupId, rect);
  };
```

  - **Adding a note:** replace `addNote` with:

```ts
  const addNote = async (markupId: string, end: number) => {
    setActiveMarkupId(markupId);
    setFocusNoteId(await createSideNote(lib, { markupId, articleId, body: '' }));
    const at = icons ? handle?.coordsAtOffset(end) : null;
    if (at) openNoteFloat(markupId, at);
  };
```

    - Update its callers: in `onAction`, `if (action === 'note') await addNote(markupId, range.end);`; in the popover's `onAddNote`, `addNote(m.id, m.end).catch(reportError);`.
  - **Rendering:**
    - Give the layout the class `className={icons ? 'article-layout icons' : 'article-layout'}`.
    - Pass `noteIcons={icons ? notedMarkups : undefined}`, `noteIconLabel={t('notes.show')}` and `onNoteIcon={onNoteIcon}` to `<ArticleView …/>`.
    - Change the margin's condition from `{!editing && (` to `{!editing && !icons && (`.
    - After the margin, add:

```tsx
      {!editing && icons && noteFloat && (
        <NoteFloat
          notes={(notes.data ?? []).filter((n) => n.markupId === noteFloat.markupId)}
          top={noteFloat.top}
          left={noteFloat.left}
          focusNoteId={focusNoteId}
          onFocusHandled={clearFocus}
          onActivate={setActiveMarkupId}
          articleId={articleId}
          tagsOf={(noteId) => tagIdsOf('side_note', noteId)}
          onLink={(note, body) =>
            bridge.insertLink({ targetType: 'side_note', targetId: note.id, articleId, label: excerpt(body) || t('notes.untitled') })
          }
          onClose={() => setNoteFloat(null)}
        />
      )}
```

- [ ] **Step 10: Style and name it**
  - **Styles:** in `app.css`, after the `.note footer button` rule, add:

```css
/* In a narrow window a passage's side notes show as an icon after it, opening them in a card (spec §6.13). */
.article-layout.icons { grid-template-columns: minmax(0, var(--read-width, 40em)); }
.note-icon { display: inline-flex; align-items: center; margin: 0 2px; padding: 1px; vertical-align: middle; color: var(--muted); background: none; border: none; border-radius: 4px; cursor: pointer; }
.note-icon:hover, .note-icon:focus-visible { color: var(--text); background: var(--row-hover); }
.note-float { display: flex; flex-direction: column; gap: 6px; width: 300px; max-width: 300px; }
.note-float .note { position: relative; }
```

  - **Strings:** add `show: 'Show side notes',` to `notes` in `en.ts`, and `show: '查看旁注',` to `notes` in `zh-CN.ts`.
  - **Note on the tests:** at 1280 px, earlier margin tests keep their column (676 px ≥ 600 px).

- [ ] **Step 11: Run the tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e columns notes annotate popover backlinks --retries 0`
Expected: PASS.

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/client/src apps/client/e2e/columns.spec.ts
git commit -m "feat(client): in a narrower window side notes turn into icons that open their notes in a card"
```

---

### Task 8: The floating memo column

**Files:**
- Modify: `apps/client/src/memo/bridge.ts` (`onReveal`)
- Modify: `apps/client/src/components/Shell.tsx` (floating mode: edge, scrim, Escape, reveal)
- Modify: `apps/client/src/components/ArticlePane.tsx` (the memo button in the article bar)
- Modify: `apps/client/src/styles/app.css`
- Modify: `apps/client/src/i18n/en.ts`, `apps/client/src/i18n/zh-CN.ts` (`memo.showColumn`)
- Modify: `apps/client/e2e/text-styles.spec.ts` (keep its 900 px test's memo column docked)
- Test: `apps/client/e2e/columns.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 6: `columnLayout(...).memo`, `FLOAT_GAP`, and the `Columns` context, which gets `memoFloating` and `revealMemo`.
- Produces:
  - `MemoBridge.onReveal(handler: (() => void) | null): void`.
  - Test ids `memo-edge`, `memo-scrim`, `memo-reveal`.
  - The aside's classes `floating` and `shown`, and the shell's class `memo-floating`.

- [ ] **Step 1: Write the failing tests** — add to `columns.spec.ts` (and add `editorFocused` to its helpers import):

```ts
/** 860 px with the sidebar open: 600 px right of it, an article column of 354 px beside a docked memo column, so it floats. */
const FLOATING = { width: 860, height: 720 };

test('in a narrow window the memo column floats: the right edge slides it in over the article, dimmed beside the sidebar; the strip slides it out (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await page.setViewportSize(FLOATING);
  await importText(page, '春', '春风又绿江南岸。');
  const memo = page.getByTestId('memo-pane');
  await expect(memo).toBeHidden();
  await expect(page.getByTestId('memo-splitter')).toHaveCount(0);
  const article = await page.locator('main.reader').boundingBox();
  const nav = await page.locator('nav.sidebar').boundingBox();
  const sidebarRight = (nav?.x ?? 0) + (nav?.width ?? 0);
  expect(Math.round(article?.width ?? 0)).toBe(860 - Math.round(sidebarRight));
  await page.mouse.move(858, 360);
  await expect(memo).toBeVisible();
  const box = await memo.boundingBox();
  expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(860);
  expect((box?.x ?? 0) - sidebarRight).toBeCloseTo(48, 0);
  const scrim = page.getByTestId('memo-scrim');
  await expect(scrim).toBeVisible();
  expect(await scrim.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.mouse.click(sidebarRight + 20, 360);
  await expect(memo).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(memo).toBeVisible();
  await expect(page.getByTestId('memo-splitter')).toBeVisible();
  await expect(page.getByTestId('memo-edge')).toHaveCount(0);
});

test('Escape inside the floating memo column closes the [[ list first, then slides the column out (spec §6.13, Review Focus 2)', async ({ page }) => {
  await openApp(page);
  await page.setViewportSize(FLOATING);
  await importText(page, '春', '春风又绿江南岸，明月何时照我还。');
  await selectText(page, '明月');
  await page.getByTestId('toolbar-highlight').click();
  await page.getByTestId('memo-reveal').click();
  const memo = page.getByTestId('memo-pane');
  await expect(memo).toBeVisible();
  await page.getByTestId('memo-new').click();
  const editor = page.getByTestId('memo-editor');
  await editor.click();
  await editorFocused(editor);
  await page.keyboard.insertText('对比[[明月');
  await expect(page.getByTestId('link-suggestion')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('link-suggestion')).toHaveCount(0);
  await expect(memo).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(memo).toBeHidden();
});

test('quoting a passage or opening a memo slides the floating memo column in (spec §6.13)', async ({ page }) => {
  await openApp(page);
  await page.setViewportSize(FLOATING);
  await importText(page, '春', '春风又绿江南岸。');
  const memo = page.getByTestId('memo-pane');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(memo).toBeVisible();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.press('Escape');
  await expect(memo).toBeHidden();
  await page.getByTestId('memo-list-item').first().click();
  await expect(memo).toBeVisible();
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e columns --retries 0 -g "floating|floats"`
Expected: FAIL — `memo-pane` is visible at 860 px (`toBeHidden` fails), and `memo-reveal` does not exist.

- [ ] **Step 3: Let the bridge reveal the column** — in `bridge.ts`:
  - Add the field `private reveal: (() => void) | null = null;`.
  - Add:

```ts
  /** Slides the floating memo column in (spec §6.13): on quoting a passage and on opening a memo. */
  onReveal(handler: (() => void) | null): void {
    this.reveal = handler;
  }
```

  - Make `insertLink` and `showMemo` each start with `this.reveal?.();`.

- [ ] **Step 4: Float the column in the shell** — in `Shell.tsx`:
  - **Imports:** add `FLOAT_GAP` to the `../layout/columns` import.
  - **State:** after the migration effect and before `const columns = …`, add:

```ts
  // In a narrow window the memo column floats off the right edge and slides in over the article column (spec §6.13).
  const floating = showMemo && layout.memo === 'floating';
  const [memoShown, setMemoShown] = useState(false);
  const revealMemo = useCallback(() => setMemoShown(true), []);
  useEffect(() => {
    if (!floating) setMemoShown(false);
  }, [floating]);
  useEffect(() => {
    bridge.onReveal(revealMemo);
    return () => bridge.onReveal(null);
  }, [bridge, revealMemo]);
  // Escape slides it out, unless something open inside it takes the key first: a menu, a dialog, the [[ list, the Aa panel.
  useEffect(() => {
    if (!floating || !memoShown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('aside.memo [role="menu"], aside.memo [role="dialog"], aside.memo [role="listbox"], [data-testid="reading-panel"]')) return;
      setMemoShown(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [floating, memoShown]);
```

  - **Context:** change the `columns` memo to `({ notes: layout.notes, notesWidth: notesWidth(layout.articleWidth), memoFloating: floating, revealMemo })`, with dependencies `[layout.notes, layout.articleWidth, floating, revealMemo]`.
  - **Markup:**
    - Give the shell `className={floating ? 'shell memo-floating' : 'shell'}`.
    - Render the splitter only when `showMemo && !floating`.
    - Change the aside to:

```tsx
          <aside
            className={['memo', floating && 'floating', floating && memoShown && 'shown'].filter(Boolean).join(' ')}
            ref={setMemoColumn}
            style={{ width: floating ? spaceWidth - FLOAT_GAP : layout.memoWidth }}
            hidden={!showMemo}
            data-testid="memo-pane"
          >
```

    - Right after `<OverlayScrollbar axis="y" testId="memo-thumb" />`, add:

```tsx
          {floating && (
            <div className={memoShown ? 'memo-scrim shown' : 'memo-scrim'} style={{ left: space?.left ?? 0 }} onClick={() => setMemoShown(false)} data-testid="memo-scrim" />
          )}
          {floating && !memoShown && <div className="memo-edge" onPointerEnter={revealMemo} data-testid="memo-edge" />}
```

- [ ] **Step 5: The memo button in the article bar** — in `ArticlePane.tsx`:
  - Change the `useColumns()` destructuring to `const { notes: notesMode, notesWidth, memoFloating, revealMemo } = useColumns();`.
  - Import `SECTION_ICONS` from `./sectionIcons`.
  - Wrap the bar's menu:

```tsx
        <span className="column-bar-end">
          {memoFloating && (
            <button type="button" className="icon" aria-label={t('memo.showColumn')} title={t('memo.showColumn')} onClick={revealMemo} data-testid="memo-reveal">
              {SECTION_ICONS.memos}
            </button>
          )}
          {!editing && (
            <Menu
              label={t('article.menu')}
              testId="article-menu"
              onOpenChange={setMenuOpen}
              items={[
                { label: t('edit.start'), onSelect: startEditing, testId: 'edit-start' },
                { label: t('details.open'), onSelect: () => setEditingDetails(true), testId: 'article-details' },
                { label: t('library.delete'), onSelect: () => void removeArticle().catch(reportError), testId: 'article-delete' },
              ]}
            />
          )}
        </span>
```

- [ ] **Step 6: Style it, name it, and keep an older test's column docked**
  - **Styles:** in `app.css`, after the `.memo .column-bar` rule, add:

```css
/* A narrow window's memo column floats off the right edge (spec §6.13): the edge slides it in over the article
   column, which dims beside the sidebar; the strip left showing slides it out. */
.memo.floating { position: absolute; top: 0; right: 0; bottom: 0; z-index: 30; box-shadow: -8px 0 24px rgba(0, 0, 0, 0.18); transform: translateX(100%); visibility: hidden; transition: transform 0.2s ease, visibility 0s linear 0.2s; }
.memo.floating.shown { transform: none; visibility: visible; transition: transform 0.2s ease; }
.memo.floating + .overlay-scrollbar { z-index: 31; }
.memo-scrim { position: absolute; top: 0; right: 0; bottom: 0; z-index: 29; background: rgba(0, 0, 0, 0.28); opacity: 0; visibility: hidden; transition: opacity 0.2s ease, visibility 0s linear 0.2s; }
.memo-scrim.shown { opacity: 1; visibility: visible; transition: opacity 0.2s ease; }
.memo-edge { position: absolute; top: 0; right: 0; bottom: 0; z-index: 28; width: 8px; }
/* The article's scroll thumb stays clear of the edge that slides the memo column in. */
.shell.memo-floating .reader + .overlay-scrollbar .overlay-thumb { right: 10px; }
.column-bar-end { display: flex; align-items: center; gap: 4px; }
@media (prefers-reduced-motion: reduce) {
  .memo.floating, .memo.floating.shown, .memo-scrim, .memo-scrim.shown { transition: none; }
}
```

  - **Strings:** add `showColumn: 'Show memos',` to `memo` in `en.ts`, and `showColumn: '显示札记',` to `memo` in `zh-CN.ts`.
  - **The older test:** in `text-styles.spec.ts`, the test that calls `page.setViewportSize({ width: 900, height: 720 })` checks the memo **Aa** panel stays inside the window. At 900 px with the sidebar open the memo column would now float, so collapse the sidebar first. Insert `await page.getByTestId('sidebar-toggle').click();` right before that `setViewportSize` call. With the sidebar collapsed there is 856 px of space, an article column of 567 px, and a docked memo column.

- [ ] **Step 7: Run the tests**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e columns text-styles shell memo-bar --retries 0`
Expected: PASS.

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: PASS.

Run the whole e2e suite: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e`
Expected: PASS apart from the known skips.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src apps/client/e2e
git commit -m "feat(client): in a narrow window the memo column floats in from the right edge"
```
