# Jot Plan 8: Workspace Layout and Reading Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The second UI round from the product owner's review:
- a tidier sidebar with foldable sections and pages for Library, Memos and Tags;
- a slim, self-hiding bar with **Aa** reading controls and a **☰** menu on the article and memo columns;
- editing an article's details, and moving a memo to another article;
- a memo tab strip like an editor's;
- a layout that shows the memo column only when there is something in it.

**Architecture:**
- **Database (Task 1):** three small additions: `updateArticleDetails`, `setMemoHome` and `tagUsage`.
- **Pure client models with unit tests (Task 2):**
  - reading styles: parse, step and CSS variables;
  - tag paths;
  - the bar's show/hide rule.
- **UI tasks (3–6):** each ends in end-to-end tests on Chromium and WebKit. They share three primitives:
  - `Menu`, the ☰ button with its menu;
  - `ColumnBar`, the sticky, self-hiding bar;
  - `ReadingControls`, the Aa button and panel.
- **Search state** moves from the sidebar up to the shell, so the Tags page can start a tag search.

**Tech Stack:** unchanged. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`. Relevant sections:
- §6.10 workspace layout and reading controls
- §6.9 the Trash
- §9 M11
- §10 step 8

**Branch:** `plan-8-ui-round` (the spec commit 91656a3 is on it).

## Global Constraints

- **Plan 1–7 constraints still apply.** In particular:
  - Docker only.
  - Node ≥ 24 and pnpm 10.
  - Local edits go only through `Library.commit`.
  - Every user-facing string goes through i18next, with identical keys in `zh-CN` and `en`.
  - No `dangerouslySetInnerHTML`.
  - Conventional commits with **no attribution lines**.
- **Commands:**
  - Run: `docker compose run --rm -T -e NO_COLOR=1 dev <cmd>`.
  - End-to-end: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e [spec]`.
- **Before any e2e run after editing `packages/`,** restart the dev server and the browser server, then wait for both (plan 6):
  - `docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright`
  - `until docker compose exec -T web node -e "require('net').connect(3000,'localhost').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; do sleep 2; done`
  - `until docker compose exec -T web node -e "fetch('http://localhost:5173/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; do sleep 2; done`
- **Reading settings** (§6.10):
  - Typeface `song` (宋体, `var(--font-read)`), `hei` (黑体, `var(--font-ui)`) or `kai` (楷体).
  - Size 14–26 px, in steps of 1.
  - Line spacing 1.4–2.6, in steps of 0.1.
  - Line width 30–50 em in steps of 5, or `0` meaning the full column.
  - Article defaults `{ song, 18, 1.9, 40 }`; memo defaults `{ song, 16, 1.8, 0 }`.
  - Stored in localStorage under `jot.reading.article` and `jot.reading.memo`, never synced or exported.
- **Deleting** from any menu or page moves the item to the Trash, with the existing confirmation texts (`library.confirmDelete`, `memo.confirmDelete`, `tags.confirmDelete`).
- **Test IDs kept for existing tests:**
  - `import-open` (now the Library **+**);
  - `memo-new` (now the **+** icon);
  - `edit-start` (now a ☰ item);
  - `memo-delete` (now a ☰ item);
  - `memo-tab`, `tag-new`, `tag-name-input`, `library-list`.

## Review Focus

These five inputs aren't covered by the happy paths and are most likely to cause problems. Each one has a test in the task that owns the code.

1. **Stored reading settings that are damaged or out of range** (not JSON, a size of 99, an unknown typeface).
   - Expected: the column falls back to the defaults and clamps values. Nothing crashes.
   - Test: Task 2.
2. **A memo whose home article is erased, or a target article in the Trash.**
   - Expected: moving to a live article works; a target that isn't live is refused.
   - Tests: Task 1 and Task 4.
3. **An empty or blank title in Edit details.**
   - Expected: refused with a message, and nothing changes.
   - Tests: Task 1 and Task 3.
4. **Many memo tabs.**
   - Expected: one row that scrolls sideways; the tabs never wrap.
   - Test: Task 4.
5. **Scrolling while the Aa panel or the ☰ menu is open.**
   - Expected: the bar stays. Once closed, it hides on scrolling down and comes back on scrolling up or hovering near the top.
   - Test: Task 3.

---

## File map

```
packages/db/src/articles.ts, memos.ts, tags.ts, workspace.test.ts                  Task 1
apps/client/src/reading/readingStyle.ts (+test), useReadingStyle.ts                Task 2
apps/client/src/tags/tagPaths.ts (+test), apps/client/src/layout/columnBar.ts (+test) Task 2
apps/client/src/components/Menu.tsx, ColumnBar.tsx, ReadingControls.tsx            Task 3
apps/client/src/components/ArticleDetailsDialog.tsx, ArticlePane.tsx               Task 3
apps/client/src/components/ArticlePicker.tsx, MemoPane.tsx                         Task 4
apps/client/src/components/SectionPages.tsx, Shell.tsx, router.ts                  Task 5
apps/client/src/components/SectionHeading.tsx, Sidebar.tsx, TagTree.tsx, MemoList.tsx, Trash.tsx   Task 6
apps/client/src/i18n/en.ts, zh-CN.ts, styles/app.css                               Tasks 3–6
apps/client/e2e/article-bar.spec.ts, memo-bar.spec.ts, pages.spec.ts, sidebar.spec.ts (+ updates)   Tasks 3–6
README.md                                                                          Task 7
```

---

### Task 1: Article details, a memo's home, and tag usage (database)

**Files:**
- Create: `packages/db/src/workspace.test.ts`
- Modify: `packages/db/src/articles.ts`, `packages/db/src/memos.ts`, `packages/db/src/tags.ts`
- Test: `packages/db/src/workspace.test.ts`

**Interfaces:**
- Produces:
  - `class EmptyTitleError extends Error`
  - `updateArticleDetails(lib, id, input: { title: string; author: string | null; source: string | null }): Promise<void>`
  - `setMemoHome(lib, memoId, articleId): Promise<void>`. It throws `Error('Article … does not exist')` when the article isn't live.
  - `tagUsage(lib): Promise<Record<string, number>>` counts the live items each tag is on.

- [ ] **Step 1: Write the failing tests**

`packages/db/src/workspace.test.ts`:
```ts
import type { Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, EmptyTitleError, getArticle, updateArticleDetails } from './articles';
import { Library } from './library';
import { createMemo, getMemo, listMemos, setMemoHome } from './memos';
import { search } from './search';
import { createTag, tagEntity, tagUsage } from './tags';
import { eraseTrashEntries } from './trash';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));
let tick = 1000;
const open = () => Library.open(createNodeDriver(), { now: () => tick++ });
const article = async (lib: Library, title: string, text = '他用比喻写春天。') =>
  (await createArticle(lib, { title, author: '甲', importKind: 'paste', blocks: paras(text) })).articleId;

describe('updateArticleDetails', () => {
  it('changes the title, author and source, and search finds the new title', async () => {
    const lib = await open();
    const id = await article(lib, '春');
    await updateArticleDetails(lib, id, { title: '  春之歌 ', author: '', source: 'https://example.com/spring' });
    const a = (await getArticle(lib, id))!;
    expect([a.title, a.author, a.source]).toEqual(['春之歌', null, 'https://example.com/spring']);
    expect((await search(lib.driver, { text: '春之歌' })).map((h) => [h.entityType, h.entityId])).toEqual([['article', id]]);
  });

  it('refuses a blank title and changes nothing (Review Focus 3)', async () => {
    const lib = await open();
    const id = await article(lib, '春');
    await expect(updateArticleDetails(lib, id, { title: '   ', author: null, source: null })).rejects.toThrow(EmptyTitleError);
    expect((await getArticle(lib, id))!.title).toBe('春');
  });
});

describe('setMemoHome', () => {
  it('moves a memo whose article was erased to another article (spec §10 step 8, Review Focus 2)', async () => {
    const lib = await open();
    const spring = await article(lib, '春');
    const autumn = await article(lib, '秋', '秋水共长天一色。');
    const memoId = await createMemo(lib, { title: '札记', homeArticleId: spring });
    await deleteArticle(lib, spring);
    await eraseTrashEntries(lib, [{ kind: 'article', id: spring }]);
    await setMemoHome(lib, memoId, autumn);
    expect((await listMemos(lib, autumn)).map((m) => m.id)).toEqual([memoId]);
    expect((await getMemo(lib, memoId))!.homeArticleId).toBe(autumn);
  });

  it('refuses an article that is in the Trash (Review Focus 2)', async () => {
    const lib = await open();
    const spring = await article(lib, '春');
    const autumn = await article(lib, '秋', '秋水共长天一色。');
    const memoId = await createMemo(lib, { title: '札记', homeArticleId: spring });
    await deleteArticle(lib, autumn);
    await expect(setMemoHome(lib, memoId, autumn)).rejects.toThrow('does not exist');
    expect((await getMemo(lib, memoId))!.homeArticleId).toBe(spring);
  });
});

describe('tagUsage', () => {
  it('counts the live items each tag is on', async () => {
    const lib = await open();
    const a = await createTag(lib, { name: '技巧' });
    const b = await createTag(lib, { name: '修辞' });
    const id = await article(lib, '春');
    const memoId = await createMemo(lib, { title: '札记', homeArticleId: null });
    await tagEntity(lib, { tagId: a, entityType: 'article', entityId: id, articleId: id });
    await tagEntity(lib, { tagId: a, entityType: 'memo', entityId: memoId, articleId: null });
    await tagEntity(lib, { tagId: b, entityType: 'memo', entityId: memoId, articleId: null });
    expect(await tagUsage(lib)).toEqual({ [a]: 2, [b]: 1 });
    await deleteArticle(lib, id);
    expect(await tagUsage(lib)).toEqual({ [a]: 1, [b]: 1 });
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/workspace.test.ts`
Expected: FAIL: `EmptyTitleError`, `updateArticleDetails`, `setMemoHome` and `tagUsage` don't exist (`is not a function` / undefined).

- [ ] **Step 2: Implement**

In `packages/db/src/articles.ts`:
1. After `EmptyArticleError`, add:
```ts
export class EmptyTitleError extends Error {
  constructor() {
    super('An article needs a title');
    this.name = 'EmptyTitleError';
  }
}
```
2. At the end of the file, add:
```ts
/** Edits an article's title, author and source (spec §6.10); the title is re-indexed for search. */
export async function updateArticleDetails(
  lib: Library,
  id: string,
  input: { title: string; author: string | null; source: string | null },
): Promise<void> {
  const title = input.title.normalize('NFC').trim();
  if (!title) throw new EmptyTitleError();
  const current = await getArticle(lib, id);
  if (!current) throw new Error(`Article ${id} does not exist`);
  await lib.commit(
    [{ table: 'article', id, fields: { title, author: optional(input.author), source: optional(input.source) } }],
    indexStatements({ entityType: 'article', entityId: id, articleId: id, title, body: current.text }),
  );
}
```

In `packages/db/src/memos.ts`, after `renameMemo`, add:
```ts
/** Makes an article the memo's home (spec §6.10): the memo then shows among that article's tabs. */
export async function setMemoHome(lib: Library, memoId: string, articleId: string): Promise<void> {
  const [article] = await lib.driver.query<{ id: string }>('SELECT id FROM article WHERE id = ? AND deleted = 0', [articleId]);
  if (!article) throw new Error(`Article ${articleId} does not exist`);
  const [memo] = await lib.driver.query<{ id: string }>('SELECT id FROM memo WHERE id = ? AND deleted = 0', [memoId]);
  if (!memo) throw new Error(`Memo ${memoId} does not exist`);
  await lib.commit([{ table: 'memo', id: memoId, fields: { home_article_id: articleId } }]);
}
```

In `packages/db/src/tags.ts`, after `listEdges`, add:
```ts
/** How many live items each tag is on (the Tags page, spec §6.10); an item in the Trash doesn't count. */
export async function tagUsage(lib: Library): Promise<Record<string, number>> {
  const rows = await lib.driver.query<{ tagId: string; n: number }>(
    `SELECT t.tag_id AS tagId, count(*) AS n FROM tagging t
     WHERE t.deleted = 0 AND CASE t.entity_type
       WHEN 'article' THEN EXISTS (SELECT 1 FROM article x WHERE x.id = t.entity_id AND x.deleted = 0)
       WHEN 'markup' THEN EXISTS (SELECT 1 FROM markup x WHERE x.id = t.entity_id AND x.deleted = 0)
       WHEN 'side_note' THEN EXISTS (SELECT 1 FROM side_note x WHERE x.id = t.entity_id AND x.deleted = 0)
       WHEN 'memo' THEN EXISTS (SELECT 1 FROM memo x WHERE x.id = t.entity_id AND x.deleted = 0)
       ELSE 0 END
     GROUP BY t.tag_id`,
  );
  return Object.fromEntries(rows.map((r) => [r.tagId, Number(r.n)]));
}
```

- [ ] **Step 3: Run the tests, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db/src/workspace.test.ts && pnpm test && pnpm typecheck && pnpm lint'`
Expected: 5 passed; everything else green.

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "feat(db): edit an article's details, move a memo to another article, count tag usage"
```

---

### Task 2: Reading styles, tag paths and the bar rule (pure models)

**Files:**
- Create:
  - `apps/client/src/reading/readingStyle.ts`, `readingStyle.test.ts`
  - `apps/client/src/reading/useReadingStyle.ts`
  - `apps/client/src/tags/tagPaths.ts`, `tagPaths.test.ts`
  - `apps/client/src/layout/columnBar.ts`, `columnBar.test.ts`
- Test: the three `.test.ts` files

**Interfaces:**
- Produces:
  - `type Typeface = 'song' | 'hei' | 'kai'`; `type ReadingKind = 'article' | 'memo'`
  - `interface ReadingStyle { typeface: Typeface; size: number; lineHeight: number; width: number }` (`width` 0 = full)
  - `DEFAULT_STYLE: Record<ReadingKind, ReadingStyle>`
  - `parseStyle(raw: unknown, kind): ReadingStyle`
  - `stepStyle(style, field: 'size' | 'lineHeight' | 'width', direction: 1 | -1): ReadingStyle`
  - `styleVars(style, kind): Record<string, string>` gives `--read-font/-size/-line/-width` for articles and `--memo-*` for memos.
  - `useReadingStyle(kind): [ReadingStyle, (next: ReadingStyle) => void]`
  - `tagPaths(tags, edges): Map<string, string[]>` maps a tag id to its sorted paths (`技巧 › 修辞`).
  - `barShownAfterScroll(shown: boolean, lastY: number, y: number): boolean`

- [ ] **Step 1: Write the failing tests**

`apps/client/src/reading/readingStyle.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, parseStyle, stepStyle, styleVars } from './readingStyle';

describe('reading styles', () => {
  it('repairs damaged or out-of-range stored settings (Review Focus 1)', () => {
    expect(parseStyle(null, 'article')).toEqual(DEFAULT_STYLE.article);
    expect(parseStyle('nonsense', 'memo')).toEqual(DEFAULT_STYLE.memo);
    expect(parseStyle({ typeface: 'comic', size: 99, lineHeight: 0.2, width: 43 }, 'article')).toEqual({
      typeface: 'song',
      size: 26,
      lineHeight: 1.4,
      width: 45,
    });
    expect(parseStyle({ typeface: 'kai', size: 20, lineHeight: 2.04, width: 0 }, 'article')).toEqual({
      typeface: 'kai',
      size: 20,
      lineHeight: 2,
      width: 0,
    });
  });

  it('steps within the limits; width goes from 50 em to the full column and back', () => {
    const s = DEFAULT_STYLE.article;
    expect(stepStyle(s, 'size', 1).size).toBe(19);
    expect(stepStyle({ ...s, size: 26 }, 'size', 1).size).toBe(26);
    expect(stepStyle(s, 'lineHeight', 1).lineHeight).toBe(2);
    expect(stepStyle({ ...s, lineHeight: 1.4 }, 'lineHeight', -1).lineHeight).toBe(1.4);
    expect(stepStyle({ ...s, width: 50 }, 'width', 1).width).toBe(0);
    expect(stepStyle({ ...s, width: 0 }, 'width', -1).width).toBe(50);
    expect(stepStyle({ ...s, width: 30 }, 'width', -1).width).toBe(30);
  });

  it('turns a style into the CSS variables its column reads', () => {
    expect(styleVars(DEFAULT_STYLE.article, 'article')).toEqual({
      '--read-font': 'var(--font-read)',
      '--read-size': '18px',
      '--read-line': '1.9',
      '--read-width': '40em',
    });
    expect(styleVars({ ...DEFAULT_STYLE.memo, typeface: 'hei' }, 'memo')).toEqual({
      '--memo-font': 'var(--font-ui)',
      '--memo-size': '16px',
      '--memo-line': '1.8',
      '--memo-width': 'none',
    });
    expect(styleVars({ ...DEFAULT_STYLE.article, width: 0 }, 'article')['--read-width']).toBe('1fr');
  });
});
```

`apps/client/src/tags/tagPaths.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { tagPaths } from './tagPaths';

describe('tagPaths', () => {
  it('lists every path from a top-level tag, for tags with several parents too', () => {
    const tags = [
      { id: 'a', name: '技巧' },
      { id: 'b', name: '修辞' },
      { id: 'c', name: '比喻' },
      { id: 'd', name: '手法' },
    ];
    const edges = [
      { parent_id: 'a', child_id: 'b' },
      { parent_id: 'b', child_id: 'c' },
      { parent_id: 'd', child_id: 'c' },
    ];
    const paths = tagPaths(tags, edges);
    expect(paths.get('a')).toEqual(['技巧']);
    expect(paths.get('b')).toEqual(['技巧 › 修辞']);
    expect(paths.get('c')).toEqual(['手法 › 比喻', '技巧 › 修辞 › 比喻']);
  });
});
```

`apps/client/src/layout/columnBar.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { barShownAfterScroll } from './columnBar';

describe('barShownAfterScroll', () => {
  it('hides going down, shows going up, and always shows at the top', () => {
    expect(barShownAfterScroll(true, 100, 160)).toBe(false);
    expect(barShownAfterScroll(false, 160, 120)).toBe(true);
    expect(barShownAfterScroll(false, 30, 4)).toBe(true);
    expect(barShownAfterScroll(false, 160, 161)).toBe(false);
    expect(barShownAfterScroll(true, 160, 159)).toBe(true);
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/reading apps/client/src/tags/tagPaths.test.ts apps/client/src/layout`
Expected: FAIL: the modules don't exist.

- [ ] **Step 2: Implement**

`apps/client/src/reading/readingStyle.ts`:
```ts
/** Reading settings for the article and memo columns (spec §6.10), kept on this device. */
export type Typeface = 'song' | 'hei' | 'kai';
export type ReadingKind = 'article' | 'memo';

export interface ReadingStyle {
  typeface: Typeface;
  /** Font size in px. */
  size: number;
  lineHeight: number;
  /** Line width in em; 0 means the full column. */
  width: number;
}

export const DEFAULT_STYLE: Record<ReadingKind, ReadingStyle> = {
  article: { typeface: 'song', size: 18, lineHeight: 1.9, width: 40 },
  memo: { typeface: 'song', size: 16, lineHeight: 1.8, width: 0 },
};

export const LIMITS = {
  size: { min: 14, max: 26, step: 1 },
  lineHeight: { min: 1.4, max: 2.6, step: 0.1 },
  width: { min: 30, max: 50, step: 5 },
} as const;

const FONT_STACK: Record<Typeface, string> = {
  song: 'var(--font-read)',
  hei: 'var(--font-ui)',
  kai: "'Kaiti SC', 'STKaiti', 'KaiTi', 'BiauKai', 'AR PL UKai CN', var(--font-read)",
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A stored style, repaired: unknown or missing values fall back to the defaults, numbers are kept in range. */
export function parseStyle(raw: unknown, kind: ReadingKind): ReadingStyle {
  const d = DEFAULT_STYLE[kind];
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const typeface = o.typeface === 'song' || o.typeface === 'hei' || o.typeface === 'kai' ? o.typeface : d.typeface;
  const width = num(o.width, d.width);
  return {
    typeface,
    size: clamp(Math.round(num(o.size, d.size)), LIMITS.size.min, LIMITS.size.max),
    lineHeight: round1(clamp(num(o.lineHeight, d.lineHeight), LIMITS.lineHeight.min, LIMITS.lineHeight.max)),
    width: width === 0 ? 0 : clamp(Math.round(width / LIMITS.width.step) * LIMITS.width.step, LIMITS.width.min, LIMITS.width.max),
  };
}

/** One step up or down; the width steps from its widest setting to the full column and back. */
export function stepStyle(style: ReadingStyle, field: 'size' | 'lineHeight' | 'width', direction: 1 | -1): ReadingStyle {
  if (field === 'width') {
    if (style.width === 0) return direction === -1 ? { ...style, width: LIMITS.width.max } : style;
    const next = style.width + direction * LIMITS.width.step;
    return { ...style, width: next > LIMITS.width.max ? 0 : clamp(next, LIMITS.width.min, LIMITS.width.max) };
  }
  if (field === 'lineHeight') {
    return { ...style, lineHeight: round1(clamp(style.lineHeight + direction * LIMITS.lineHeight.step, LIMITS.lineHeight.min, LIMITS.lineHeight.max)) };
  }
  return { ...style, size: clamp(style.size + direction * LIMITS.size.step, LIMITS.size.min, LIMITS.size.max) };
}

/** The CSS custom properties a column reads: `--read-*` for articles, `--memo-*` for memos. */
export function styleVars(style: ReadingStyle, kind: ReadingKind): Record<string, string> {
  const p = kind === 'article' ? '--read' : '--memo';
  return {
    [`${p}-font`]: FONT_STACK[style.typeface],
    [`${p}-size`]: `${style.size}px`,
    [`${p}-line`]: String(style.lineHeight),
    [`${p}-width`]: style.width === 0 ? (kind === 'article' ? '1fr' : 'none') : `${style.width}em`,
  };
}
```

`apps/client/src/reading/useReadingStyle.ts`:
```ts
import { useState } from 'react';
import { DEFAULT_STYLE, parseStyle, type ReadingKind, type ReadingStyle } from './readingStyle';

/** A column's reading style, kept in localStorage on this device (spec §6.10); storage may be blocked. */
export function useReadingStyle(kind: ReadingKind): [ReadingStyle, (next: ReadingStyle) => void] {
  const key = `jot.reading.${kind}`;
  const [style, setStyle] = useState<ReadingStyle>(() => {
    try {
      const raw = localStorage.getItem(key);
      return parseStyle(raw ? (JSON.parse(raw) as unknown) : null, kind);
    } catch {
      return DEFAULT_STYLE[kind];
    }
  });
  const update = (next: ReadingStyle) => {
    setStyle(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // storage blocked: keep the style for this session only
    }
  };
  return [style, update];
}
```

`apps/client/src/tags/tagPaths.ts`:
```ts
/**
 * Every path from a top-level tag down to each tag, as names joined by ` › ` (the Tags page, spec §6.10).
 * A tag with several parents has several paths. The tag graph has no cycles (§6.4).
 */
export function tagPaths(
  tags: readonly { id: string; name: string }[],
  edges: readonly { parent_id: string; child_id: string }[],
): Map<string, string[]> {
  const names = new Map(tags.map((t) => [t.id, t.name]));
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (names.has(e.parent_id) && names.has(e.child_id)) parents.set(e.child_id, [...(parents.get(e.child_id) ?? []), e.parent_id]);
  }
  const chains = (id: string, seen: ReadonlySet<string>): string[][] => {
    const up = (parents.get(id) ?? []).filter((p) => !seen.has(p));
    if (up.length === 0) return [[id]];
    return up.flatMap((p) => chains(p, new Set([...seen, id])).map((c) => [...c, id]));
  };
  return new Map(tags.map((t) => [t.id, chains(t.id, new Set()).map((c) => c.map((x) => names.get(x) ?? '').join(' › ')).sort()]));
}
```

`apps/client/src/layout/columnBar.ts`:
```ts
/**
 * Whether a column's bar shows after a scroll from `lastY` to `y` (spec §6.10): it hides while the
 * writer scrolls down, shows when they scroll up, and always shows at the top.
 */
export function barShownAfterScroll(shown: boolean, lastY: number, y: number): boolean {
  if (y <= 8) return true;
  if (y > lastY) return false;
  if (y < lastY) return true;
  return shown;
}
```

- [ ] **Step 3: Run the tests, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/reading apps/client/src/tags/tagPaths.test.ts apps/client/src/layout && pnpm test && pnpm typecheck && pnpm lint'`
Expected: 5 passed; everything else green.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src
git commit -m "feat(client): reading styles, tag paths and the column bar rule"
```

---

### Task 3: The article column: bar, Aa, ☰, Edit details, and the floating fix bar

**Files:**
- Create:
  - `apps/client/src/components/Menu.tsx`, `ColumnBar.tsx`, `ReadingControls.tsx`, `ArticleDetailsDialog.tsx`
  - `apps/client/e2e/article-bar.spec.ts`
- Modify:
  - `apps/client/src/components/ArticlePane.tsx`
  - `apps/client/src/i18n/en.ts`, `zh-CN.ts`
  - `apps/client/src/styles/app.css`
  - `apps/client/e2e/helpers.ts`, `edit.spec.ts`, `orphans.spec.ts`
- Test: `apps/client/e2e/article-bar.spec.ts`, `edit.spec.ts`, `orphans.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `updateArticleDetails` and `EmptyTitleError`;
  - from Task 2: `useReadingStyle`, `styleVars`, `stepStyle`, `DEFAULT_STYLE` and `barShownAfterScroll`.
- Produces (Tasks 4–6 use these):
  - `<Menu label items testId onOpenChange? />` with `interface MenuItem { label: string; onSelect(): void; testId: string }`. The ☰ button carries `testId`, each item its own `testId`.
  - `<ColumnBar scrollSelector pinned testId>…</ColumnBar>`, with `data-shown="true|false"`.
  - `<ReadingControls kind style onChange onOpenChange? />`, with test IDs:
    - `reading-open` and `reading-panel`;
    - `reading-font-song|hei|kai`;
    - `reading-size`, `reading-lineHeight` and `reading-width`, each with `-up` and `-down`;
    - `reading-reset`.
  - `<ArticleDetailsDialog article={{ id, title, author, source }} onClose />`, with test IDs `details-dialog`, `details-title`, `details-author`, `details-source` and `details-save`.
  - Article bar test IDs:
    - `article-bar`;
    - `article-menu`, with items `edit-start`, `article-details` and `article-delete`.
  - e2e helper `startFixing(page)`.

- [ ] **Step 1: Write the failing tests**

`apps/client/e2e/article-bar.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { importText, openApp, startFixing } from './helpers';

test('Aa changes the typeface, size, line spacing and width, and they stay after a reload', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他用比喻写春天。');
  const bar = page.getByTestId('article-bar');
  await bar.getByTestId('reading-open').click();
  await bar.getByTestId('reading-font-kai').click();
  await bar.getByTestId('reading-size-up').click();
  await bar.getByTestId('reading-size-up').click();
  await expect(bar.getByTestId('reading-size')).toHaveText('20px');
  await bar.getByTestId('reading-lineHeight-up').click();
  await expect(bar.getByTestId('reading-lineHeight')).toHaveText('2.0');
  await bar.getByTestId('reading-width-down').click();
  await expect(bar.getByTestId('reading-width')).toHaveText('35em');
  const view = page.getByTestId('article-view');
  await expect(view).toHaveCSS('font-size', '20px');
  await expect(view).toHaveCSS('line-height', '40px');
  expect(await view.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Kai');

  // The in-memory library is gone after a reload; the reading style is not.
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await importText(page, '秋', '秋水共长天一色。');
  await expect(page.getByTestId('article-view')).toHaveCSS('font-size', '20px');
  await page.getByTestId('article-bar').getByTestId('reading-open').click();
  await page.getByTestId('article-bar').getByTestId('reading-reset').click();
  await expect(page.getByTestId('article-view')).toHaveCSS('font-size', '18px');
});

test('☰ holds Fix text, Edit details and Delete; the fix bar floats at the bottom (Review Focus 3)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '他用比喻写春天。');
  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-details').click();
  await page.getByTestId('details-title').fill('春之歌');
  await page.getByTestId('details-author').fill('佚名');
  await page.getByTestId('details-save').click();
  await expect(page.getByTestId('article-title')).toHaveText('春之歌');
  await expect(page.getByTestId('library-list')).toContainText('春之歌');

  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-details').click();
  await page.getByTestId('details-title').fill('   ');
  await page.getByTestId('details-save').click();
  await expect(page.getByTestId('details-dialog')).toContainText('needs a title');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('article-title')).toHaveText('春之歌');

  await startFixing(page);
  const fixBar = await page.getByTestId('edit-bar').boundingBox();
  const viewport = page.viewportSize();
  expect(fixBar && viewport && fixBar.y + fixBar.height).toBeGreaterThan((viewport?.height ?? 0) - 80);
  await page.getByTestId('edit-cancel').click();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-delete').click();
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await page.getByTestId('trash-open').click();
  await expect(page.getByTestId('trash-entry')).toContainText('春之歌');
});

test('the bar hides while scrolling down and comes back on scrolling up or hovering at the top (Review Focus 5)', async ({ page }) => {
  await openApp(page);
  const long = Array.from({ length: 80 }, (_, i) => `第${i + 1}段，写春天的景色。`).join('\n\n');
  await importText(page, '长文', long);
  const bar = page.getByTestId('article-bar');
  const reader = page.locator('main.reader');
  await expect(bar).toHaveAttribute('data-shown', 'true');
  await reader.evaluate((el) => el.scrollBy(0, 600));
  await expect(bar).toHaveAttribute('data-shown', 'false');
  await reader.evaluate((el) => el.scrollBy(0, -200));
  await expect(bar).toHaveAttribute('data-shown', 'true');
  await reader.evaluate((el) => el.scrollBy(0, 300));
  await expect(bar).toHaveAttribute('data-shown', 'false');
  const box = await reader.boundingBox();
  if (!box) throw new Error('reader not rendered');
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await expect(bar).toHaveAttribute('data-shown', 'true');
  // With a panel open the bar stays.
  await bar.getByTestId('reading-open').click();
  await reader.evaluate((el) => el.scrollBy(0, 300));
  await expect(bar).toHaveAttribute('data-shown', 'true');
});
```

In `apps/client/e2e/helpers.ts`, append:
```ts
/** Starts fix-up mode from the article's ☰ menu (spec §6.10). */
export async function startFixing(page: Page): Promise<void> {
  await page.getByTestId('article-menu').click();
  await page.getByTestId('edit-start').click();
}
```

In `apps/client/e2e/edit.spec.ts` and `apps/client/e2e/orphans.spec.ts`:
- add `startFixing` to the `./helpers` import;
- replace every `await page.getByTestId('edit-start').click();` with `await startFixing(page);`;
- in `edit.spec.ts` 'discarding the changes leaves the text as it was', replace `await expect(page.getByTestId('edit-start')).toBeVisible();` with `await expect(page.getByTestId('article-menu')).toBeVisible();`.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e article-bar --project chromium --timeout 20000`
Expected: FAIL: there is no `article-bar`.

- [ ] **Step 2: Implement the primitives**

`apps/client/src/components/Menu.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  onSelect(): void;
  testId: string;
}

interface Props {
  label: string;
  items: readonly MenuItem[];
  testId: string;
  onOpenChange?(open: boolean): void;
}

/** A ☰ button with a small menu (spec §6.10); Escape, a click elsewhere or choosing an item closes it. */
export function Menu({ label, items, testId, onOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const changed = useRef(onOpenChange);
  changed.current = onOpenChange;

  useEffect(() => {
    changed.current?.(open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
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

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        className="icon menu-button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid={testId}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((item) => (
            <button
              key={item.testId}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              data-testid={item.testId}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

`apps/client/src/components/ColumnBar.tsx`:
```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { barShownAfterScroll } from '../layout/columnBar';

/** The pointer this close to the top of the column brings the bar back. */
const REVEAL_PX = 48;

interface Props {
  /** The column's scrolling element, found from the bar (`.reader` or `.memo`). */
  scrollSelector: string;
  /** A panel of the bar is open: it stays shown. */
  pinned: boolean;
  testId: string;
  children: ReactNode;
}

/**
 * The slim bar at the top of a column (spec §6.10): it hides while the writer scrolls down, and comes back
 * when they scroll up or the pointer reaches the top of the column.
 */
export function ColumnBar({ scrollSelector, pinned, testId, children }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const scroller = barRef.current?.closest<HTMLElement>(scrollSelector);
    if (!scroller) return;
    let last = scroller.scrollTop;
    const onScroll = () => {
      const y = scroller.scrollTop;
      setShown((s) => barShownAfterScroll(s, last, y));
      last = y;
    };
    const onMove = (e: MouseEvent) => {
      if (e.clientY - scroller.getBoundingClientRect().top < REVEAL_PX) setShown(true);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('mousemove', onMove);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('mousemove', onMove);
    };
  }, [scrollSelector]);

  const visible = shown || pinned;
  return (
    <div ref={barRef} className={visible ? 'column-bar' : 'column-bar hidden'} data-shown={visible} data-testid={testId}>
      {children}
    </div>
  );
}
```

`apps/client/src/components/ReadingControls.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_STYLE, stepStyle, type ReadingKind, type ReadingStyle, type Typeface } from '../reading/readingStyle';

const FONT_LABEL = { song: 'reading.fontSong', hei: 'reading.fontHei', kai: 'reading.fontKai' } as const satisfies Record<Typeface, string>;

interface Props {
  kind: ReadingKind;
  style: ReadingStyle;
  onChange(next: ReadingStyle): void;
  onOpenChange?(open: boolean): void;
}

/** The Aa button and its panel (spec §6.10): typeface, size, line spacing and line width. */
export function ReadingControls({ kind, style, onChange, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const changed = useRef(onOpenChange);
  changed.current = onOpenChange;

  useEffect(() => {
    changed.current?.(open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
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

  const stepper = (field: 'size' | 'lineHeight' | 'width', label: string, value: string) => (
    <div className="reading-row">
      <span>{label}</span>
      <button type="button" aria-label={`${label} −`} onClick={() => onChange(stepStyle(style, field, -1))} data-testid={`reading-${field}-down`}>
        −
      </button>
      <output data-testid={`reading-${field}`}>{value}</output>
      <button type="button" aria-label={`${label} +`} onClick={() => onChange(stepStyle(style, field, 1))} data-testid={`reading-${field}-up`}>
        +
      </button>
    </div>
  );

  return (
    <div className="reading" ref={rootRef}>
      <button
        type="button"
        className="icon reading-button"
        aria-label={t('reading.open')}
        title={t('reading.open')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="reading-open"
      >
        Aa
      </button>
      {open && (
        <div className="reading-panel" role="dialog" aria-label={t('reading.open')} data-testid="reading-panel">
          <div className="reading-fonts" role="radiogroup" aria-label={t('reading.typeface')}>
            {(['song', 'hei', 'kai'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={style.typeface === f}
                className={style.typeface === f ? 'active' : undefined}
                onClick={() => onChange({ ...style, typeface: f })}
                data-testid={`reading-font-${f}`}
              >
                {t(FONT_LABEL[f])}
              </button>
            ))}
          </div>
          {stepper('size', t('reading.size'), `${style.size}px`)}
          {stepper('lineHeight', t('reading.lineHeight'), style.lineHeight.toFixed(1))}
          {stepper('width', t('reading.width'), style.width === 0 ? t('reading.full') : `${style.width}em`)}
          <button type="button" className="quiet" onClick={() => onChange(DEFAULT_STYLE[kind])} data-testid="reading-reset">
            {t('reading.reset')}
          </button>
        </div>
      )}
    </div>
  );
}
```

`apps/client/src/components/ArticleDetailsDialog.tsx`:
```tsx
import { EmptyTitleError, updateArticleDetails } from '@jot/db';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibrary } from '../data/LibraryContext';

interface Props {
  article: { id: string; title: string; author: string | null; source: string | null };
  onClose(): void;
}

/** Edit an article's title, author and source (spec §6.10). */
export function ArticleDetailsDialog({ article, onClose }: Props) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(article.title);
  const [author, setAuthor] = useState(article.author ?? '');
  const [source, setSource] = useState(article.source ?? '');
  const [error, setError] = useState<string | null>(null);

  // A modal <dialog>, as the import dialog: Escape fires `cancel`, and focus goes back to the opener.
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await updateArticleDetails(lib, article.id, { title, author, source });
      onClose();
    } catch (err) {
      setError(err instanceof EmptyTitleError ? t('details.emptyTitle') : `${t('app.error')} ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="details-heading"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      data-testid="details-dialog"
    >
      <form onSubmit={(e) => void submit(e)}>
        <h2 id="details-heading">{t('details.heading')}</h2>
        <label>
          {t('details.title')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="details-title" />
        </label>
        <label>
          {t('details.author')}
          <input value={author} onChange={(e) => setAuthor(e.target.value)} data-testid="details-author" />
        </label>
        <label>
          {t('details.source')}
          <input value={source} onChange={(e) => setSource(e.target.value)} data-testid="details-source" />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="quiet" onClick={onClose}>
            {t('details.cancel')}
          </button>
          <button type="submit" data-testid="details-save">
            {t('details.save')}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
```

- [ ] **Step 3: Wire the article column**

In `apps/client/src/components/ArticlePane.tsx`:
1. Imports:
   - add `deleteArticle` to the `@jot/db` import;
   - change the react import to `import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';`;
   - add these imports:
```ts
import { styleVars } from '../reading/readingStyle';
import { useReadingStyle } from '../reading/useReadingStyle';
import { navigate } from '../router';
import { ArticleDetailsDialog } from './ArticleDetailsDialog';
import { ColumnBar } from './ColumnBar';
import { Menu } from './Menu';
import { ReadingControls } from './ReadingControls';
```
2. After `const [pendingSave, setPendingSave] = …`, add:
```ts
  const [style, setStyle] = useReadingStyle('article');
  const [readingOpen, setReadingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
```
3. After `saveEdit`, add:
```ts
  const removeArticle = async () => {
    if (!window.confirm(t('library.confirmDelete', { title: a.title }))) return;
    await deleteArticle(lib, articleId);
    navigate({ name: 'home' });
  };
```
4. Replace the start of the returned JSX `<div className="article-layout" ref={layoutRef}>` with:
```tsx
    <div className="article-pane" style={styleVars(style, 'article') as CSSProperties}>
      <ColumnBar scrollSelector=".reader" pinned={readingOpen || menuOpen} testId="article-bar">
        <ReadingControls kind="article" style={style} onChange={setStyle} onOpenChange={setReadingOpen} />
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
      </ColumnBar>
    <div className="article-layout" ref={layoutRef}>
```
5. Remove the whole `{editing ? (<div className="edit-bar" …>…</div>) : (<div className="article-tools">…</div>)}` block from inside `<article>`.
6. After the closing `</div>` of `.article-layout` (the one that ends the returned tree today), add the floating bars and the dialog, and close the new wrapper:
```tsx
      {editing ? (
        <div className="edit-bar floating" role="region" aria-label={t('edit.heading')} data-testid="edit-bar">
          <span className="muted">{t('edit.hint')}</span>
          <button type="button" onClick={() => void saveEdit()} disabled={saving || pendingSave !== null} data-testid="edit-save">
            {t('edit.save')}
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => {
              rememberScroll();
              setEditing(false);
            }}
            disabled={saving || pendingSave !== null}
            data-testid="edit-cancel"
          >
            {t('edit.cancel')}
          </button>
        </div>
      ) : (
        editNotice && (
          <div className="floating">
            <EditNotice result={editNotice} onDismiss={() => setEditNotice(null)} />
          </div>
        )
      )}
      {editingDetails && <ArticleDetailsDialog article={a} onClose={() => setEditingDetails(false)} />}
    </div>
```

In `apps/client/src/i18n/en.ts`:
- in `article`, add `menu: 'Article actions',`
- after the `memoList` block, add:
```ts
  reading: {
    open: 'Reading style',
    typeface: 'Typeface',
    fontSong: 'Song',
    fontHei: 'Hei',
    fontKai: 'Kai',
    size: 'Size',
    lineHeight: 'Line spacing',
    width: 'Line width',
    full: 'Full',
    reset: 'Reset',
  },
  details: {
    open: 'Edit details…',
    heading: 'Article details',
    title: 'Title',
    author: 'Author',
    source: 'Source',
    save: 'Save',
    cancel: 'Cancel',
    emptyTitle: 'An article needs a title.',
  },
```

In `apps/client/src/i18n/zh-CN.ts`:
- in `article`, add `menu: '文章操作',`
- after the `memoList` block, add:
```ts
  reading: {
    open: '阅读样式',
    typeface: '字体',
    fontSong: '宋体',
    fontHei: '黑体',
    fontKai: '楷体',
    size: '字号',
    lineHeight: '行距',
    width: '行宽',
    full: '全宽',
    reset: '恢复默认',
  },
  details: {
    open: '编辑信息…',
    heading: '文章信息',
    title: '标题',
    author: '作者',
    source: '来源',
    save: '保存',
    cancel: '取消',
    emptyTitle: '文章需要标题。',
  },
```

In `apps/client/src/styles/app.css`:
- replace
  - `.article-layout { position: relative; display: grid; grid-template-columns: minmax(0, 40em) 240px; gap: 32px; padding: 48px 32px 120px 48px; }`
  - with `.article-layout { position: relative; display: grid; grid-template-columns: minmax(0, var(--read-width, 40em)) 240px; gap: 32px; padding: 24px 32px 120px 48px; }`
- replace
  - `.article-view { font-family: var(--font-read); font-size: 18px; line-height: 1.9; }`
  - with `.article-view { font-family: var(--read-font, var(--font-read)); font-size: var(--read-size, 18px); line-height: var(--read-line, 1.9); }`
- delete the three `.article-tools` rules;
- replace the `.edit-bar { position: sticky; … }` rule with `.edit-bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; font-size: 13px; background: var(--panel); border: 1px solid var(--accent); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); }`
- append:
```css
/* Column bars, menus and reading controls */
.article-pane { display: flex; flex-direction: column; min-height: 100%; }
.column-bar { position: sticky; top: 0; z-index: 8; display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 36px; flex: none; padding: 0 12px; background: var(--bg); border-bottom: 1px solid var(--line); transition: transform 0.18s ease; }
.column-bar.hidden { transform: translateY(-100%); }
.column-bar .icon { display: inline-flex; align-items: center; padding: 4px 8px; color: var(--muted); background: none; border: none; }
.floating { position: sticky; bottom: 16px; z-index: 8; align-self: center; width: min(640px, calc(100% - 32px)); margin: auto 0 16px; }
.menu { position: relative; display: inline-flex; }
.menu-list { position: absolute; right: 0; top: calc(100% + 4px); z-index: 30; display: flex; flex-direction: column; min-width: 180px; padding: 4px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); }
.menu-list button { padding: 6px 10px; font-size: 13px; text-align: left; background: none; border: none; border-radius: 4px; }
.menu-list button:hover { background: var(--panel); }
.reading { position: relative; }
.reading-button { font-family: var(--font-read); font-size: 15px; }
.reading-panel { position: absolute; left: 0; top: calc(100% + 4px); z-index: 30; display: flex; flex-direction: column; gap: 8px; width: 260px; padding: 12px; font-size: 13px; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); }
.reading-fonts { display: flex; gap: 4px; }
.reading-fonts button { flex: 1; }
.reading-fonts button.active { color: var(--accent); border-color: var(--accent); }
.reading-row { display: flex; align-items: center; gap: 6px; }
.reading-row > span { flex: 1; color: var(--muted); }
.reading-row output { min-width: 48px; text-align: center; }
```

- [ ] **Step 4: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: everything passes.

Restart the services, then run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e article-bar edit orphans annotate notes popover`
Expected:
- `article-bar` passes 3 on each browser;
- `edit`, `orphans`, `annotate`, `notes` and `popover` stay green, with their known skips (the Chromium-only input-method test).

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client): the article bar with Aa and ☰, edit details, and the fix bar floating at the bottom"
```

---

### Task 4: The memo column: tab strip, bar, and Move to article

**Files:**
- Create: `apps/client/src/components/ArticlePicker.tsx`, `apps/client/e2e/memo-bar.spec.ts`
- Modify:
  - `apps/client/src/components/MemoPane.tsx`
  - `apps/client/src/i18n/en.ts`, `zh-CN.ts`
  - `apps/client/src/styles/app.css`
  - `apps/client/e2e/memo.spec.ts`, `backlinks.spec.ts`
- Test: `apps/client/e2e/memo-bar.spec.ts`, `memo.spec.ts`, `backlinks.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `setMemoHome`;
  - from Task 2: `useReadingStyle('memo')` and `styleVars`;
  - from Task 3: `ColumnBar`, `Menu` and `ReadingControls`.
- Produces:
  - `<ArticlePicker heading onPick onClose />`, with test IDs `article-picker`, `picker-search` and `picker-item`;
  - memo test IDs:
    - `memo-tabs`;
    - `memo-bar`;
    - `memo-menu`, with items `memo-move` and `memo-delete`.

- [ ] **Step 1: Write the failing tests**

`apps/client/e2e/memo-bar.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

test('a memo whose article is deleted moves to another article (spec §10 step 8, Review Focus 2)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.insertText('写景起笔');
  await page.waitForTimeout(1_000);
  await importText(page, '秋', '秋水共长天一色。');
  await page.getByTestId('library-list').getByRole('link', { name: '春' }).click();
  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-delete').click();

  await page.getByTestId('memo-list-item').click();
  await page.getByTestId('memo-menu').click();
  await page.getByTestId('memo-move').click();
  await page.getByTestId('picker-search').fill('秋');
  await expect(page.getByTestId('picker-item')).toHaveCount(1);
  await page.getByTestId('picker-item').click();
  await expect(page.getByTestId('article-title')).toHaveText('秋');
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
  await expect(page.locator('.memo-tab.active').getByRole('button', { name: 'Close memo' })).toHaveCount(0);
  await expect(page.getByTestId('memo-editor')).toContainText('写景起笔');
  await expect(page.getByTestId('memo-list-item')).toContainText('秋');
});

test('the memo has its own Aa settings, and no heading', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-pane').getByRole('heading', { name: 'Memo' })).toHaveCount(0);
  const bar = page.getByTestId('memo-bar');
  await bar.getByTestId('reading-open').click();
  await bar.getByTestId('reading-size-down').click();
  await expect(page.getByTestId('memo-editor')).toHaveCSS('font-size', '15px');
  await expect(page.getByTestId('article-view')).toHaveCSS('font-size', '18px');
});

test('many memo tabs stay on one row that scrolls sideways, each as tall as the strip (Review Focus 4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  for (let i = 0; i < 8; i++) await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(8);
  const strip = page.getByTestId('memo-tabs');
  const tops = await page.getByTestId('memo-tab').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const stripBox = await strip.boundingBox();
  const tabBox = await page.getByTestId('memo-tab').first().boundingBox();
  expect(Math.abs((stripBox?.height ?? 0) - (tabBox?.height ?? 0))).toBeLessThan(2);
});
```

In `apps/client/e2e/memo.spec.ts` and `apps/client/e2e/backlinks.spec.ts`, replace each `await page.getByTestId('memo-delete').click();` with:
```ts
  await page.getByTestId('memo-menu').click();
  await page.getByTestId('memo-delete').click();
```

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e memo-bar --project chromium --timeout 20000`
Expected: FAIL: there is no `memo-menu`.

- [ ] **Step 2: Implement**

`apps/client/src/components/ArticlePicker.tsx`:
```tsx
import { listArticles } from '@jot/db';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';

interface Props {
  heading: string;
  onPick(articleId: string): void;
  onClose(): void;
}

/** Choose an article (spec §6.10, "Move to article…"): a searchable list of the live articles. */
export function ArticlePicker({ heading, onPick, onClose }: Props) {
  const { t } = useTranslation();
  const { data: articles } = useLibraryQuery(listArticles, [], ['article']);
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = (articles ?? []).filter((a) => !q || a.title.toLowerCase().includes(q) || (a.author ?? '').toLowerCase().includes(q));

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="picker-heading"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      data-testid="article-picker"
    >
      <div className="picker">
        <h2 id="picker-heading">{heading}</h2>
        <input
          autoFocus
          value={query}
          placeholder={t('picker.search')}
          aria-label={t('picker.search')}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="picker-search"
        />
        {shown.length === 0 && <p className="muted">{t('picker.none')}</p>}
        <ul className="picker-list">
          {shown.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(a.id);
                  onClose();
                }}
                data-testid="picker-item"
              >
                <span>{a.title}</span>
                {a.author && <span className="muted">{a.author}</span>}
              </button>
            </li>
          ))}
        </ul>
        <footer>
          <button type="button" className="quiet" onClick={onClose}>
            {t('details.cancel')}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
```

In `apps/client/src/components/MemoPane.tsx`:
1. Change the `@jot/db` import to `import { createMemo, deleteMemo, getMemo, listMemos, renameMemo, setMemoHome, tagsOf, type MemoSummary } from '@jot/db';`, and the react import to `import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';`. Add:
```ts
import { styleVars } from '../reading/readingStyle';
import { useReadingStyle } from '../reading/useReadingStyle';
import { navigate } from '../router';
import { ArticlePicker } from './ArticlePicker';
import { ColumnBar } from './ColumnBar';
import { Menu } from './Menu';
import { ReadingControls } from './ReadingControls';
```
2. After `const [activeId, setActiveId] = useState<string | null>(null);`, add:
```ts
  const [style, setStyle] = useReadingStyle('memo');
  const [readingOpen, setReadingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moving, setMoving] = useState<MemoSummary | null>(null);
```
3. After `close`, add:
```ts
  // Moving a memo makes it a home memo of that article: show the article, with the memo open (spec §6.10).
  const moveTo = async (memo: MemoSummary, target: string) => {
    await setMemoHome(lib, memo.id, target);
    keepOpen(memo.id);
    setActiveId(memo.id);
    if (target !== articleId) navigate({ name: 'article', id: target });
  };
```
4. Replace the early return `if (!articleId && tabs.length === 0) { return (<>…</>); }` with:
```tsx
  if (!articleId && tabs.length === 0) {
    return (
      <p className="muted memo-empty" data-testid="memo-empty">
        {t('memo.noArticle')}
      </p>
    );
  }
```
5. Replace the returned `<div className="memo-pane">…</div>` with:
```tsx
    <div className="memo-pane" style={styleVars(style, 'memo') as CSSProperties}>
      <div className="memo-tabs" role="tablist" aria-label={t('memo.heading')} data-testid="memo-tabs">
        {tabs.map((m) => (
          <span key={m.id} className={m.id === active?.id ? 'memo-tab active' : 'memo-tab'}>
            <button type="button" role="tab" aria-selected={m.id === active?.id} onClick={() => setActiveId(m.id)} data-testid="memo-tab">
              {m.title}
            </button>
            {!homeMemos.some((h) => h.id === m.id) && (
              <button type="button" className="icon" aria-label={t('memo.close')} onClick={() => close(m.id)}>
                ×
              </button>
            )}
          </span>
        ))}
        {articleId && (
          <button type="button" className="icon memo-new" aria-label={t('memo.new')} title={t('memo.new')} onClick={() => create().catch(reportError)} data-testid="memo-new">
            +
          </button>
        )}
      </div>
      {active ? (
        <section className="memo-body" key={active.id}>
          <ColumnBar scrollSelector=".memo" pinned={readingOpen || menuOpen} testId="memo-bar">
            <ReadingControls kind="memo" style={style} onChange={setStyle} onOpenChange={setReadingOpen} />
            <Menu
              label={t('memo.menu')}
              testId="memo-menu"
              onOpenChange={setMenuOpen}
              items={[
                { label: t('memo.move'), onSelect: () => setMoving(active), testId: 'memo-move' },
                { label: t('memo.delete'), onSelect: () => void remove(active).catch(reportError), testId: 'memo-delete' },
              ]}
            />
          </ColumnBar>
          <div className="memo-content">
            <MemoTitle memo={active} />
            <MemoTags memoId={active.id} />
            <MemoEditor memoId={active.id} onReady={onReady} onFollow={follow} />
          </div>
        </section>
      ) : (
        <p className="muted memo-empty" data-testid="memo-empty">
          {t('memo.empty')}
        </p>
      )}
      {moving && (
        <ArticlePicker
          heading={t('memo.moveHeading', { title: moving.title })}
          onPick={(target) => void moveTo(moving, target).catch(reportError)}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
```

In `apps/client/src/i18n/en.ts`:
- in `memo`, add `menu: 'Memo actions',`, `move: 'Move to article…',` and `moveHeading: 'Move “{{title}}” to…',`
- after the `details` block, add:
```ts
  picker: {
    search: 'Find an article…',
    none: 'No matching articles',
  },
```

In `apps/client/src/i18n/zh-CN.ts`:
- in `memo`, add `menu: '札记操作',`, `move: '移到文章…',` and `moveHeading: '把《{{title}}》移到…',`
- after the `details` block, add:
```ts
  picker: {
    search: '查找文章…',
    none: '没有匹配的文章',
  },
```

In `apps/client/src/styles/app.css`:
- in `:root` add `--tabs: #e7e3db;`, and in the dark `:root` add `--tabs: #151412;`
- replace `.memo { flex: none; overflow: auto; padding: 16px; background: var(--panel); }` with `.memo { flex: none; overflow: auto; padding: 0; background: var(--panel); }`
- replace the rules for `.memo-pane`, `.memo-tabs`, `.memo-tab`, `.memo-tab > button`, `.memo-tab.active > button:first-child`, `.memo-tab .icon`, `.memo-body` and `.memo-body footer` with:
```css
.memo-pane { display: flex; flex-direction: column; min-height: 100%; }
.memo-tabs { position: sticky; top: 0; z-index: 9; display: flex; align-items: stretch; flex: none; height: 36px; overflow-x: auto; overflow-y: hidden; background: var(--tabs); scrollbar-width: thin; }
.memo-tab { display: inline-flex; align-items: stretch; flex: none; max-width: 180px; border-right: 1px solid var(--line); }
.memo-tab > button:first-child { overflow: hidden; height: 100%; padding: 0 12px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; background: none; border: none; border-radius: 0; }
.memo-tab.active { background: var(--panel); }
.memo-tab.active > button:first-child { color: var(--text); }
.memo-tab .icon { padding: 0 8px; color: var(--muted); background: none; border: none; }
.memo-new { flex: none; padding: 0 12px; color: var(--muted); background: none; border: none; }
.memo-body { display: flex; flex-direction: column; flex: 1; }
.memo .column-bar { top: 36px; z-index: 7; background: var(--panel); }
.memo-content { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 16px; }
.memo-empty { padding: 16px; }
.picker { display: flex; flex-direction: column; gap: 12px; padding: 20px; }
.picker-list { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow: auto; }
.picker-list button { display: flex; justify-content: space-between; gap: 12px; width: 100%; padding: 6px 8px; text-align: left; background: none; border: none; border-radius: 6px; }
.picker-list button:hover { background: var(--panel); }
```
- replace `.memo-editor { min-height: 280px; outline: none; font-family: var(--font-read); font-size: 16px; line-height: 1.8; }` with `.memo-editor { min-height: 280px; max-width: var(--memo-width, none); outline: none; font-family: var(--memo-font, var(--font-read)); font-size: var(--memo-size, 16px); line-height: var(--memo-line, 1.8); }`
- the `.memo > h2, .memo-header h2` and `.memo-header` rules are no longer used: delete them.

- [ ] **Step 3: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: everything passes.

Restart the services, then run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e memo-bar memo backlinks links suggest follow memolist`
Expected: `memo-bar` passes 3 on each browser; the others stay green, with their known skips.

- [ ] **Step 4: Commit**

```bash
git add apps/client
git commit -m "feat(client): the memo tab strip, the memo bar with Aa and ☰, and moving a memo to another article"
```

---

### Task 5: The section pages and the layout

**Files:**
- Create: `apps/client/src/components/SectionPages.tsx`, `apps/client/e2e/pages.spec.ts`
- Modify:
  - `apps/client/src/router.ts`, `router.test.ts`
  - `apps/client/src/components/Shell.tsx`, `Sidebar.tsx` (search state lifted), `MemoPane.tsx` (presence), `TagTree.tsx` (export `NameInput`)
  - `apps/client/src/i18n/en.ts`, `zh-CN.ts`
  - `apps/client/src/styles/app.css`
  - `apps/client/e2e/shell.spec.ts`
- Test: `apps/client/src/router.test.ts`, `apps/client/e2e/pages.spec.ts`, `apps/client/e2e/shell.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `tagUsage`;
  - from Task 2: `tagPaths`;
  - from Task 3: `Menu` and `ArticleDetailsDialog`;
  - from Task 4: `ArticlePicker`;
  - `listAllMemos` and `setMemoHome`.
- Produces:
  - Routes `library`, `memos` and `tags` ⇄ `#/library`, `#/memos` and `#/tags`.
  - `<LibraryPage />`, `<MemosPage />` and `<TagsPage onSearchTag />`, with test IDs:
    - `library-page`, `memos-page` and `tags-page`;
    - rows: `page-row`, `row-main`;
    - `row-menu`, with items `row-open`, `row-edit`, `row-move`, `row-rename` and `row-delete`.
  - `MemoPane` prop `onPresence(open: boolean)`.
  - `Sidebar` props `search` and `onSearch`, replacing its own state.
  - The memo column and its splitter show only while an article is open or a memo is open.

- [ ] **Step 1: Write the failing tests**

In `apps/client/src/router.test.ts`:
- in 'parses the known routes and falls back to home', add:
```ts
    expect(parseHash('#/library')).toEqual({ name: 'library' });
    expect(parseHash('#/memos')).toEqual({ name: 'memos' });
    expect(parseHash('#/tags')).toEqual({ name: 'tags' });
```
- in 'round-trips every route', add `{ name: 'library' }, { name: 'memos' }, { name: 'tags' }` to `routes`.

`apps/client/e2e/pages.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

/** Opens a page without a reload (the in-memory library would be lost). */
const goTo = (page: Page, hash: string) => page.evaluate((h) => (window.location.hash = h), hash);

test('the Library page lists articles; its row menu edits details and deletes; a row opens the article', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await importText(page, '秋', '秋水共长天一色。');
  await goTo(page, '#/library');
  const rows = page.getByTestId('library-page').getByTestId('page-row');
  await expect(rows).toHaveCount(2);
  const spring = rows.filter({ hasText: '春' });
  await spring.getByTestId('row-menu').click();
  await spring.getByTestId('row-edit').click();
  await page.getByTestId('details-author').fill('佚名');
  await page.getByTestId('details-save').click();
  await expect(spring).toContainText('佚名');
  await rows.filter({ hasText: '秋' }).getByTestId('row-menu').click();
  await rows.filter({ hasText: '秋' }).getByTestId('row-delete').click();
  await expect(rows).toHaveCount(1);
  await spring.getByTestId('row-main').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
});

test('the Memos page shows each memo's article; a row opens the memo with its article, and moves it', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('memo-new').click();
  await importText(page, '秋', '秋水共长天一色。');
  await goTo(page, '#/memos');
  const row = page.getByTestId('memos-page').getByTestId('page-row');
  await expect(row).toContainText('春');
  await row.getByTestId('row-menu').click();
  await row.getByTestId('row-move').click();
  await page.getByTestId('picker-search').fill('秋');
  await page.getByTestId('picker-item').click();
  await expect(row).toContainText('秋');
  await row.getByTestId('row-main').click();
  await expect(page.getByTestId('article-title')).toHaveText('秋');
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
});

test('the Tags page shows paths and counts; a row searches the tag; its menu renames and deletes', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await addTag(page, 'note-tags', '修辞');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
  await goTo(page, '#/tags');
  const row = page.getByTestId('tags-page').getByTestId('page-row');
  await expect(row).toContainText('修辞');
  await expect(row).toContainText('1');
  await row.getByTestId('row-main').click();
  await expect(page.getByTestId('search-tag')).toHaveText(['修辞']);
  await page.getByTestId('search-clear').click();
  await row.getByTestId('row-menu').click();
  await row.getByTestId('row-rename').click();
  await page.getByTestId('tag-rename-input').fill('修辞手法');
  await page.getByTestId('tag-rename-input').press('Enter');
  await expect(row).toContainText('修辞手法');
  await row.getByTestId('row-menu').click();
  await row.getByTestId('row-delete').click();
  await expect(row).toHaveCount(0);
});

test('the memo column shows only with an article or a memo open; the Trash takes the full width', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('memo-pane')).toBeHidden();
  await importText(page, '春', '春风又绿江南岸。');
  await expect(page.getByTestId('memo-pane')).toBeVisible();
  await page.getByTestId('trash-open').click();
  await expect(page.getByTestId('memo-pane')).toBeHidden();
  const reader = await page.locator('main.reader').boundingBox();
  const shell = await page.getByTestId('shell').boundingBox();
  const sidebar = await page.locator('nav.sidebar').boundingBox();
  expect(Math.round((reader?.width ?? 0) + (sidebar?.width ?? 0))).toBeGreaterThanOrEqual(Math.round((shell?.width ?? 0) - 2));
});
```

In `apps/client/e2e/shell.spec.ts`:
- change the helpers import to `import { importText, openApp } from './helpers';`
- replace the body of 'shows an empty library and the memo column' with:
```ts
  await openApp(page);
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('memo-pane')).toBeHidden();
  await importText(page, '春', '春风又绿江南岸。');
  await expect(page.getByTestId('memo-pane')).toBeVisible();
```
- in 'resizes the memo column by dragging the splitter', add `await importText(page, '春', '春风又绿江南岸。');` directly after `await openApp(page);`.

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/router.test.ts`
Expected: FAIL: `#/library` parses to `{ name: 'home' }`.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e pages shell --project chromium --timeout 20000`
Expected: FAIL: there is no `library-page`, and the memo pane is visible with no article.

- [ ] **Step 2: Implement routes, lifted search, presence and layout**

In `apps/client/src/router.ts`:
- `export type Route = { name: 'home' } | { name: 'article'; id: string } | { name: 'diagnostics' } | { name: 'trash' } | { name: 'library' } | { name: 'memos' } | { name: 'tags' };`
- in `parseHash`, after the trash line: `if (path === 'library' || path === 'memos' || path === 'tags') return { name: path };`
- in `routeHash`, add:
```ts
    case 'library':
      return '#/library';
    case 'memos':
      return '#/memos';
    case 'tags':
      return '#/tags';
```

In `apps/client/src/components/TagTree.tsx`, export the inline name field: change `function NameInput(` to `export function NameInput(`.

In `apps/client/src/components/MemoPane.tsx`:
- change the signature to `export function MemoPane({ articleId, onPresence }: { articleId: string | null; onPresence?(open: boolean): void }) {`
- after `const active = …;`, add:
```ts
  // The shell shows the memo column only while an article or a memo is open (spec §6.10).
  const present = tabs.length > 0;
  const presence = useRef(onPresence);
  presence.current = onPresence;
  useEffect(() => presence.current?.(present), [present]);
```

In `apps/client/src/components/Sidebar.tsx`:
- add `search: SearchState;` and `onSearch(next: SearchState): void;` to `SidebarProps`, and destructure them;
- remove `const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);` and the `useState` import if now unused;
- replace every `setSearch(` with `onSearch(` and every `onChange={setSearch}` with `onChange={onSearch}`.

In `apps/client/src/components/Shell.tsx`:
1. Imports: add `import { EMPTY_SEARCH, type SearchState } from './SearchPanel';` and `import { LibraryPage, MemosPage, TagsPage } from './SectionPages';`.
2. After the `sidebarCollapsed` state, add:
```ts
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [memoOpen, setMemoOpen] = useState(false);
  // The memo column is for an open article or memo; other screens take the full width (spec §6.10).
  const showMemo = activeId !== null || memoOpen;
  const searchTag = (tagId: string) => {
    setSearch({ ...EMPTY_SEARCH, tagIds: [tagId] });
    setSidebarCollapsed(false);
  };
```
3. Pass `search={search}` and `onSearch={setSearch}` to `<Sidebar>`.
4. Replace the `<main className="reader">…</main>` contents with:
```tsx
            {route.name === 'trash' ? (
              <TrashView />
            ) : route.name === 'library' ? (
              <LibraryPage />
            ) : route.name === 'memos' ? (
              <MemosPage />
            ) : route.name === 'tags' ? (
              <TagsPage onSearchTag={searchTag} />
            ) : activeId ? (
              <ArticlePane key={activeId} articleId={activeId} />
            ) : (
              <p className="empty">{t('article.none')}</p>
            )}
```
5. Replace the splitter and the aside with:
```tsx
          {showMemo && <Splitter width={memoWidth} min={240} max={720} onResize={setMemoWidth} />}
          <aside className="memo" style={{ width: memoWidth }} hidden={!showMemo} data-testid="memo-pane">
            <MemoPane articleId={activeId} onPresence={setMemoOpen} />
          </aside>
```

- [ ] **Step 3: Implement the pages**

`apps/client/src/components/SectionPages.tsx`:
```tsx
import {
  deleteArticle, deleteMemo, deleteTag, getArticle, listAllMemos, listArticles, listEdges, listTags, renameTag, setMemoHome, tagUsage,
  type ArticleDetail, type ArticleSummary, type MemoListItem, type TagRow,
} from '@jot/db';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { navigate, routeHash } from '../router';
import { useReportTagError } from '../tags/errors';
import { tagPaths } from '../tags/tagPaths';
import { ArticleDetailsDialog } from './ArticleDetailsDialog';
import { ArticlePicker } from './ArticlePicker';
import { Menu } from './Menu';
import { NameInput } from './TagTree';

/** The Library page (spec §6.10): every article, newest first, with its author and the date it was added. */
export function LibraryPage() {
  const { t, i18n } = useTranslation();
  const lib = useLibrary();
  const { data: articles } = useLibraryQuery(listArticles, [], ['article']);
  const [editing, setEditing] = useState<ArticleDetail | null>(null);

  const edit = async (id: string) => setEditing(await getArticle(lib, id));
  const remove = async (a: ArticleSummary) => {
    if (window.confirm(t('library.confirmDelete', { title: a.title }))) await deleteArticle(lib, a.id);
  };

  return (
    <section className="page" data-testid="library-page">
      <h1>{t('library.heading')}</h1>
      {articles?.length === 0 && <p className="muted">{t('library.empty')}</p>}
      <ul className="page-list">
        {articles?.map((a) => (
          <li key={a.id} className="page-row" data-testid="page-row">
            <a className="page-row-main" href={routeHash({ name: 'article', id: a.id })} data-testid="row-main">
              <strong>{a.title}</strong>
              <span className="muted">{[a.author, new Date(a.createdAt).toLocaleDateString(i18n.language)].filter(Boolean).join(' · ')}</span>
            </a>
            <Menu
              label={t('page.rowMenu')}
              testId="row-menu"
              items={[
                { label: t('page.open'), onSelect: () => navigate({ name: 'article', id: a.id }), testId: 'row-open' },
                { label: t('details.open'), onSelect: () => void edit(a.id).catch(reportError), testId: 'row-edit' },
                { label: t('library.delete'), onSelect: () => void remove(a).catch(reportError), testId: 'row-delete' },
              ]}
            />
          </li>
        ))}
      </ul>
      {editing && <ArticleDetailsDialog article={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** The Memos page (spec §6.10): every memo, most recently edited first, with its home article. */
export function MemosPage() {
  const { t } = useTranslation();
  const lib = useLibrary();
  const { bridge } = useMemoContext();
  const { data: memos } = useLibraryQuery(listAllMemos, [], ['memo', 'memo_update', 'article']);
  const [moving, setMoving] = useState<MemoListItem | null>(null);

  // A memo opens in the memo column, with its home article when it has one.
  const open = (m: MemoListItem) => {
    if (m.homeTitle !== null && m.homeArticleId) navigate({ name: 'article', id: m.homeArticleId });
    bridge.showMemo(m.id);
  };
  const remove = async (m: MemoListItem) => {
    if (window.confirm(t('memo.confirmDelete', { title: m.title }))) await deleteMemo(lib, m.id);
  };

  return (
    <section className="page" data-testid="memos-page">
      <h1>{t('memoList.heading')}</h1>
      {memos?.length === 0 && <p className="muted">{t('memoList.empty')}</p>}
      <ul className="page-list">
        {memos?.map((m) => (
          <li key={m.id} className="page-row" data-testid="page-row">
            <button type="button" className="page-row-main" onClick={() => open(m)} data-testid="row-main">
              <strong>{m.title}</strong>
              <span className="muted">{m.homeTitle ?? t('memoList.noArticle')}</span>
            </button>
            <Menu
              label={t('page.rowMenu')}
              testId="row-menu"
              items={[
                { label: t('page.open'), onSelect: () => open(m), testId: 'row-open' },
                { label: t('memo.move'), onSelect: () => setMoving(m), testId: 'row-move' },
                { label: t('memo.delete'), onSelect: () => void remove(m).catch(reportError), testId: 'row-delete' },
              ]}
            />
          </li>
        ))}
      </ul>
      {moving && (
        <ArticlePicker
          heading={t('memo.moveHeading', { title: moving.title })}
          onPick={(target) => void setMemoHome(lib, moving.id, target).catch(reportError)}
          onClose={() => setMoving(null)}
        />
      )}
    </section>
  );
}

/** The Tags page (spec §6.10): every tag with its paths and how many items it is on; a row searches it. */
export function TagsPage({ onSearchTag }: { onSearchTag(tagId: string): void }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const report = useReportTagError();
  const { data } = useLibraryQuery(
    async (l) => ({ tags: await listTags(l), edges: await listEdges(l), usage: await tagUsage(l) }),
    [],
    ['tag', 'tag_edge', 'tagging', 'article', 'markup', 'side_note', 'memo'],
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const paths = useMemo(() => tagPaths(data?.tags ?? [], data?.edges ?? []), [data]);
  const rows = useMemo(
    () => [...(data?.tags ?? [])].sort((a, b) => (paths.get(a.id)?.[0] ?? a.name).localeCompare(paths.get(b.id)?.[0] ?? b.name)),
    [data, paths],
  );

  const remove = (tag: TagRow) => {
    if (window.confirm(t('tags.confirmDelete', { name: tag.name }))) deleteTag(lib, tag.id).catch(report);
  };

  return (
    <section className="page" data-testid="tags-page">
      <h1>{t('tags.heading')}</h1>
      {rows.length === 0 && <p className="muted">{t('tags.empty')}</p>}
      <ul className="page-list">
        {rows.map((tag) => (
          <li key={tag.id} className="page-row" data-testid="page-row">
            {renaming === tag.id ? (
              <NameInput
                label={t('tags.renameLabel', { name: tag.name })}
                initial={tag.name}
                testId="tag-rename-input"
                onDone={(name) => {
                  setRenaming(null);
                  if (name && name !== tag.name) renameTag(lib, tag.id, name).catch(report);
                }}
              />
            ) : (
              <button type="button" className="page-row-main" onClick={() => onSearchTag(tag.id)} data-testid="row-main">
                <strong>{tag.name}</strong>
                <span className="muted">
                  {[(paths.get(tag.id) ?? []).filter((p) => p !== tag.name).join('；'), t('page.items', { count: data?.usage[tag.id] ?? 0 })]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            )}
            <Menu
              label={t('page.rowMenu')}
              testId="row-menu"
              items={[
                { label: t('tags.rename'), onSelect: () => setRenaming(tag.id), testId: 'row-rename' },
                { label: t('tags.delete'), onSelect: () => remove(tag), testId: 'row-delete' },
              ]}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

In `apps/client/src/i18n/en.ts`, after the `picker` block, add:
```ts
  page: {
    rowMenu: 'Actions',
    open: 'Open',
    items: 'Items: {{count}}',
  },
```

In `apps/client/src/i18n/zh-CN.ts`, after the `picker` block, add:
```ts
  page: {
    rowMenu: '操作',
    open: '打开',
    items: '条目：{{count}}',
  },
```

In `apps/client/src/styles/app.css`:
- replace `.trash { max-width: 720px; padding: 32px 48px; }` with `.trash { padding: 32px 48px; }`
- append:
```css
/* Section pages */
.page { padding: 32px 48px; }
.page h1 { margin: 0 0 16px; font-size: 22px; }
.page-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.page-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; }
.page-row .tag-name-input { flex: 1; }
.page-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 0; color: inherit; font: inherit; text-align: left; text-decoration: none; background: none; border: none; cursor: pointer; }
.page-row-main strong, .page-row-main span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 4: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: everything passes.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e pages shell trash memolist search tags`
Expected: `pages` passes 4 on each browser, and `shell` passes; the others stay green.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client): Library, Memos and Tags pages; the memo column only when an article or memo is open"
```

---

### Task 6: The sidebar: foldable sections, + import, no row delete, aligned tag input

**Files:**
- Create: `apps/client/src/components/SectionHeading.tsx`, `apps/client/e2e/sidebar.spec.ts`
- Modify:
  - `apps/client/src/components/Sidebar.tsx`, `TagTree.tsx`, `MemoList.tsx`, `Trash.tsx`
  - `apps/client/src/i18n/en.ts`, `zh-CN.ts`
  - `apps/client/src/styles/app.css`
  - `apps/client/e2e/helpers.ts`, `trash.spec.ts`, `data.spec.ts`, `follow.spec.ts`, `memolist.spec.ts`
- Test: `apps/client/e2e/sidebar.spec.ts` and the updated specs

**Interfaces:**
- Consumes: from Task 5, the routes `library`, `memos` and `tags`.
- Produces:
  - `<SectionHeading title route folded onFold action? testId />`, with test IDs `<testId>-fold` and `<testId>-open`. The test IDs are `section-library`, `section-memos` and `section-tags`.
  - Stored folds `jot.fold.library`, `jot.fold.memos` and `jot.fold.tags`.
  - e2e helper `deleteArticle(page, title)` (from the article's ☰ menu).

- [ ] **Step 1: Write the failing tests**

`apps/client/e2e/sidebar.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { deleteArticle, importText, openApp } from './helpers';

test('sections fold and remember it; their headings open the section pages', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。');
  await page.getByTestId('section-library-fold').click();
  await expect(page.getByTestId('library-list')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('library-list')).toHaveCount(0);
  await page.getByTestId('section-library-fold').click();
  await expect(page.getByTestId('library-list')).toBeVisible();
  await page.getByTestId('section-memos-open').click();
  await expect(page.getByTestId('memos-page')).toBeVisible();
  await page.getByTestId('section-tags-open').click();
  await expect(page.getByTestId('tags-page')).toBeVisible();
  await page.getByTestId('section-library-open').click();
  await expect(page.getByTestId('library-page')).toBeVisible();
});

test('Library + imports; article rows have no delete button; the Trash button shows no count', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.sidebar > header').getByTestId('import-open')).toHaveCount(0);
  await expect(page.getByTestId('section-library').getByTestId('import-open')).toBeVisible();
  await importText(page, '春', '春风又绿江南岸。');
  await expect(page.getByTestId('library-list').getByRole('button')).toHaveCount(0);
  page.once('dialog', (dialog) => void dialog.accept());
  await deleteArticle(page, '春');
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('trash-open')).toBeVisible();
  await expect(page.getByTestId('trash-count')).toHaveCount(0);
});

test('the new-tag input lines up with the tag names', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill('技巧');
  await page.getByTestId('tag-name-input').press('Enter');
  await page.getByTestId('tag-new').click();
  const input = await page.getByTestId('tag-name-input').boundingBox();
  const name = await page.getByTestId('tag-name').first().boundingBox();
  expect(Math.abs((input?.x ?? 0) - (name?.x ?? 100))).toBeLessThanOrEqual(2);
});
```

In `apps/client/e2e/helpers.ts`, append:
```ts
/** Moves an article to the Trash from its ☰ menu; the caller's dialog handler accepts the confirmation. */
export async function deleteArticle(page: Page, title: string): Promise<void> {
  await page.getByTestId('library-list').getByRole('link', { name: title }).click();
  await expect(page.getByTestId('article-title')).toHaveText(title);
  await page.getByTestId('article-menu').click();
  await page.getByTestId('article-delete').click();
}
```

Replace the article-row delete in the older specs with the helper, adding `deleteArticle` to each file's `./helpers` import:
- `apps/client/e2e/trash.spec.ts`: delete the local `async function deleteArticle(page: Page, title: string) {…}`. Its calls `deleteArticle(page, '春')` now use the helper.
- `apps/client/e2e/data.spec.ts`: replace
```ts
  const article = page.getByTestId('library-list').locator('li').filter({ hasText: '春' });
  await article.hover();
  await article.getByRole('button', { name: 'Delete' }).click();
```
  with `await deleteArticle(page, '春');`
- `apps/client/e2e/memolist.spec.ts`: replace
```ts
  const row = page.getByTestId('library-list').locator('li').filter({ hasText: '春' });
  await row.hover();
  await row.getByRole('button', { name: 'Delete' }).click();
```
  with `await deleteArticle(page, '春');`
- `apps/client/e2e/follow.spec.ts`: replace
```ts
  await page.getByTestId('library-list').getByRole('link', { name: '甲文' }).hover();
  await page.getByTestId('library-list').getByRole('button', { name: 'Delete' }).click();
```
  with `await deleteArticle(page, '甲文');`
- `apps/client/e2e/trash.spec.ts`: remove every `await expect(page.getByTestId('trash-count')).…` line. The count is gone (§6.10); sidebar.spec checks that.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar --project chromium --timeout 20000`
Expected: FAIL: there is no `section-library-fold`.

- [ ] **Step 2: Implement**

`apps/client/src/components/SectionHeading.tsx`:
```tsx
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeHash, type Route } from '../router';

interface Props {
  title: string;
  route: Route;
  folded: boolean;
  onFold(folded: boolean): void;
  action?: ReactNode;
  testId: string;
}

/** A sidebar section heading (spec §6.10): a fold arrow, the title opening the section's page, an optional action. */
export function SectionHeading({ title, route, folded, onFold, action, testId }: Props) {
  const { t } = useTranslation();
  return (
    <div className="section-heading" data-testid={testId}>
      <button
        type="button"
        className="icon section-fold"
        aria-label={t(folded ? 'sidebar.unfold' : 'sidebar.fold', { title })}
        aria-expanded={!folded}
        onClick={() => onFold(!folded)}
        data-testid={`${testId}-fold`}
      >
        {folded ? '▸' : '▾'}
      </button>
      <h2>
        <a href={routeHash(route)} data-testid={`${testId}-open`}>
          {title}
        </a>
      </h2>
      {action}
    </div>
  );
}
```

In `apps/client/src/components/Sidebar.tsx`:
1. Imports:
   - add `import { useStoredFlag } from '../data/useStoredNumber';` and `import { SectionHeading } from './SectionHeading';`;
   - remove `deleteArticle` and `type ArticleSummary` from `@jot/db` (keep `listArticles`);
   - remove `useLibrary`, and `navigate` from `../router` (keep `routeHash`) once unused.
2. Remove the `remove` function.
3. After `useLibraryQuery(listArticles…)`, add:
```ts
  const [libraryFolded, setLibraryFolded] = useStoredFlag('jot.fold.library', false);
  const [memosFolded, setMemosFolded] = useStoredFlag('jot.fold.memos', false);
  const [tagsFolded, setTagsFolded] = useStoredFlag('jot.fold.tags', false);
```
4. In `<header>`, remove the Import button (`data-testid="import-open"`).
5. Replace everything from `<h2>{t('library.heading')}</h2>` through the closing `</ul>` of `library-list` with:
```tsx
          <SectionHeading
            title={t('library.heading')}
            route={{ name: 'library' }}
            folded={libraryFolded}
            onFold={setLibraryFolded}
            testId="section-library"
            action={
              <button type="button" className="icon" aria-label={t('library.import')} title={t('library.import')} onClick={onImport} data-testid="import-open">
                +
              </button>
            }
          />
          {!libraryFolded && (
            <>
              {error && (
                <p className="error" role="alert">
                  {t('app.error')} {error.message}
                </p>
              )}
              {articles?.length === 0 && (
                <p className="muted" data-testid="library-empty">
                  {t('library.empty')}
                </p>
              )}
              <ul className="library" data-testid="library-list">
                {articles?.map((a) => (
                  <li key={a.id} className={a.id === activeId ? 'active' : undefined}>
                    <a href={routeHash({ name: 'article', id: a.id })}>{a.title}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
```
6. Replace `<MemoList />` with `<MemoList folded={memosFolded} onFold={setMemosFolded} />`, and `<TagTree onSelect=… />` with `<TagTree folded={tagsFolded} onFold={setTagsFolded} onSelect={(tagId) => onSearch({ ...EMPTY_SEARCH, tagIds: [tagId] })} />`.

In `apps/client/src/components/MemoList.tsx`:
- change the signature to `export function MemoList({ folded, onFold }: { folded: boolean; onFold(folded: boolean): void }) {`;
- add `import { SectionHeading } from './SectionHeading';`;
- replace `<h2>{t('memoList.heading')}</h2>` with `<SectionHeading title={t('memoList.heading')} route={{ name: 'memos' }} folded={folded} onFold={onFold} testId="section-memos" />`;
- render the empty message and the `<ul>` only when `!folded`.

In `apps/client/src/components/TagTree.tsx`:
1. Add `folded: boolean;` and `onFold(folded: boolean): void;` to its `Props`, and destructure them. Add `import { SectionHeading } from './SectionHeading';`.
2. Replace the contents of the `tags-heading` div (the `<h2>` and the `tag-new` button) with:
```tsx
        <SectionHeading
          title={t('tags.heading')}
          route={{ name: 'tags' }}
          folded={folded}
          onFold={onFold}
          testId="section-tags"
          action={
            <button type="button" className="icon" aria-label={t('tags.new')} title={t('tags.new')} onClick={() => setCreating(true)} data-testid="tag-new">
              +
            </button>
          }
        />
```
3. Wrap everything after the heading (the creating input, the empty message and the `<ul className="tag-tree">`) in `{!folded && (<>…</>)}`.
4. Put the new-tag input inside a tag row, so it lines up with the tag names:
```tsx
      {creating && (
        <div className="tag-row tag-new-row">
          <span className="tag-toggle" />
          <NameInput
            label={t('tags.new')}
            placeholder={t('tags.newPlaceholder')}
            initial=""
            testId="tag-name-input"
            onDone={(name) => {
              setCreating(false);
              if (name) createTag(lib, { name }).catch(report);
            }}
          />
        </div>
      )}
```

In `apps/client/src/components/Trash.tsx`, make `TrashButton` render only the icon: remove the `useLibraryQuery(countTrash …)` line, the count `<span>`, and `countTrash` and `useLibraryQuery` from the imports if unused.

In `apps/client/src/i18n/en.ts`, after the `page` block, add:
```ts
  sidebar: {
    fold: 'Fold {{title}}',
    unfold: 'Unfold {{title}}',
  },
```

In `apps/client/src/i18n/zh-CN.ts`, after the `page` block, add:
```ts
  sidebar: {
    fold: '收起{{title}}',
    unfold: '展开{{title}}',
  },
```

In `apps/client/src/styles/app.css`:
- replace `.tags-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; border-radius: 6px; }` with `.tags-heading { border-radius: 6px; }` (the section heading inside it brings its own spacing)
- delete `.tags-heading h2 { margin: 0; }`
- delete the `.trash-count` rule;
- append:
```css
/* Sidebar sections */
.section-heading { display: flex; align-items: center; gap: 2px; margin-top: 8px; }
.section-heading h2 { flex: 1; margin: 0; }
.section-heading h2 a { color: inherit; text-decoration: none; }
.section-heading h2 a:hover { color: var(--text); }
.section-fold { width: 18px; flex: none; padding: 0; text-align: center; }
.sidebar .section-fold { padding: 0; }
.tag-new-row .tag-name-input { flex: 1; }
```

- [ ] **Step 3: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: everything passes.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e sidebar shell trash data follow memolist tagtree tags import`
Expected: `sidebar` passes 3 on each browser; the others stay green, with their known skips.

- [ ] **Step 4: Commit**

```bash
git add apps/client
git commit -m "feat(client): foldable sidebar sections that open their pages, + import, no row delete, aligned tag input"
```

---

### Task 7: Docs and the full verification

**Files:**
- Modify: `README.md`
- Test: the complete suite on freshly started services

**Interfaces:** consumes everything above; produces nothing new.

- [ ] **Step 1: Update the README**

In `README.md`, directly before the `## Your data` heading, add:
```markdown
## Working in Jot

- The sidebar has **Library**, **Memos** and **Tags** sections. Fold one with its arrow; click its heading for a page
  listing everything in it, with a **☰** menu on each row. **+** next to Library imports an article.
- The article and memo columns have a slim bar that hides while you scroll down. **Aa** sets the typeface, size,
  line spacing and line width (for articles and memos separately, on this device). **☰** holds Fix text, Edit
  details… and Delete for an article, and Move to article… and Delete for a memo.
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
Expected: every command exits 0. The e2e run has no failures, and the only skips are the known WebKit ones.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: working in Jot (sections, pages, the column bars)"
```

---

## Done when

- **Sidebar:**
  - Library, Memos and Tags fold (remembered), and their headings open their pages.
  - Library's **+** imports.
  - Article rows have no delete button.
  - The Trash icon has no count.
  - The new-tag input lines up with the tags.
- **Section pages:** they list every article, memo and tag, with a **☰** on each row, and use the full width.
- **Article column:**
  - A slim bar with **Aa** and **☰** hides on scrolling down and returns on scrolling up or hovering at the top.
  - Edit details changes the title, author and source.
  - The fix bar floats at the bottom.
- **Memo column:**
  - No heading.
  - Full-height tabs on a strip that scrolls sideways.
  - A **+** icon.
  - Its own bar with **Aa** and **☰**; Move to article… re-homes any memo.
- **The memo column shows only when an article or a memo is open.**
- **Reading settings** survive a reload, separately for articles and memos.
- **Spec §10 step 8** passes as end-to-end tests. `pnpm typecheck && pnpm lint && pnpm test` and `cargo test` pass, and the e2e suite passes on Chromium and WebKit.
