# Jot Plan 3: Memos and Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer can keep analysis memos beside a model article (spec §6.5, milestone M5). Each memo is a rich-text document in the right-hand column.

**What the writer can do:**
- **Create memos:** an article can have many, and each gets its own tab.
- **Link passages:** a memo can link to a highlighted passage, a side note, or any quoted range, in this article or another.
- **Follow a link:** clicking a link opens the target article and scrolls to the passage, which flashes.
- **See what cites a passage:** a passage cited by a memo is marked, and clicking it offers to open the memo.

Memos save while you type and survive reloads and closed windows.

**Architecture:**
- **Editor:** each memo is a Yjs document edited by TipTap v3 with the `Collaboration` extension. There is no network provider (spec §6.5).
- **Saving:**
  - Local edits are batched and appended to `memo_update` as merged Yjs updates.
  - Each save also rewrites the local-only `memo_link` rows and `memo_cache.text` and re-indexes search, all in the same transaction.
  - On load, a memo with many updates is compacted into `memo_cache.snapshot`.
- **Links:** a custom inline TipTap node, `anchorLink`, stores `{linkId, targetType, targetId, articleId, label}`.
- **Linking the two columns:** a `MemoBridge` object lets the article column insert links into the active memo. A `FocusContext` lets memo links move the article column to a target.
- **Performance:** `useLibraryQuery` gains table filtering, so memo saves don't re-run every query.

**Tech Stack:** Plan 2's stack, plus `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-collaboration`, `@tiptap/extensions`, `@tiptap/y-tiptap`, `yjs` and `y-protocols` (MIT; TipTap 3.31.x). The versions and exports were checked against the installed packages while this plan was written.

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` (§5.2 `memo`, `memo_update`, `memo_link`, `memo_cache`; §6.5; §9 M5). Plans 1 and 2 are merged on `main`.

**Series:** Plan 3 of 5 (the old plan 3 has been split).
- **Plan 4:** tags UI and search UI, including `[[` search-to-link in memos (M6–M7).
- **Plan 5:** fix-up editing and reattachment, .docx import, export and backup, desktop CI builds (M8–M9).

**Branch:** `git checkout -b plan-3-memos` from `main`.

## Global Constraints

- **Plan 1–2 constraints all still apply:**
  - Docker only.
  - Node ≥ 24, pnpm 10, TypeScript ~5.9.
  - `SqlDriver` has only `query` and `batch`.
  - UTF-16 offsets, and nothing may split a surrogate pair.
  - Synced tables written only through `Library.commit`.
  - FTS queries built only by `buildFtsQuery`.
  - MIT/BSD/Apache dependencies. `fractional-indexing` (CC0) is an accepted exception.
  - Every user-facing string goes through i18next (`zh-CN` + `en`, typed `Messages`).
  - No `dangerouslySetInnerHTML`.
  - Unicode escapes are written as `\u{XXXX}`, with the `u` flag on regexes.
  - Conventional commits with **no attribution lines**.
- **Commands:**
  - Run: `docker compose run --rm -T -e NO_COLOR=1 dev <cmd>`.
  - End-to-end: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e [spec]`, with the `web` and `playwright` services up.
  - After adding dependencies, restart `web` (`docker compose restart web`) so Vite doesn't reload a page in the middle of a test (plan-2 Task 11 note).
- **Memo storage rules (spec §5.3):**
  - `memo_update` rows are append-only Yjs updates; each save appends one merged update.
  - `memo_link`, `memo_cache.text` and `memo_cache.snapshot` are local-only derived data, rebuilt on every save and never synced.
  - The memo body is the Yjs fragment named `default` (the TipTap Collaboration default).
- **Updates applied while loading use the origin `LOAD_ORIGIN`.** They are never re-saved, and they're outside the editor's undo history (Yjs `UndoManager` tracks only the sync plugin's origin).
- **Link targets** are `anchor` (a quoted range with no markup), `markup` (a highlight, bold or underline) or `side_note`. Positions always come from `anchor_res`, falling back to the anchor.
- **Deliberate change to spec §6.5's link-creation methods:**
  - Links are created from the selection toolbar (**引用 Quote**), the markup popover (**插入札记 Link in memo**) and side-note cards (**引用 Quote**).
  - Drag-and-drop and copy-link-then-paste are not built.
  - `[[` search arrives with the search UI in plan 4.
  - Point links (a position with no text) are deferred.
  - Task 9 records this in the spec.
- **`home_article_id`** is the article a memo was created from. The memo column shows the current article's memos as tabs, plus any memo opened from somewhere else (for example a "cited in" link), which gets a closable tab.

## Review Focus

These five inputs aren't covered by the happy paths and are most likely to bite. Each has a test in the task that owns the code.

1. **Reload or close in the middle of typing.**
   - Expectation: what was typed is there after a reload, and Undo right after a reload never deletes loaded text.
   - Tests: Task 5 (end-to-end: type, pause, reload; reload then Undo).
2. **A link whose target was deleted** (the markup removed, or the whole article deleted).
   - Expectation: clicking it shows a clear message and nothing breaks, and the "cited" mark disappears.
   - Tests: Task 2 (`targetRange` and `listBacklinks` unit tests), Task 7 (end-to-end: click a link to a removed markup).
3. **A memo with a long edit history.**
   - Expectation: loading stays fast because updates are compacted into a snapshot, and the content is identical afterwards.
   - Tests: Task 3 (unit test: 60 updates, compaction, reopen, equal content, later edits kept).
4. **A copied link chip** (the same `linkId` appears twice in a memo).
   - Expectation: saving still works and the backlink appears once per target.
   - Tests: Task 2 (duplicate `nodeId` unit test), Task 3 (`memoDerived`).
5. **Chinese text typed into the memo editor, and links to passages containing emoji.**
   - Expectation: the text is saved and shown correctly, memo text is searchable, and the label never splits a surrogate pair.
   - Tests: Task 5 (end-to-end: typed via `insertText`, shown after a reload), Task 2 (memo text found by search), Task 4 (`excerpt` handling of 😀). The search UI itself arrives in plan 4.

---

## File Map

```
apps/client/src/data/LibraryContext.tsx      + touchesTables, table-filtered useLibraryQuery   Task 1
packages/db/src/markups.ts                   export anchorInput/anchorResStatement             Task 2
packages/db/src/memos.ts                     memo repository, quotes, backlinks, targetRange   Task 2
apps/client/src/memo/memoDerived.ts, openMemoDoc.ts                                             Task 3
apps/client/src/article/excerpt.ts, apps/client/src/memo/anchorLink.ts, bridge.ts              Task 4
apps/client/src/memo/MemoEditor.tsx, components/MemoPane.tsx, components/Shell.tsx,
  memo/MemoContext.tsx, i18n, styles/app.css                                                    Task 5
components/ArticlePane.tsx, SelectionToolbar.tsx, MarkupPopover.tsx, Margin.tsx               Task 6
article/decorations.ts (options: activeId, flash, citations), components/ArticleView.tsx      Task 7
components/ArticlePane.tsx, MarkupPopover.tsx (cited-in), decorations annotationIdsAt          Task 8
docs/superpowers/specs/…design.md, README.md                                                    Task 9
apps/client/e2e/memo.spec.ts, links.spec.ts, follow.spec.ts, backlinks.spec.ts                 Tasks 5–8
```

---

### Task 1: Refresh queries only for the tables they read

**Files:**
- Modify: `apps/client/src/data/LibraryContext.tsx`, `apps/client/src/components/Sidebar.tsx`, `apps/client/src/components/ArticlePane.tsx`
- Test: `apps/client/src/data/touchesTables.test.ts`

**Interfaces:**
- Produces:
  - `touchesTables(ops: readonly Op[], tables?: readonly SyncedTable[]): boolean` — with no filter, every commit counts
  - `useLibraryQuery(load, deps, tables?)` — re-runs only when a commit writes one of `tables`
- Later tasks pass a `tables` list to every query.

- [ ] **Step 1: Write the failing test**

`apps/client/src/data/touchesTables.test.ts`:
```ts
import type { Op } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { touchesTables } from './LibraryContext';

const op = (table: Op['table']): Op => ({ v: 1, table, id: 'x', hlc: '000000000000001-0000-0000000000000001', fields: {} });

describe('touchesTables', () => {
  it('matches a commit that writes one of the tables', () => {
    expect(touchesTables([op('memo_update'), op('markup')], ['markup', 'anchor'])).toBe(true);
  });

  it('ignores commits to other tables', () => {
    expect(touchesTables([op('memo_update')], ['article', 'article_revision'])).toBe(false);
  });

  it('treats a missing filter as "every commit"', () => {
    expect(touchesTables([op('tag')], undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/data/touchesTables.test.ts`
Expected: FAIL with `touchesTables is not a function` (or `does not provide an export named 'touchesTables'`).

- [ ] **Step 3: Implement**

In `apps/client/src/data/LibraryContext.tsx`:
- add `import type { Op, SyncedTable } from '@jot/core';` at the top
- add this function below `useLibrary`:
```tsx
/** Whether a commit's ops write any of `tables`; with no filter, every commit counts. */
export function touchesTables(ops: readonly Op[], tables?: readonly SyncedTable[]): boolean {
  return !tables || ops.some((op) => tables.includes(op.table));
}
```
- change the `useLibraryQuery` signature and subscription:
```tsx
export function useLibraryQuery<T>(
  load: (lib: Library) => Promise<T>,
  deps: readonly unknown[],
  tables?: readonly SyncedTable[],
): QueryState<T> {
```
  After `loadRef.current = load;`, add:
```tsx
  const tablesRef = useRef(tables);
  tablesRef.current = tables;
```
  Replace `    const unsubscribe = lib.subscribe(refresh);` with:
```tsx
    const unsubscribe = lib.subscribe((ops) => {
      if (touchesTables(ops, tablesRef.current)) refresh();
    });
```

In `apps/client/src/components/Sidebar.tsx`, change `useLibraryQuery(listArticles, [])` to `useLibraryQuery(listArticles, [], ['article'])`.

In `apps/client/src/components/ArticlePane.tsx`, pass tables to the three queries:
```tsx
  const article = useLibraryQuery((l) => getArticle(l, articleId), [articleId], ['article', 'article_revision']);
  const markups = useLibraryQuery((l) => listMarkups(l, articleId), [articleId], ['markup', 'anchor']);
  const notes = useLibraryQuery((l) => listSideNotes(l, articleId), [articleId], ['side_note', 'markup']);
```

- [ ] **Step 4: Run the unit test and the reader e2e (no behaviour change expected)**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client && pnpm typecheck && pnpm lint'`
Expected: every client test passes (3 new ones), with no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e annotate notes popover import shell`
Expected: all pass (the WebKit OPFS skips are unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "perf(client): re-run library queries only when their tables change"
```

---

### Task 2: Memo repository, quotes, backlinks and link targets

**Files:**
- Create: `packages/db/src/memos.ts`
- Modify: `packages/db/src/markups.ts` (export shared anchor helpers), `packages/db/src/index.ts`
- Test: `packages/db/src/memos.test.ts`

**Interfaces:**
- Consumes: `Library`, `OpInput`, `indexStatements`/`unindexStatements`, `EmptySelectionError`, and `createArticle`/`createMarkup`/`createSideNote`/`deleteMarkup` (in tests).
- Produces (all exported from `@jot/db`):
  - From `markups.ts`: `anchorInput(anchorId, articleId, revisionId, anchor: TextAnchor, createdAt): OpInput` and `anchorResStatement(anchorId, revisionId, start, end): Stmt`
  - `type LinkTargetType = 'anchor' | 'markup' | 'side_note'`
  - `interface MemoSummary { id; title; homeArticleId: string | null; createdAt }`
  - `interface MemoLinkInput { nodeId; targetType; targetId; articleId }` and `interface MemoDerived { text: string; links: MemoLinkInput[] }`
  - `interface MemoState { snapshot: Uint8Array | null; updates: { data: Uint8Array; hlc: string }[] }`
  - `interface Backlink { memoId; memoTitle; targetType; targetId; start; end; status }`
  - `interface TargetRange { articleId; start; end; status }`
  - `createMemo(lib, { title, homeArticleId }): Promise<string>`, `renameMemo(lib, id, title)`, `deleteMemo(lib, id)`
  - `listMemos(lib, homeArticleId): Promise<MemoSummary[]>` (oldest first) and `getMemo(lib, id): Promise<MemoSummary | null>`
  - `getMemoState(lib, memoId): Promise<MemoState>` — the snapshot, plus the updates newer than it, in HLC order
  - `appendMemoUpdate(lib, memoId, data: Uint8Array, derived: MemoDerived)` — one synced row, plus rewritten `memo_link`, `memo_cache.text` and the search index
  - `compactMemo(lib, memoId, snapshot: Uint8Array, upToHlc: string)` — local only, not a commit
  - `createQuote(lib, { articleId, revisionId, anchor }): Promise<string>` — an anchor with no markup; throws `EmptySelectionError` for whitespace
  - `listBacklinks(lib, articleId): Promise<Backlink[]>` — links from live memos into this article, resolved to live anchors
  - `targetRange(lib, targetType, targetId): Promise<TargetRange | null>` — null when the target or its markup is deleted

- [ ] **Step 1: Write the failing test**

`packages/db/src/memos.test.ts`:
```ts
import { captureAnchor, type Block } from '@jot/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, getArticle } from './articles';
import { Library } from './library';
import { createMarkup, createSideNote, deleteMarkup, EmptySelectionError } from './markups';
import {
  appendMemoUpdate, compactMemo, createMemo, createQuote, deleteMemo, getMemo, getMemoState, listBacklinks, listMemos,
  renameMemo, targetRange,
} from './memos';
import { search } from './search';

let lib: Library;
let articleId: string;
let revisionId: string;
let text: string;

const blocks: Block[] = [
  { k: 'p', runs: [{ t: '他用比喻写春天。' }] },
  { k: 'p', runs: [{ t: '她笑😀了。' }] },
];

beforeEach(async () => {
  let t = 1000;
  lib = await Library.open(createNodeDriver(), { now: () => t++ });
  ({ articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks }));
  text = (await getArticle(lib, articleId))!.text;
});

const bytes = (...b: number[]) => Uint8Array.from(b);

describe('memos', () => {
  it('creates, lists, renames and finds memos by title', async () => {
    const a = await createMemo(lib, { title: '结构', homeArticleId: articleId });
    const b = await createMemo(lib, { title: '修辞', homeArticleId: articleId });
    expect((await listMemos(lib, articleId)).map((m) => m.title)).toEqual(['结构', '修辞']);
    await renameMemo(lib, a, '开头');
    expect((await getMemo(lib, a))?.title).toBe('开头');
    expect((await search(lib.driver, { text: '开头', types: ['memo'] })).map((h) => h.entityId)).toEqual([a]);
    expect(b).not.toBe(a);
  });

  it('stores updates in order with derived text for search', async () => {
    const memoId = await createMemo(lib, { title: 'M', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, bytes(1), { text: '先写景', links: [] });
    await appendMemoUpdate(lib, memoId, bytes(2), { text: '先写景，后抒情', links: [] });
    const state = await getMemoState(lib, memoId);
    expect(state.snapshot).toBeNull();
    expect(state.updates.map((u) => [...u.data])).toEqual([[1], [2]]);
    expect((await search(lib.driver, { text: '抒情' })).map((h) => h.entityId)).toEqual([memoId]);
  });

  it('only returns updates newer than a compacted snapshot', async () => {
    const memoId = await createMemo(lib, { title: 'M', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, bytes(1), { text: '', links: [] });
    const first = await getMemoState(lib, memoId);
    await compactMemo(lib, memoId, bytes(9, 9), first.updates[0].hlc);
    await appendMemoUpdate(lib, memoId, bytes(2), { text: '', links: [] });
    const state = await getMemoState(lib, memoId);
    expect([...(state.snapshot ?? [])]).toEqual([9, 9]);
    expect(state.updates.map((u) => [...u.data])).toEqual([[2]]);
  });

  it('resolves backlinks for markups, side notes and quotes, once per link even if a link id repeats (Review Focus 4)', async () => {
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
    const noteId = await createSideNote(lib, { markupId, articleId, body: '注' });
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 10, 12) });
    const memoId = await createMemo(lib, { title: 'M', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, bytes(1), {
      text: '比喻 注 她笑',
      links: [
        { nodeId: 'n1', targetType: 'markup', targetId: markupId, articleId },
        { nodeId: 'n1', targetType: 'markup', targetId: markupId, articleId },
        { nodeId: 'n2', targetType: 'side_note', targetId: noteId, articleId },
        { nodeId: 'n3', targetType: 'anchor', targetId: quoteId, articleId },
      ],
    });
    expect((await listBacklinks(lib, articleId)).map((b) => [b.targetType, b.start, b.end, b.memoTitle])).toEqual([
      ['markup', 2, 4, 'M'],
      ['side_note', 2, 4, 'M'],
      ['anchor', 10, 12, 'M'],
    ]);
  });

  it('drops backlinks and target ranges whose target is deleted (Review Focus 2)', async () => {
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'bold' });
    const memoId = await createMemo(lib, { title: 'M', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, bytes(1), { text: '', links: [{ nodeId: 'n1', targetType: 'markup', targetId: markupId, articleId }] });
    expect(await targetRange(lib, 'markup', markupId)).toEqual({ articleId, start: 2, end: 4, status: 'exact' });
    await deleteMarkup(lib, markupId);
    expect(await targetRange(lib, 'markup', markupId)).toBeNull();
    expect(await listBacklinks(lib, articleId)).toEqual([]);
  });

  it('resolves target ranges for quotes and side notes, and not after the article is deleted', async () => {
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 12, 14) });
    expect(await targetRange(lib, 'anchor', quoteId)).toMatchObject({ articleId, start: 12, end: 14 });
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 0, 2), style: 'underline' });
    const noteId = await createSideNote(lib, { markupId, articleId, body: 'x' });
    expect(await targetRange(lib, 'side_note', noteId)).toMatchObject({ start: 0, end: 2 });
    await deleteArticle(lib, articleId);
    expect(await targetRange(lib, 'side_note', noteId)).toBeNull();
  });

  it('refuses a whitespace-only quote', async () => {
    await expect(createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 8, 10) })).rejects.toBeInstanceOf(EmptySelectionError);
  });

  it('deleting a memo removes it from lists, search and backlinks', async () => {
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4) });
    const memoId = await createMemo(lib, { title: '要删', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, bytes(1), { text: '内容', links: [{ nodeId: 'n', targetType: 'anchor', targetId: quoteId, articleId }] });
    await deleteMemo(lib, memoId);
    expect(await listMemos(lib, articleId)).toEqual([]);
    expect(await getMemo(lib, memoId)).toBeNull();
    expect(await search(lib.driver, { text: '要删' })).toEqual([]);
    expect(await listBacklinks(lib, articleId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/memos.test.ts`
Expected: FAIL with `Cannot find module './memos'`.

- [ ] **Step 3: Implement**

In `packages/db/src/markups.ts`:
- change `function anchorResStatement(` to `export function anchorResStatement(`
- add this helper below `anchorResStatement`:
```ts
/** The synced `anchor` row for a captured selection (used by markups and quotes). */
export function anchorInput(anchorId: string, articleId: string, revisionId: string, a: TextAnchor, createdAt: number): OpInput {
  return {
    table: 'anchor',
    id: anchorId,
    fields: {
      article_id: articleId,
      revision_id: revisionId,
      start: a.start,
      end: a.end,
      exact: a.exact,
      prefix: a.prefix,
      suffix: a.suffix,
      unit: a.unit,
      created_at: createdAt,
    },
  };
}
```
- in `createMarkup`, replace the whole inline `{ table: 'anchor', id: anchorId, fields: { … } },` element with `anchorInput(anchorId, m.articleId, m.revisionId, a, now),`

`packages/db/src/memos.ts`:
```ts
import { newId, type ResolutionStatus, type TextAnchor } from '@jot/core';
import type { Stmt } from './driver';
import type { Library } from './library';
import { anchorInput, anchorResStatement, EmptySelectionError } from './markups';
import { indexStatements, unindexStatements } from './search';

export type LinkTargetType = 'anchor' | 'markup' | 'side_note';

export interface MemoSummary {
  id: string;
  title: string;
  homeArticleId: string | null;
  createdAt: number;
}

export interface MemoLinkInput {
  nodeId: string;
  targetType: LinkTargetType;
  targetId: string;
  articleId: string;
}

/** What a memo's content implies for search and backlinks (computed by the client on every save). */
export interface MemoDerived {
  text: string;
  links: MemoLinkInput[];
}

export interface MemoState {
  snapshot: Uint8Array | null;
  updates: { data: Uint8Array; hlc: string }[];
}

export interface Backlink {
  memoId: string;
  memoTitle: string;
  targetType: LinkTargetType;
  targetId: string;
  start: number;
  end: number;
  status: ResolutionStatus;
}

export interface TargetRange {
  articleId: string;
  start: number;
  end: number;
  status: ResolutionStatus;
}

const cleanTitle = (title: string) => title.normalize('NFC').trim() || 'Memo';

const SUMMARY = 'SELECT id, title, home_article_id AS homeArticleId, created_at AS createdAt FROM memo';

export async function createMemo(lib: Library, input: { title: string; homeArticleId: string | null }): Promise<string> {
  const id = newId();
  const title = cleanTitle(input.title);
  await lib.commit(
    [{ table: 'memo', id, fields: { title, home_article_id: input.homeArticleId, created_at: lib.now() } }],
    [
      { sql: 'INSERT INTO memo_cache (memo_id, text) VALUES (?, ?) ON CONFLICT (memo_id) DO NOTHING', params: [id, ''] },
      ...indexStatements({ entityType: 'memo', entityId: id, articleId: input.homeArticleId, title, body: '' }),
    ],
  );
  return id;
}

export async function renameMemo(lib: Library, id: string, title: string): Promise<void> {
  const clean = cleanTitle(title);
  const [row] = await lib.driver.query<{ homeArticleId: string | null; text: string }>(
    `SELECT m.home_article_id AS homeArticleId, coalesce(c.text, '') AS text
     FROM memo m LEFT JOIN memo_cache c ON c.memo_id = m.id WHERE m.id = ? AND m.deleted = 0`,
    [id],
  );
  if (!row) return;
  await lib.commit(
    [{ table: 'memo', id, fields: { title: clean } }],
    indexStatements({ entityType: 'memo', entityId: id, articleId: row.homeArticleId, title: clean, body: row.text }),
  );
}

export async function deleteMemo(lib: Library, id: string): Promise<void> {
  await lib.commit(
    [{ table: 'memo', id, fields: { deleted: 1 } }],
    [{ sql: 'DELETE FROM memo_link WHERE memo_id = ?', params: [id] }, ...unindexStatements('memo', id)],
  );
}

export function listMemos(lib: Library, homeArticleId: string): Promise<MemoSummary[]> {
  return lib.driver.query<MemoSummary>(`${SUMMARY} WHERE home_article_id = ? AND deleted = 0 ORDER BY created_at, id`, [homeArticleId]);
}

export async function getMemo(lib: Library, id: string): Promise<MemoSummary | null> {
  const [row] = await lib.driver.query<MemoSummary>(`${SUMMARY} WHERE id = ? AND deleted = 0`, [id]);
  return row ?? null;
}

/** The compacted snapshot (if any) and every update stored after it, in causal (HLC) order. */
export async function getMemoState(lib: Library, memoId: string): Promise<MemoState> {
  const [cache] = await lib.driver.query<{ snapshot: Uint8Array | null; snapshotHlc: string | null }>(
    'SELECT snapshot, snapshot_hlc AS snapshotHlc FROM memo_cache WHERE memo_id = ?',
    [memoId],
  );
  const snapshot = cache?.snapshot ?? null;
  const after = snapshot ? (cache?.snapshotHlc ?? '') : '';
  const updates = await lib.driver.query<{ data: Uint8Array; hlc: string }>(
    'SELECT data, hlc FROM memo_update WHERE memo_id = ? AND hlc > ? ORDER BY hlc, id',
    [memoId, after],
  );
  return { snapshot, updates };
}

/** Appends one merged Yjs update and rewrites the memo's local derived data in the same transaction. */
export async function appendMemoUpdate(lib: Library, memoId: string, data: Uint8Array, derived: MemoDerived): Promise<void> {
  const [memo] = await lib.driver.query<{ title: string; homeArticleId: string | null }>(
    'SELECT title, home_article_id AS homeArticleId FROM memo WHERE id = ?',
    [memoId],
  );
  if (!memo) throw new Error(`Memo ${memoId} does not exist`);
  await lib.commit(
    [{ table: 'memo_update', id: newId(), fields: { memo_id: memoId, data, created_at: lib.now() } }],
    [
      { sql: 'DELETE FROM memo_link WHERE memo_id = ?', params: [memoId] },
      ...derived.links.map(
        (l): Stmt => ({
          sql: `INSERT INTO memo_link (memo_id, node_id, target_type, target_id, article_id) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (memo_id, node_id) DO NOTHING`,
          params: [memoId, l.nodeId, l.targetType, l.targetId, l.articleId],
        }),
      ),
      {
        sql: 'INSERT INTO memo_cache (memo_id, text) VALUES (?, ?) ON CONFLICT (memo_id) DO UPDATE SET text = excluded.text',
        params: [memoId, derived.text],
      },
      ...indexStatements({ entityType: 'memo', entityId: memoId, articleId: memo.homeArticleId, title: memo.title, body: derived.text }),
    ],
  );
}

/** Local-only: remembers a merged state covering every update up to `upToHlc`, so loading applies fewer updates. */
export async function compactMemo(lib: Library, memoId: string, snapshot: Uint8Array, upToHlc: string): Promise<void> {
  await lib.driver.batch([
    {
      sql: `INSERT INTO memo_cache (memo_id, text, snapshot, snapshot_hlc) VALUES (?, '', ?, ?)
            ON CONFLICT (memo_id) DO UPDATE SET snapshot = excluded.snapshot, snapshot_hlc = excluded.snapshot_hlc`,
      params: [memoId, snapshot, upToHlc],
    },
  ]);
}

/** A quoted range with no markup, created so a memo can link to it. */
export async function createQuote(
  lib: Library,
  input: { articleId: string; revisionId: string; anchor: TextAnchor },
): Promise<string> {
  const a = input.anchor;
  if (a.exact.trim() === '') throw new EmptySelectionError();
  const anchorId = newId();
  await lib.commit(
    [anchorInput(anchorId, input.articleId, input.revisionId, a, lib.now())],
    [anchorResStatement(anchorId, input.revisionId, a.start, a.end)],
  );
  return anchorId;
}

/** The anchor behind a link target (a quote is itself an anchor); deleted targets resolve to nothing. */
const TARGET_ANCHOR = `
  CASE l.target_type
    WHEN 'anchor' THEN l.target_id
    WHEN 'markup' THEN (SELECT k.anchor_id FROM markup k WHERE k.id = l.target_id AND k.deleted = 0)
    WHEN 'side_note' THEN (
      SELECT k.anchor_id FROM side_note n JOIN markup k ON k.id = n.markup_id
      WHERE n.id = l.target_id AND n.deleted = 0 AND k.deleted = 0)
  END`;

export function listBacklinks(lib: Library, articleId: string): Promise<Backlink[]> {
  return lib.driver.query<Backlink>(
    `SELECT l.memo_id AS memoId, m.title AS memoTitle, l.target_type AS targetType, l.target_id AS targetId,
            coalesce(r.start, a.start) AS start, coalesce(r."end", a."end") AS "end", coalesce(r.status, 'exact') AS status
     FROM memo_link l
     JOIN memo m ON m.id = l.memo_id AND m.deleted = 0
     JOIN anchor a ON a.id = ${TARGET_ANCHOR} AND a.deleted = 0
     JOIN article ar ON ar.id = a.article_id AND ar.deleted = 0
     LEFT JOIN anchor_res r ON r.anchor_id = a.id
     WHERE l.article_id = ?
     ORDER BY start, "end", m.title, m.id, l.node_id`,
    [articleId],
  );
}

const TARGET_ANCHOR_BY_TYPE: Record<LinkTargetType, string> = {
  anchor: 'SELECT ?',
  markup: 'SELECT anchor_id FROM markup WHERE id = ? AND deleted = 0',
  side_note:
    'SELECT k.anchor_id FROM side_note n JOIN markup k ON k.id = n.markup_id WHERE n.id = ? AND n.deleted = 0 AND k.deleted = 0',
};

/** Where a link points now, or null when its target (or the target's article) no longer exists. */
export async function targetRange(lib: Library, targetType: LinkTargetType, targetId: string): Promise<TargetRange | null> {
  const [row] = await lib.driver.query<TargetRange>(
    `SELECT a.article_id AS articleId, coalesce(r.start, a.start) AS start, coalesce(r."end", a."end") AS "end",
            coalesce(r.status, 'exact') AS status
     FROM anchor a
     JOIN article ar ON ar.id = a.article_id AND ar.deleted = 0
     LEFT JOIN anchor_res r ON r.anchor_id = a.id
     WHERE a.id = (${TARGET_ANCHOR_BY_TYPE[targetType]}) AND a.deleted = 0`,
    [targetId],
  );
  return row ?? null;
}
```

Append to `packages/db/src/index.ts`:
```ts
export * from './memos';
```

- [ ] **Step 4: Run it to verify it passes, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db/src/memos.test.ts && pnpm test && pnpm typecheck && pnpm lint'`
Expected: 8 memo tests pass, every other test passes, and there are no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): add memo repository, quotes, backlinks and link target ranges"
```

---

### Task 3: Memo documents: derived data and loading with compaction

**Files:**
- Create: `apps/client/src/memo/memoDerived.ts`, `apps/client/src/memo/openMemoDoc.ts`, `apps/client/src/memo/anchorLink.ts` (the node definition only; Task 4 tests its HTML)
- Test: `apps/client/src/memo/memoDerived.test.ts`, `apps/client/src/memo/openMemoDoc.test.ts`

**Interfaces:**
- Consumes: `appendMemoUpdate`, `compactMemo`, `getMemoState` and `MemoDerived` (Task 2).
- Produces:
  - `memoDerived(json: JSONContent): MemoDerived`:
    - text: non-empty blocks joined by `\n`, where a chip contributes its label
    - links: `anchorLink` nodes with complete attributes
  - `LOAD_ORIGIN` (a symbol)
  - `openMemoDoc(lib, memoId): Promise<Y.Doc>` — applies the snapshot and updates with `LOAD_ORIGIN`. When 50 or more updates were applied, it stores a compacted snapshot.
  - `AnchorLink` (a TipTap `Node`), with attributes `linkId`, `targetType`, `targetId`, `articleId` and `label`

- [ ] **Step 1: Add dependencies**

Run: `docker compose run --rm -T dev pnpm --filter @jot/client add @tiptap/core @tiptap/pm @tiptap/react @tiptap/starter-kit @tiptap/extension-collaboration @tiptap/extensions @tiptap/y-tiptap yjs y-protocols`
Then: `docker compose restart web`

- [ ] **Step 2: Write the failing tests**

`apps/client/src/memo/memoDerived.test.ts`:
```ts
// @vitest-environment happy-dom
import { getSchema, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { AnchorLink } from './anchorLink';
import { memoDerived } from './memoDerived';

const chip = (linkId: string, label: string): JSONContent => ({
  type: 'anchorLink',
  attrs: { linkId, targetType: 'markup', targetId: 'm1', articleId: 'a1', label },
});

const doc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '结构' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '开头用' }, chip('l1', '比喻'), { type: 'text', text: '点题。' }] },
    { type: 'paragraph' },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [chip('l1', '比喻')] }] }] },
  ],
};

describe('memoDerived', () => {
  it('extracts searchable text (chips contribute their labels) and every link', () => {
    const derived = memoDerived(doc);
    expect(derived.text).toBe('结构\n开头用比喻点题。\n比喻');
    expect(derived.links).toEqual([
      { nodeId: 'l1', targetType: 'markup', targetId: 'm1', articleId: 'a1' },
      { nodeId: 'l1', targetType: 'markup', targetId: 'm1', articleId: 'a1' },
    ]);
  });

  it('ignores chips with unknown target types', () => {
    const bad: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'anchorLink', attrs: { linkId: 'x', targetType: 'url', targetId: 't', articleId: 'a', label: 'L' } }] }] };
    expect(memoDerived(bad).links).toEqual([]);
  });

  it('survives the Yjs round trip that the editor uses to store memos', () => {
    const schema = getSchema([StarterKit, AnchorLink]);
    const ydoc = new Y.Doc();
    prosemirrorJSONToYXmlFragment(schema, doc, ydoc.getXmlFragment('default'));
    expect(memoDerived(yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment('default')))).toEqual(memoDerived(doc));
  });
});
```

`apps/client/src/memo/openMemoDoc.test.ts`:
```ts
import { appendMemoUpdate, createArticle, createMemo, getMemoState, Library } from '@jot/db';
import { createNodeDriver } from '@jot/db/testing/node';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { LOAD_ORIGIN, openMemoDoc } from './openMemoDoc';

async function setup() {
  let t = 1000;
  const lib = await Library.open(createNodeDriver(), { now: () => t++ });
  const { articleId } = await createArticle(lib, { title: 'A', importKind: 'paste', blocks: [{ k: 'p', runs: [{ t: '文' }] }] });
  const memoId = await createMemo(lib, { title: 'M', homeArticleId: articleId });
  return { lib, memoId };
}

/** Records one stored update per edit, like the editor's save loop with a very short delay. */
async function edit(lib: Library, memoId: string, doc: Y.Doc, change: (text: Y.Text) => void) {
  const updates: Uint8Array[] = [];
  const onUpdate = (u: Uint8Array, origin: unknown) => {
    if (origin !== LOAD_ORIGIN) updates.push(u);
  };
  doc.on('update', onUpdate);
  change(doc.getText('t'));
  doc.off('update', onUpdate);
  for (const u of updates) await appendMemoUpdate(lib, memoId, u, { text: '', links: [] });
}

describe('openMemoDoc', () => {
  it('rebuilds the document from its stored updates', async () => {
    const { lib, memoId } = await setup();
    const doc = new Y.Doc();
    await edit(lib, memoId, doc, (t) => t.insert(0, '先写景'));
    await edit(lib, memoId, doc, (t) => t.insert(3, '，后抒情'));
    expect((await openMemoDoc(lib, memoId)).getText('t').toString()).toBe('先写景，后抒情');
  });

  it('compacts a long history into a snapshot and keeps later edits (Review Focus 3)', async () => {
    const { lib, memoId } = await setup();
    const doc = new Y.Doc();
    for (let i = 0; i < 60; i++) await edit(lib, memoId, doc, (t) => t.insert(t.length, String(i % 10)));
    const reopened = await openMemoDoc(lib, memoId);
    const expected = doc.getText('t').toString();
    expect(reopened.getText('t').toString()).toBe(expected);
    const state = await getMemoState(lib, memoId);
    expect(state.snapshot).not.toBeNull();
    expect(state.updates).toHaveLength(0);
    await edit(lib, memoId, reopened, (t) => t.insert(t.length, '尾'));
    expect((await openMemoDoc(lib, memoId)).getText('t').toString()).toBe(`${expected}尾`);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/memo`
Expected: FAIL with `Cannot find module './anchorLink'`, `'./memoDerived'` and `'./openMemoDoc'`.

- [ ] **Step 4: Implement**

`apps/client/src/memo/anchorLink.ts`:
```ts
import { mergeAttributes, Node } from '@tiptap/core';
import type { LinkTargetType } from '@jot/db';

export interface AnchorLinkAttrs {
  linkId: string;
  targetType: LinkTargetType;
  targetId: string;
  articleId: string;
  label: string;
}

const dataAttr = (name: keyof AnchorLinkAttrs, html: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute(html),
  renderHTML: (attrs: Record<string, unknown>) => ({ [html]: attrs[name] }),
});

/** An inline, atomic link chip in a memo that points at a passage (spec §6.5). */
export const AnchorLink = Node.create({
  name: 'anchorLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      linkId: dataAttr('linkId', 'data-link-id'),
      targetType: dataAttr('targetType', 'data-target-type'),
      targetId: dataAttr('targetId', 'data-target-id'),
      articleId: dataAttr('articleId', 'data-article-id'),
      label: dataAttr('label', 'data-label'),
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-anchor-link]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-anchor-link': '', class: 'anchor-chip' }), String(node.attrs.label ?? '')];
  },

  renderText({ node }) {
    return String(node.attrs.label ?? '');
  },
});
```

`apps/client/src/memo/memoDerived.ts`:
```ts
import type { LinkTargetType, MemoDerived, MemoLinkInput } from '@jot/db';
import type { JSONContent } from '@tiptap/core';

const TARGET_TYPES: readonly string[] = ['anchor', 'markup', 'side_note'];

/** Searchable plain text (chips contribute their labels) and every link chip of a memo document. */
export function memoDerived(doc: JSONContent): MemoDerived {
  const blocks: string[] = [];
  const links: MemoLinkInput[] = [];

  const inline = (node: JSONContent): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'anchorLink') {
      const a = node.attrs ?? {};
      if (a.linkId && a.targetId && a.articleId && TARGET_TYPES.includes(String(a.targetType))) {
        links.push({
          nodeId: String(a.linkId),
          targetType: a.targetType as LinkTargetType,
          targetId: String(a.targetId),
          articleId: String(a.articleId),
        });
      }
      return String(a.label ?? '');
    }
    return (node.content ?? []).map(inline).join('');
  };

  const walk = (node: JSONContent): void => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      blocks.push(inline(node));
      return;
    }
    (node.content ?? []).forEach(walk);
  };

  walk(doc);
  return { text: blocks.filter((b) => b.trim() !== '').join('\n'), links };
}
```

`apps/client/src/memo/openMemoDoc.ts`:
```ts
import { compactMemo, getMemoState, type Library } from '@jot/db';
import * as Y from 'yjs';

/** Origin of updates applied while loading: never saved again and outside the editor's undo history. */
export const LOAD_ORIGIN = Symbol('jot-memo-load');

/** A memo whose load applies this many stored updates gets a compacted snapshot. */
const COMPACT_AFTER = 50;

export async function openMemoDoc(lib: Library, memoId: string): Promise<Y.Doc> {
  const state = await getMemoState(lib, memoId);
  const doc = new Y.Doc();
  if (state.snapshot) Y.applyUpdate(doc, state.snapshot, LOAD_ORIGIN);
  for (const update of state.updates) Y.applyUpdate(doc, update.data, LOAD_ORIGIN);
  if (state.updates.length >= COMPACT_AFTER) {
    await compactMemo(lib, memoId, Y.encodeStateAsUpdate(doc), state.updates[state.updates.length - 1].hlc);
  }
  return doc;
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/memo && pnpm typecheck && pnpm lint'`
Expected: PASS (5 tests), with no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "feat(client): memo documents: link chip node, derived text and links, load with compaction"
```

---

### Task 4: Link chips and the memo bridge

**Files:**
- Create: `apps/client/src/article/excerpt.ts`, `apps/client/src/memo/bridge.ts`
- Modify: `apps/client/src/components/MarkupPopover.tsx` (use the shared `excerpt`)
- Test: `apps/client/src/article/excerpt.test.ts`, `apps/client/src/memo/bridge.test.ts`

**Interfaces:**
- Consumes: `AnchorLink` and `AnchorLinkAttrs` (Task 3); `newId` from core.
- Produces:
  - `excerpt(text: string, max = 24): string` — cuts by code point and never splits a surrogate pair
  - `type LinkTarget = Omit<AnchorLinkAttrs, 'linkId'>`
  - `insertLink(editor, link)` — inserts a chip with a fresh `linkId`, plus a space, at the memo cursor
  - `class MemoBridge`:
    - `attachEditor(editor | null)`
    - `onCreateMemo(handler | null)` and `onOpenMemo(handler | null)`
    - `insertLink(link)` — queues the link and asks for a new memo when no editor is attached
    - `showMemo(memoId)`

- [ ] **Step 1: Write the failing tests**

`apps/client/src/article/excerpt.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { excerpt } from './excerpt';

describe('excerpt', () => {
  it('keeps short text and cuts long text with an ellipsis', () => {
    expect(excerpt('比喻')).toBe('比喻');
    expect(excerpt('春'.repeat(30))).toBe(`${'春'.repeat(24)}…`);
  });

  it('never splits an emoji (Review Focus 5)', () => {
    expect(excerpt('😀'.repeat(30), 3)).toBe('😀😀😀…');
  });

  it('collapses whitespace so labels stay on one line', () => {
    expect(excerpt('第一段。\n\n第二段。')).toBe('第一段。 第二段。');
  });
});
```

`apps/client/src/memo/bridge.test.ts`:
```ts
// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { AnchorLink } from './anchorLink';
import { MemoBridge, type LinkTarget } from './bridge';

const link: LinkTarget = { targetType: 'markup', targetId: 'm1', articleId: 'a1', label: '比喻' };
const editors: Editor[] = [];
const newEditor = () => {
  const editor = new Editor({ extensions: [StarterKit, AnchorLink], content: '<p>札记</p>' });
  editors.push(editor);
  return editor;
};
const chips = (editor: Editor) =>
  (editor.getJSON().content ?? []).flatMap((b) => b.content ?? []).filter((n) => n.type === 'anchorLink');

afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

describe('MemoBridge', () => {
  it('inserts a chip with a fresh link id into the attached editor', () => {
    const bridge = new MemoBridge();
    const editor = newEditor();
    bridge.attachEditor(editor);
    bridge.insertLink(link);
    bridge.insertLink(link);
    const found = chips(editor);
    expect(found).toHaveLength(2);
    expect(found[0].attrs).toMatchObject(link);
    expect(found[0].attrs?.linkId).not.toBe(found[1].attrs?.linkId);
  });

  it('asks for a new memo when none is open, then inserts once an editor attaches', () => {
    const bridge = new MemoBridge();
    let requests = 0;
    bridge.onCreateMemo(() => requests++);
    bridge.insertLink(link);
    expect(requests).toBe(1);
    const editor = newEditor();
    bridge.attachEditor(editor);
    expect(chips(editor)).toHaveLength(1);
  });

  it('forwards requests to show a memo', () => {
    const bridge = new MemoBridge();
    const shown: string[] = [];
    bridge.onOpenMemo((id) => shown.push(id));
    bridge.showMemo('memo-1');
    expect(shown).toEqual(['memo-1']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/article/excerpt.test.ts apps/client/src/memo/bridge.test.ts`
Expected: FAIL with `Cannot find module './excerpt'` and `'./bridge'`.

- [ ] **Step 3: Implement**

`apps/client/src/article/excerpt.ts`:
```ts
/** A one-line label for quoted text: whitespace collapsed, cut by code point (never inside an emoji). */
export function excerpt(text: string, max = 24): string {
  const chars = [...text.replace(/\s+/gu, ' ').trim()];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}
```

In `apps/client/src/components/MarkupPopover.tsx`, delete the local `const excerpt = …` function and add `import { excerpt } from '../article/excerpt';`.

`apps/client/src/memo/bridge.ts`:
```ts
import { newId } from '@jot/core';
import type { Editor } from '@tiptap/core';
import type { AnchorLinkAttrs } from './anchorLink';

export type LinkTarget = Omit<AnchorLinkAttrs, 'linkId'>;

/** Inserts a link chip (and a space after it) at the memo's cursor. */
export function insertLink(editor: Editor, link: LinkTarget): void {
  editor
    .chain()
    .focus()
    .insertContent([
      { type: 'anchorLink', attrs: { ...link, linkId: newId() } },
      { type: 'text', text: ' ' },
    ])
    .run();
}

/**
 * Connects the article column, which creates links, with the memo column, which owns the editor.
 * With no memo open, a link is queued and the memo column is asked to create one.
 */
export class MemoBridge {
  private editor: Editor | null = null;
  private pending: LinkTarget[] = [];
  private createMemo: (() => void) | null = null;
  private openMemo: ((memoId: string) => void) | null = null;

  attachEditor(editor: Editor | null): void {
    this.editor = editor;
    if (editor && this.pending.length > 0) {
      for (const link of this.pending.splice(0)) insertLink(editor, link);
    }
  }

  onCreateMemo(handler: (() => void) | null): void {
    this.createMemo = handler;
  }

  onOpenMemo(handler: ((memoId: string) => void) | null): void {
    this.openMemo = handler;
  }

  insertLink(link: LinkTarget): void {
    if (this.editor && !this.editor.isDestroyed) {
      insertLink(this.editor, link);
      return;
    }
    this.pending.push(link);
    this.createMemo?.();
  }

  showMemo(memoId: string): void {
    this.openMemo?.(memoId);
  }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client && pnpm typecheck && pnpm lint'`
Expected: every client test passes (6 new ones), with no type or lint errors.

If happy-dom cannot run `editor.chain().focus()` (the error mentions a missing DOM selection API):
- keep the test;
- make `insertLink` call `.focus(undefined, { scrollIntoView: false })`;
- if that still fails, switch the test to `// @vitest-environment jsdom` (add `jsdom` as a dev dependency, MIT) and record a ruling.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client): link chip insertion and the bridge between article and memo columns"
```

---
### Task 5: The memo column: tabs, title and a TipTap + Yjs editor (risk check M0.4)

**Files:**
- Create: `apps/client/src/memo/saves.ts`, `apps/client/src/memo/MemoContext.tsx`, `apps/client/src/memo/MemoEditor.tsx`, `apps/client/e2e/memo.spec.ts`
- Modify:
  - `apps/client/src/components/MemoPane.tsx` (replace)
  - `apps/client/src/components/Shell.tsx` (replace)
  - `apps/client/src/i18n/en.ts` and `zh-CN.ts` (the `memo`, `toolbar`, `markup` and `notes` keys)
  - `apps/client/src/styles/app.css` (append)
- Test: `apps/client/src/memo/saves.test.ts`, `apps/client/e2e/memo.spec.ts`

**Interfaces:**
- Consumes: Task 2's repository; Task 3's `openMemoDoc`, `LOAD_ORIGIN`, `memoDerived` and `AnchorLink`; Task 4's `MemoBridge` and `LinkTarget`.
- Produces:
  - `trackSave(memoId, promise)` and `whenSaved(memoId)` — reopening a memo waits for its in-flight save
  - `FocusTarget = { articleId; targetType; targetId; token }`
  - `MemoProvider` and `useMemoContext(): { bridge: MemoBridge; focus: FocusTarget | null; follow(link: LinkTarget): void; settle(token: number): void }`. The article column calls `settle` once it has handled a follow, so reopening that article later does not replay the jump.
  - `<MemoEditor memoId onReady onFollow />` — saves after 500 ms idle, and on `pagehide`, when hidden, and on unmount
  - `<MemoPane articleId />`, with test IDs `memo-new`, `memo-tab`, `memo-title`, `memo-editor`, `memo-delete`, `memo-empty`
  - The memo being written stays open, as an extra tab, when the writer switches articles
  - Translation keys used by Tasks 6–8: `toolbar.quote`, `markup.linkInMemo`, `notes.link`, `notes.untitled`, and `memo.{citedIn, open, missingTarget}`

- [ ] **Step 1: Write the failing unit test and e2e test**

`apps/client/src/memo/saves.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { trackSave, whenSaved } from './saves';

describe('memo save tracking', () => {
  it('lets a reopen wait for every in-flight save of that memo', async () => {
    const log: string[] = [];
    let finish: () => void = () => {};
    trackSave('m1', new Promise<void>((resolve) => (finish = resolve)).then(() => log.push('saved')));
    const waiting = whenSaved('m1').then(() => log.push('reopened'));
    await Promise.resolve();
    expect(log).toEqual([]);
    finish();
    await waiting;
    expect(log).toEqual(['saved', 'reopened']);
  });

  it('does not wait for other memos, and survives a failed save', async () => {
    trackSave('m2', Promise.reject(new Error('disk full')).catch(() => undefined));
    await expect(whenSaved('m3')).resolves.toBeUndefined();
    await expect(whenSaved('m2')).resolves.toBeUndefined();
  });
});
```

`apps/client/e2e/memo.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importText, openApp } from './helpers';

async function setup(page: Page, memory = true) {
  await openApp(page, { memory });
  await importText(page, '札记测试', '春风又绿江南岸，明月何时照我还。');
}

async function newMemo(page: Page) {
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
}

test('creates a memo and types Chinese and English into it (risk check M0.4)', async ({ page }) => {
  await setup(page);
  await expect(page.getByTestId('memo-empty')).toBeVisible();
  await newMemo(page);
  await page.keyboard.insertText('开头写景，');
  await page.keyboard.type('then feeling.');
  await expect(page.getByTestId('memo-editor')).toContainText('开头写景，then feeling.');
  await expect(page.getByTestId('memo-tab')).toHaveCount(1);
});

test('undo removes only the latest typing', async ({ page }) => {
  await setup(page);
  await newMemo(page);
  await page.keyboard.insertText('保留');
  await page.waitForTimeout(700); // Yjs groups edits closer than 500 ms into one undo step
  await page.keyboard.insertText('删掉');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('memo-editor')).toContainText('保留');
  await expect(page.getByTestId('memo-editor')).not.toContainText('删掉');
});

test('keeps memo text across a reload, and Undo after the reload keeps it (Review Focus 1)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await newMemo(page);
  await page.keyboard.insertText('先写景，后抒情。');
  await page.waitForTimeout(1_000);
  await page.reload();
  const editor = page.getByTestId('memo-editor');
  await expect(editor).toContainText('先写景，后抒情。', { timeout: 30_000 });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).toContainText('先写景，后抒情。');
});

test('renames, switches between and deletes memos', async ({ page }) => {
  await setup(page);
  await newMemo(page);
  await page.keyboard.insertText('第一篇');
  await page.getByTestId('memo-title').fill('结构');
  await page.getByTestId('memo-title').press('Enter');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(2);
  await page.getByTestId('memo-tab').filter({ hasText: '结构' }).click();
  await expect(page.getByTestId('memo-editor')).toContainText('第一篇');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('memo-delete').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(1);
  await expect(page.getByTestId('memo-tab')).not.toContainText('结构');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/memo/saves.test.ts`
Expected: FAIL with `Cannot find module './saves'`.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e memo --project chromium --timeout 15000`
Expected: FAIL because there is no `memo-empty` or `memo-new` (the placeholder memo pane).

- [ ] **Step 3: Implement saving support, the context and the editor**

`apps/client/src/memo/saves.ts`:
```ts
const inFlight = new Map<string, Promise<void>>();

/** Remembers a memo save, so reopening that memo (for example switching tabs quickly) waits for it. */
export function trackSave(memoId: string, save: Promise<unknown>): void {
  const all = Promise.allSettled([inFlight.get(memoId), save]).then(() => undefined);
  inFlight.set(memoId, all);
  void all.then(() => {
    if (inFlight.get(memoId) === all) inFlight.delete(memoId);
  });
}

export function whenSaved(memoId: string): Promise<void> {
  return inFlight.get(memoId) ?? Promise.resolve();
}
```

`apps/client/src/memo/MemoContext.tsx`:
```tsx
import type { LinkTargetType } from '@jot/db';
import { createContext, useContext } from 'react';
import type { LinkTarget, MemoBridge } from './bridge';

/** A request to show a link target in the article column; `token` makes repeated clicks count. */
export interface FocusTarget {
  articleId: string;
  targetType: LinkTargetType;
  targetId: string;
  token: number;
}

export interface MemoContextValue {
  bridge: MemoBridge;
  focus: FocusTarget | null;
  follow(link: LinkTarget): void;
  /** Marks the follow request `token` as handled, so showing its article again does not replay it. */
  settle(token: number): void;
}

const MemoContext = createContext<MemoContextValue | null>(null);

export const MemoProvider = MemoContext.Provider;

export function useMemoContext(): MemoContextValue {
  const value = useContext(MemoContext);
  if (!value) throw new Error('useMemoContext must be used inside <MemoProvider>');
  return value;
}
```

`apps/client/src/memo/MemoEditor.tsx`:
```tsx
import { appendMemoUpdate } from '@jot/db';
import Collaboration from '@tiptap/extension-collaboration';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Y from 'yjs';
import { reportError } from '../data/errors';
import { useLibrary } from '../data/LibraryContext';
import { AnchorLink } from './anchorLink';
import type { LinkTarget } from './bridge';
import { memoDerived } from './memoDerived';
import { LOAD_ORIGIN, openMemoDoc } from './openMemoDoc';
import { trackSave, whenSaved } from './saves';

/** Typing pauses this long before a memo is saved (it is also saved on hide, unload and unmount). */
const SAVE_DELAY_MS = 500;

interface Props {
  memoId: string;
  onReady(editor: Editor | null): void;
  onFollow(link: LinkTarget): void;
}

export function MemoEditor({ memoId, onReady, onFollow }: Props) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [doc, setDoc] = useState<Y.Doc | null>(null);

  useEffect(() => {
    let active = true;
    whenSaved(memoId)
      .then(() => openMemoDoc(lib, memoId))
      .then((d) => {
        if (active) setDoc(d);
      }, reportError);
    return () => {
      active = false;
    };
  }, [lib, memoId]);

  if (!doc) return <p className="muted">{t('article.loading')}</p>;
  return <LoadedMemoEditor memoId={memoId} doc={doc} onReady={onReady} onFollow={onFollow} />;
}

function LoadedMemoEditor({ memoId, doc, onReady, onFollow }: Props & { doc: Y.Doc }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const followRef = useRef(onFollow);
  followRef.current = onFollow;

  const editor = useEditor(
    {
      extensions: [
        // Collaboration keeps its own (Yjs) undo history, so the built-in one is turned off.
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: doc }),
        AnchorLink,
        Placeholder.configure({ placeholder: t('memo.placeholder') }),
      ],
      editorProps: {
        attributes: { class: 'memo-editor', 'data-testid': 'memo-editor' },
        handleClickOn: (_view, _pos, node) => {
          if (node.type.name !== 'anchorLink') return false;
          const { targetType, targetId, articleId, label } = node.attrs as LinkTarget;
          followRef.current({ targetType, targetId, articleId, label });
          return true;
        },
      },
    },
    [doc],
  );

  // Saving: local Yjs updates are batched and stored with the memo's derived text and links.
  const pending = useRef<Uint8Array[]>([]);
  const flush = useCallback(() => {
    if (pending.current.length === 0) return;
    const update = Y.mergeUpdates(pending.current.splice(0));
    const derived = memoDerived(yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default')));
    trackSave(memoId, appendMemoUpdate(lib, memoId, update, derived).catch(reportError));
  }, [lib, memoId, doc]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === LOAD_ORIGIN) return;
      pending.current.push(update);
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    };
    const onHide = () => flush();
    doc.on('update', onUpdate);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(timer);
      doc.off('update', onUpdate);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [doc, flush]);

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  return <EditorContent editor={editor} />;
}
```

- [ ] **Step 4: Implement the memo column and wire it into the shell**

Replace `apps/client/src/components/MemoPane.tsx` with:
```tsx
import { createMemo, deleteMemo, getMemo, listMemos, renameMemo, type MemoSummary } from '@jot/db';
import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { MemoEditor } from '../memo/MemoEditor';

export function MemoPane({ articleId }: { articleId: string | null }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const { bridge, follow } = useMemoContext();
  const home = useLibraryQuery(
    (l) => (articleId ? listMemos(l, articleId) : Promise.resolve<MemoSummary[]>([])),
    [articleId],
    ['memo'],
  );
  // Memos opened from elsewhere (a "cited in" link, or kept open across an article switch).
  const [openIds, setOpenIds] = useState<string[]>([]);
  const others = useLibraryQuery(
    async (l) => (await Promise.all(openIds.map((id) => getMemo(l, id)))).filter((m): m is MemoSummary => m !== null),
    [openIds.join('|')],
    ['memo'],
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const homeMemos = home.data ?? [];
  const extraMemos = (others.data ?? []).filter((m) => !homeMemos.some((h) => h.id === m.id));
  const tabs = [...homeMemos, ...extraMemos];
  const active = tabs.find((m) => m.id === activeId) ?? homeMemos[0] ?? null;

  const keepOpen = useCallback((id: string) => setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id])), []);

  // The memo being written stays open when the writer switches to another article.
  const lastActive = useRef<MemoSummary | null>(null);
  useEffect(() => {
    const previous = lastActive.current;
    if (previous && previous.homeArticleId !== articleId) {
      keepOpen(previous.id);
      setActiveId(previous.id);
    }
  }, [articleId, keepOpen]);
  useEffect(() => {
    lastActive.current = active;
  });

  const create = useCallback(async () => {
    if (!articleId) return;
    const title = t('memo.defaultTitle', { n: homeMemos.length + 1 });
    setActiveId(await createMemo(lib, { title, homeArticleId: articleId }));
  }, [lib, articleId, homeMemos.length, t]);

  useEffect(() => {
    bridge.onCreateMemo(() => {
      create().catch(reportError);
    });
    return () => bridge.onCreateMemo(null);
  }, [bridge, create]);

  useEffect(() => {
    bridge.onOpenMemo((id) => {
      keepOpen(id);
      setActiveId(id);
    });
    return () => bridge.onOpenMemo(null);
  }, [bridge, keepOpen]);

  const onReady = useCallback((editor: Editor | null) => bridge.attachEditor(editor), [bridge]);

  const remove = async (memo: MemoSummary) => {
    if (!window.confirm(t('memo.confirmDelete', { title: memo.title }))) return;
    await deleteMemo(lib, memo.id);
    setOpenIds((ids) => ids.filter((id) => id !== memo.id));
    setActiveId(null);
  };

  const close = (id: string) => {
    setOpenIds((ids) => ids.filter((x) => x !== id));
    if (active?.id === id) setActiveId(null);
  };

  if (!articleId && tabs.length === 0) {
    return (
      <>
        <h2>{t('memo.heading')}</h2>
        <p className="muted">{t('memo.noArticle')}</p>
      </>
    );
  }

  return (
    <div className="memo-pane">
      <header className="memo-header">
        <h2>{t('memo.heading')}</h2>
        {articleId && (
          <button type="button" onClick={() => create().catch(reportError)} data-testid="memo-new">
            {t('memo.new')}
          </button>
        )}
      </header>
      {tabs.length > 0 && (
        <div className="memo-tabs" role="tablist">
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
        </div>
      )}
      {active ? (
        <section className="memo-body" key={active.id}>
          <MemoTitle memo={active} />
          <MemoEditor memoId={active.id} onReady={onReady} onFollow={follow} />
          <footer>
            <button type="button" className="quiet" onClick={() => remove(active).catch(reportError)} data-testid="memo-delete">
              {t('memo.delete')}
            </button>
          </footer>
        </section>
      ) : (
        <p className="muted" data-testid="memo-empty">
          {t('memo.empty')}
        </p>
      )}
    </div>
  );
}

function MemoTitle({ memo }: { memo: MemoSummary }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [title, setTitle] = useState(memo.title);

  useEffect(() => {
    setTitle(memo.title);
  }, [memo.title]);

  const save = () => {
    const clean = title.trim();
    if (clean && clean !== memo.title) renameMemo(lib, memo.id, clean).catch(reportError);
    else setTitle(memo.title);
  };

  return (
    <input
      className="memo-title"
      value={title}
      aria-label={t('memo.titleLabel')}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      data-testid="memo-title"
    />
  );
}
```

Replace `apps/client/src/components/Shell.tsx` with:
```tsx
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStoredFlag, useStoredNumber } from '../data/useStoredNumber';
import { MemoBridge, type LinkTarget } from '../memo/bridge';
import { MemoProvider, type FocusTarget } from '../memo/MemoContext';
import { navigate, type Route } from '../router';
import { ArticlePane } from './ArticlePane';
import { ErrorBanner } from './ErrorBanner';
import { ImportDialog } from './ImportDialog';
import { MemoPane } from './MemoPane';
import { Sidebar } from './Sidebar';
import { Splitter } from './Splitter';

export function Shell({ route }: { route: Route }) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [memoWidth, setMemoWidth] = useStoredNumber('jot.memoWidth', 340);
  const [sidebarCollapsed, setSidebarCollapsed] = useStoredFlag('jot.sidebarCollapsed', false);
  const activeId = route.name === 'article' ? route.id : null;

  const [bridge] = useState(() => new MemoBridge());
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const token = useRef(0);
  const follow = useCallback(
    (link: LinkTarget) => {
      setFocus({ articleId: link.articleId, targetType: link.targetType, targetId: link.targetId, token: ++token.current });
      if (link.articleId !== activeId) navigate({ name: 'article', id: link.articleId });
    },
    [activeId],
  );
  const settle = useCallback((done: number) => setFocus((f) => (f?.token === done ? null : f)), []);
  const memoContext = useMemo(() => ({ bridge, focus, follow, settle }), [bridge, focus, follow, settle]);

  return (
    <MemoProvider value={memoContext}>
      <div className="shell" data-testid="shell">
        <Sidebar
          activeId={activeId}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onImport={() => setImporting(true)}
        />
        <main className="reader">
          {activeId ? <ArticlePane key={activeId} articleId={activeId} /> : <p className="empty">{t('article.none')}</p>}
        </main>
        <Splitter width={memoWidth} min={240} max={720} onResize={setMemoWidth} />
        <aside className="memo" style={{ width: memoWidth }} data-testid="memo-pane">
          <MemoPane articleId={activeId} />
        </aside>
        {importing && <ImportDialog onClose={() => setImporting(false)} />}
        <ErrorBanner />
      </div>
    </MemoProvider>
  );
}
```

In `apps/client/src/i18n/en.ts`:
- add `quote: 'Quote',` to `toolbar` (after `note`)
- add `linkInMemo: 'Link in memo',` to `markup` (after `addNote`)
- add `link: 'Quote in memo',` and `untitled: 'Side note',` to `notes`
- replace the whole `memo: { … }` block with:
```ts
  memo: {
    heading: 'Memo',
    new: 'New memo',
    defaultTitle: 'Memo {{n}}',
    titleLabel: 'Memo title',
    placeholder: 'Write your analysis… Quote passages with the toolbar or a highlight’s menu.',
    delete: 'Delete memo',
    confirmDelete: 'Delete “{{title}}”?',
    empty: 'No memos for this article yet.',
    noArticle: 'Open an article to write memos about it.',
    close: 'Close memo',
    citedIn: 'Cited in',
    open: 'Open',
    missingTarget: 'The linked passage no longer exists.',
  },
```

In `apps/client/src/i18n/zh-CN.ts`, make the same additions:
- `quote: '引用',` in `toolbar`
- `linkInMemo: '插入札记',` in `markup`
- `link: '引用',` and `untitled: '旁注',` in `notes`
- `memo` becomes:
```ts
  memo: {
    heading: '札记',
    new: '新建札记',
    defaultTitle: '札记 {{n}}',
    titleLabel: '札记标题',
    placeholder: '写下你的分析…… 可用工具栏或标注菜单引用原文。',
    delete: '删除札记',
    confirmDelete: '删除《{{title}}》？',
    empty: '这篇文章还没有札记。',
    noArticle: '打开一篇文章来写札记。',
    close: '关闭札记',
    citedIn: '被引用于',
    open: '打开',
    missingTarget: '链接的原文已不存在。',
  },
```

Append to `apps/client/src/styles/app.css`:
```css
/* Memo column */
.memo-pane { display: flex; flex-direction: column; gap: 10px; min-height: 100%; }
.memo-header { display: flex; align-items: center; justify-content: space-between; }
.memo-header h2 { margin: 0; }
.memo-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
.memo-tab { display: inline-flex; align-items: center; border-radius: 6px; }
.memo-tab > button { border: none; background: none; padding: 3px 8px; color: var(--muted); }
.memo-tab.active > button:first-child { color: var(--text); background: var(--bg); }
.memo-tab .icon { padding: 0 6px; }
.memo-body { display: flex; flex-direction: column; gap: 8px; }
.memo-title { font: inherit; font-weight: 600; font-size: 16px; color: var(--text); background: transparent; border: none; border-bottom: 1px dashed var(--line); padding: 4px 0; outline: none; }
.memo-title:focus { border-bottom-color: var(--accent); }
.memo-editor { min-height: 280px; outline: none; font-family: var(--font-read); font-size: 16px; line-height: 1.8; }
.memo-editor p { margin: 0 0 0.6em; }
.memo-editor p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; height: 0; color: var(--muted); pointer-events: none; }
.memo-body footer { display: flex; justify-content: flex-end; }
button.quiet { border: none; background: none; color: var(--muted); font-size: 12px; }
.anchor-chip { display: inline-block; margin: 0 2px; padding: 0 8px; font-size: 0.9em; line-height: 1.6; border: 1px solid var(--line); border-radius: 999px; background: var(--bg); cursor: pointer; }
.anchor-chip::before { content: '↗ '; color: var(--accent); }
.anchor-chip.ProseMirror-selectednode { outline: 2px solid var(--accent); }
```

Run: `docker compose restart web`

- [ ] **Step 5: Run the unit test, the memo e2e on both browsers, and the regression e2e**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client && pnpm typecheck && pnpm lint'`
Expected: every client test passes (2 new ones), with no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e memo shell annotate`
Expected:
- memo: chromium 4 passed; webkit 3 passed and 1 skipped
- shell and annotate: unchanged

**Risk check M0.4:**
- If undo does not work (`ControlOrMeta+z` leaves `删掉`), check that the Collaboration extension added its keyboard shortcuts. If it didn't, add `Mod-z` / `Mod-Shift-z` via `addKeyboardShortcuts` that call `editor.commands.undo()` / `redo()`, and ledger it.
- If `insertText` typing is lost after a reload, that is the risk check's finding: fix it before continuing.

- [ ] **Step 6: Commit**

```bash
git add apps/client
git commit -m "feat(client): memo column with tabs, titles and a TipTap + Yjs editor saved to the library"
```

---
### Task 6: Creating links from the article column

**Files:**
- Modify:
  - `apps/client/src/article/markupRange.ts` (add `'quote'` to `ToolbarAction`)
  - `apps/client/src/components/SelectionToolbar.tsx`
  - `apps/client/src/components/MarkupPopover.tsx` (replace)
  - `apps/client/src/components/Margin.tsx`
  - `apps/client/src/components/ArticlePane.tsx` (replace)
- Create: `apps/client/e2e/links.spec.ts`
- Test: `apps/client/e2e/links.spec.ts`

**Interfaces:**
- Consumes: `createQuote` (Task 2); `excerpt` and `MemoBridge.insertLink` (Task 4); `useMemoContext` (Task 5).
- Produces:
  - toolbar action `quote` (test ID `toolbar-quote`) — a quote anchor plus an `anchor` chip in the active memo, created automatically when none exists
  - popover button `popover-link` — a `markup` chip
  - side-note button `note-link` — a `side_note` chip labelled with the note's current text
  - `Margin`'s new prop `onLink(note: SideNoteView, body: string)`
  - `MarkupPopover`'s new prop `onLinkInMemo(markup)`

- [ ] **Step 1: Write the failing e2e test**

`apps/client/e2e/links.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

const TEXT = '春风又绿江南岸，明月何时照我还。他用比喻写春天。';

async function setup(page: Page, memory = true) {
  await openApp(page, { memory });
  await importText(page, '链接', TEXT);
}

const chips = (page: Page) => page.getByTestId('memo-editor').locator('.anchor-chip');

test('quotes a selection into a new memo as a link chip', async ({ page }) => {
  await setup(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  await expect(chips(page)).toHaveText(['比喻']);
  await expect(page.getByTestId('memo-tab')).toHaveCount(1);
});

test('links a highlight and a side note from their menus', async ({ page }) => {
  await setup(page);
  await selectText(page, '春风');
  await page.getByTestId('toolbar-highlight').click();
  await page.locator('.mk-highlight').click();
  await page.getByTestId('popover-link').click();
  await expect(chips(page)).toHaveText(['春风']);
  await selectText(page, '明月');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以月寄情');
  await page.getByTestId('note-link').click();
  await expect(chips(page)).toHaveText(['春风', '以月寄情']);
});

test('keeps link chips after a reload', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  await expect(chips(page)).toHaveText(['比喻']);
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(chips(page)).toHaveText(['比喻'], { timeout: 30_000 });
});
```

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e links --project chromium --timeout 15000`
Expected: FAIL because there is no `toolbar-quote`, `popover-link` or `note-link`.

- [ ] **Step 2: Implement**

In `apps/client/src/article/markupRange.ts`, change the `ToolbarAction` line to:
```ts
/** Toolbar actions: a style for the selection, a side note (which highlights it), or a quote into the memo. */
export type ToolbarAction = 'underline' | 'bold' | 'highlight' | 'note' | 'quote';
```

In `apps/client/src/components/SelectionToolbar.tsx`, change `ACTIONS` to:
```ts
const ACTIONS: ToolbarAction[] = ['underline', 'bold', 'highlight', 'note', 'quote'];
```

Replace `apps/client/src/components/MarkupPopover.tsx` with:
```tsx
import type { MarkupView } from '@jot/db';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { excerpt } from '../article/excerpt';

interface Props {
  markups: MarkupView[];
  top: number;
  left: number;
  onClose(): void;
  onRemove(markup: MarkupView): void;
  onAddNote(markup: MarkupView): void;
  onLinkInMemo(markup: MarkupView): void;
}

export function MarkupPopover({ markups, top, left, onClose, onRemove, onAddNote, onLinkInMemo }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="popover" role="dialog" style={{ top, left }} onMouseDown={(e) => e.preventDefault()} data-testid="markup-popover">
      <ul>
        {markups.map((m) => (
          <li key={m.id} data-testid="popover-item">
            <span className="muted">{t(`markup.styles.${m.style}`)}</span>
            <span className="excerpt">{excerpt(m.exact)}</span>
            <div className="actions">
              <button type="button" onClick={() => onLinkInMemo(m)} data-testid="popover-link">
                {t('markup.linkInMemo')}
              </button>
              <button type="button" onClick={() => onAddNote(m)} data-testid="popover-add-note">
                {t('markup.addNote')}
              </button>
              <button type="button" onClick={() => onRemove(m)} data-testid="popover-remove">
                {t('markup.remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

In `apps/client/src/components/Margin.tsx`:
- in `interface MarginProps`, add `onLink(note: SideNoteView, body: string): void;`
- change the `Margin` signature to destructure `onLink` as well: `export function Margin({ notes, markups, handle, focusNoteId, onFocusHandled, onActivate, onLink }: MarginProps) {`
- in the `<NoteCard … />` element, add the prop `onLink={(body) => onLink(note, body)}`
- in `interface NoteCardProps`, add `onLink(body: string): void;`
- change the `NoteCard` signature to `function NoteCard({ note, top, autoFocus, register, onFocusHandled, onResize, onActivate, onLink }: NoteCardProps) {`
- in the card's `<footer>`, insert this before the delete button:
```tsx
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onLink(bodyRef.current)} data-testid="note-link">
          {t('notes.link')}
        </button>
```

Replace `apps/client/src/components/ArticlePane.tsx` with:
```tsx
import { captureAnchor } from '@jot/core';
import {
  createMarkup, createQuote, createSideNote, deleteMarkup, getArticle, listMarkups, listSideNotes, type MarkupView,
} from '@jot/db';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { excerpt } from '../article/excerpt';
import { markupRange, type ToolbarAction } from '../article/markupRange';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { ArticleView, type ArticleViewHandle, type SelectionInfo } from './ArticleView';
import { Margin } from './Margin';
import { MarkupPopover } from './MarkupPopover';
import { SelectionToolbar } from './SelectionToolbar';

interface PopoverState {
  ids: string[];
  rect: DOMRect;
}

export function ArticlePane({ articleId }: { articleId: string }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const { bridge } = useMemoContext();
  const article = useLibraryQuery((l) => getArticle(l, articleId), [articleId], ['article', 'article_revision']);
  const markups = useLibraryQuery((l) => listMarkups(l, articleId), [articleId], ['markup', 'anchor']);
  const notes = useLibraryQuery((l) => listSideNotes(l, articleId), [articleId], ['side_note', 'markup']);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [activeMarkupId, setActiveMarkupId] = useState<string | null>(null);
  const [handle, setHandle] = useState<ArticleViewHandle | null>(null);
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const clearFocus = useCallback(() => setFocusNoteId(null), []);
  const closePopover = useCallback(() => setPopover(null), []);

  const a = article.data;
  if (article.error) {
    return (
      <p className="empty error" role="alert">
        {t('app.error')} {article.error.message}
      </p>
    );
  }
  if (article.loading && !a) return <p className="empty">{t('article.loading')}</p>;
  if (!a) return <p className="empty">{t('article.missing')}</p>;

  const addNote = async (markupId: string) => {
    setActiveMarkupId(markupId);
    setFocusNoteId(await createSideNote(lib, { markupId, articleId, body: '' }));
  };

  const onAction = async (action: ToolbarAction) => {
    const sel = selection;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    if (!sel) return;
    const range = markupRange(a.text, sel);
    if (!range) return;
    const anchor = captureAnchor(a.text, range.start, range.end);
    if (action === 'quote') {
      const anchorId = await createQuote(lib, { articleId, revisionId: a.revisionId, anchor });
      bridge.insertLink({ targetType: 'anchor', targetId: anchorId, articleId, label: excerpt(anchor.exact) });
      return;
    }
    const style = action === 'note' ? 'highlight' : action;
    const { markupId } = await createMarkup(lib, { articleId, revisionId: a.revisionId, anchor, style });
    setActiveMarkupId(markupId);
    if (action === 'note') await addNote(markupId);
  };

  const onSelection = (next: SelectionInfo | null) => {
    setSelection(next);
    if (next) setPopover(null);
  };

  const onMarkupClick = (ids: string[], rect: DOMRect) => {
    setActiveMarkupId(ids[0] ?? null);
    setPopover(ids.length > 0 ? { ids, rect } : null);
  };

  const box = layoutRef.current?.getBoundingClientRect();
  const toolbarAt = selection && box ? { top: selection.rect.top - box.top - 6, left: Math.max(0, selection.rect.left - box.left) } : null;
  const popoverMarkups: MarkupView[] = popover ? (markups.data ?? []).filter((m) => popover.ids.includes(m.id)) : [];
  const popoverAt = popover && box ? { top: popover.rect.bottom - box.top + 6, left: Math.max(0, popover.rect.left - box.left) } : null;

  return (
    <div className="article-layout" ref={layoutRef}>
      <article lang={a.lang === 'zh' ? 'zh-CN' : 'en'}>
        <h1 className="article-title" data-testid="article-title">
          {a.title}
        </h1>
        {a.author && <p className="byline">{a.author}</p>}
        <ArticleView
          revisionId={a.revisionId}
          blocks={a.blocks}
          markups={markups.data ?? []}
          activeMarkupId={activeMarkupId}
          onSelection={onSelection}
          onMarkupClick={onMarkupClick}
          onReady={setHandle}
        />
      </article>
      <Margin
        notes={notes.data ?? []}
        markups={markups.data ?? []}
        handle={handle}
        focusNoteId={focusNoteId}
        onFocusHandled={clearFocus}
        onActivate={setActiveMarkupId}
        onLink={(note, body) =>
          bridge.insertLink({ targetType: 'side_note', targetId: note.id, articleId, label: excerpt(body) || t('notes.untitled') })
        }
      />
      {toolbarAt && <SelectionToolbar top={toolbarAt.top} left={toolbarAt.left} onAction={(k) => onAction(k).catch(reportError)} />}
      {popoverAt && popoverMarkups.length > 0 && (
        <MarkupPopover
          markups={popoverMarkups}
          top={popoverAt.top}
          left={popoverAt.left}
          onClose={closePopover}
          onRemove={(m) => {
            setPopover(null);
            setActiveMarkupId(null);
            deleteMarkup(lib, m.id).catch(reportError);
          }}
          onAddNote={(m) => {
            setPopover(null);
            addNote(m.id).catch(reportError);
          }}
          onLinkInMemo={(m) => {
            setPopover(null);
            bridge.insertLink({ targetType: 'markup', targetId: m.id, articleId, label: excerpt(m.exact) });
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run the links e2e on both browsers, plus regressions**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e links popover notes annotate memo`
Expected:
- links: chromium 3 passed; webkit 2 passed and 1 skipped
- the other specs: unchanged

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add apps/client
git commit -m "feat(client): quote passages, highlights and side notes into the memo as link chips"
```

---

### Task 7: Following a link: open the article, scroll and flash

**Files:**
- Modify:
  - `apps/client/src/article/decorations.ts` (options: `activeId`, `flash`, `citations`)
  - `apps/client/src/article/decorations.test.ts`
  - `apps/client/src/components/ArticleView.tsx` (replace)
  - `apps/client/src/components/ArticlePane.tsx` (replace)
- Create: `apps/client/e2e/follow.spec.ts`
- Test: `apps/client/src/article/decorations.test.ts`, `apps/client/e2e/follow.spec.ts`

**Interfaces:**
- Consumes: `targetRange` (Task 2); `useMemoContext().focus` and `settle` (Task 5).
- Produces:
  - `interface Citation { start; end; memoIds: readonly string[] }`
  - `interface DecorationOptions { activeId?; flash?: TextRange | null; citations?: readonly Citation[] }`
  - `buildDecorations(doc, markups, options?)`:
    - citations: class `cited cite-m-<memoId>…`, spec `{ citedBy }`
    - flash: class `flash`, spec `{ flash: true }`
  - `ArticleView` props `flash?: FlashTarget | null` (`{ start; end; token }`, where a new `token` scrolls the target into view) and `citations?: readonly Citation[]` (drawn from Task 8 onwards)
  - A missing target shows `memo.missingTarget` through the error banner.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('buildDecorations', …)` block in `apps/client/src/article/decorations.test.ts`:
```ts
  it('draws citations and the flash as their own inline decorations', () => {
    const found = buildDecorations(doc, [], {
      citations: [{ start: 2, end: 4, memoIds: ['m1', 'm2'] }],
      flash: { start: 12, end: 14 },
    })
      .find()
      .map((d) => ({ from: d.from, to: d.to, spec: d.spec as object }))
      .sort((a, b) => a.from - b.from);
    expect(found).toEqual([
      { from: 3, to: 5, spec: { citedBy: ['m1', 'm2'] } },
      { from: 13, to: 15, spec: { flash: true } },
    ]);
  });
```

`apps/client/e2e/follow.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

const chip = (page: Page) => page.getByTestId('memo-editor').locator('.anchor-chip');

test('a link scrolls a far-away passage into view and flashes it', async ({ page }) => {
  await openApp(page);
  const text = [...Array.from({ length: 150 }, (_, i) => `第${i}段：春风又绿江南岸。`), '目标句子就在这里。'].join('\n\n');
  await importText(page, '远处', text);
  await selectText(page, '目标句子');
  await page.getByTestId('toolbar-quote').click();
  await expect(chip(page)).toHaveText(['目标句子']);
  await page.locator('.reader').evaluate((el) => {
    el.scrollTop = 0;
  });
  await chip(page).click();
  const flash = page.locator('.flash');
  await expect(flash).toHaveText('目标句子');
  await expect(flash).toBeInViewport();
});

test('a link opens its article when another article is shown', async ({ page }) => {
  await openApp(page);
  await importText(page, '甲文', '春风又绿江南岸。他用比喻写春天。');
  await importText(page, '乙文', '乙文的内容。');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(1);
  await page.getByRole('link', { name: '甲文' }).click();
  await expect(page.getByTestId('article-title')).toHaveText('甲文');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  await expect(chip(page)).toHaveText(['比喻']);
  await page.getByRole('link', { name: '乙文' }).click();
  await expect(page.getByTestId('article-title')).toHaveText('乙文');
  await chip(page).click();
  await expect(page.getByTestId('article-title')).toHaveText('甲文');
  await expect(page.locator('.flash')).toHaveText('比喻');
});

test('a link to a removed highlight explains that the passage is gone (Review Focus 2)', async ({ page }) => {
  await openApp(page);
  await importText(page, '删除', '他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await page.locator('.mk-highlight').click();
  await page.getByTestId('popover-link').click();
  await expect(chip(page)).toHaveText(['比喻']);
  await page.locator('.mk-highlight').click();
  await page.getByTestId('popover-remove').click();
  await expect(page.locator('.mk-highlight')).toHaveCount(0);
  await chip(page).click();
  await expect(page.getByTestId('error-banner')).toContainText('The linked passage no longer exists.');
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/article/decorations.test.ts`
Expected: FAIL. The new test finds no decorations, because `buildDecorations` still takes `activeId` as its third argument.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e follow --project chromium --timeout 15000`
Expected: FAIL because no `.flash` appears.

- [ ] **Step 2: Implement decorations with options**

In `apps/client/src/article/decorations.ts`, replace everything from the `const ID_PREFIX` line down to the end of `buildDecorations` with:
```ts
const ID_PREFIX = 'mk-id-';
const CITE_PREFIX = 'cite-m-';

export interface Citation {
  start: number;
  end: number;
  memoIds: readonly string[];
}

export interface DecorationOptions {
  activeId?: string | null;
  /** A briefly highlighted range: where a followed memo link landed. */
  flash?: TextRange | null;
  /** Ranges cited by memos (spec §6.5 backlinks). */
  citations?: readonly Citation[];
}

/**
 * Markups as inline decorations styled by `mk-<style>` (underline, bold, highlight), plus memo citations
 * (`cited`) and the flash. Overlapping decorations share one span whose class lists every id.
 */
export function buildDecorations(doc: PMNode, markups: readonly MarkupView[], options: DecorationOptions = {}): DecorationSet {
  const max = doc.content.size - 2; // length of the canonical text
  const clamp = (offset: number) => Math.max(0, Math.min(max, offset));
  const decorations: Decoration[] = [];
  const add = (start: number, end: number, cls: string, spec: object) => {
    const s = clamp(start);
    const e = clamp(end);
    if (e > s) decorations.push(Decoration.inline(offsetToPos(s), offsetToPos(e), { class: cls }, spec));
  };
  for (const m of markups) {
    if (m.status === 'orphan') continue;
    add(m.start, m.end, `mk mk-${m.style} ${ID_PREFIX}${m.id}${m.id === options.activeId ? ' mk-active' : ''}`, { markupId: m.id });
  }
  for (const c of options.citations ?? []) {
    add(c.start, c.end, `cited ${c.memoIds.map((id) => `${CITE_PREFIX}${id}`).join(' ')}`, { citedBy: [...c.memoIds] });
  }
  if (options.flash) add(options.flash.start, options.flash.end, 'flash', { flash: true });
  return DecorationSet.create(doc, decorations);
}
```
Add `import type { TextRange } from '@jot/core';` at the top of the file.

In `apps/client/src/article/decorations.test.ts`, the helper `spans(…)` passes no third argument, so it needs no change.

Replace `apps/client/src/components/ArticleView.tsx` with:
```tsx
import type { Block } from '@jot/core';
import type { MarkupView } from '@jot/db';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useRef } from 'react';
import { buildDecorations, markupIdsAt, type Citation } from '../article/decorations';
import { blocksToDoc, offsetToPos, posToOffset } from '../article/schema';

export interface SelectionInfo {
  start: number;
  end: number;
  rect: DOMRect;
}

export interface ArticleViewHandle {
  /** Viewport coordinates of a canonical-text offset, or null if it cannot be measured. */
  coordsAtOffset(offset: number): { top: number; bottom: number; left: number } | null;
}

/** Where a followed link landed; a new `token` scrolls there again. */
export interface FlashTarget {
  start: number;
  end: number;
  token: number;
}

interface Props {
  revisionId: string;
  blocks: Block[];
  markups: MarkupView[];
  activeMarkupId: string | null;
  flash?: FlashTarget | null;
  citations?: readonly Citation[];
  onSelection(selection: SelectionInfo | null): void;
  onMarkupClick(ids: string[], rect: DOMRect): void;
  onReady?(handle: ArticleViewHandle | null): void;
}

const NO_CITATIONS: readonly Citation[] = [];

/** Canonical offsets of the DOM selection, or null when it is empty, only whitespace, or reaches outside `root`. */
function readSelection(view: EditorView, root: HTMLElement): SelectionInfo | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const max = view.state.doc.content.size - 2;
  const clamp = (offset: number) => Math.max(0, Math.min(max, offset));
  const a = clamp(posToOffset(view.posAtDOM(range.startContainer, range.startOffset)));
  const b = clamp(posToOffset(view.posAtDOM(range.endContainer, range.endOffset)));
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  // Nothing to mark up: an empty or whitespace-only selection shows no toolbar.
  if (view.state.doc.textBetween(offsetToPos(start), offsetToPos(end), ' ').trim() === '') return null;
  return { start, end, rect: range.getBoundingClientRect() };
}

/**
 * Read-only article rendered by ProseMirror (flat schema, pos = offset + 1). Markups, citations and the
 * flash are decorations, so none of them rebuilds the document, the selection or the scroll position.
 * The selection is read from the DOM with posAtDOM, which does not depend on the view being editable.
 */
export function ArticleView(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { revisionId, markups, activeMarkupId, flash = null, citations = NO_CITATIONS } = props;

  // One view per revision (revisions are immutable).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { blocks, markups: initial, activeMarkupId: activeId, onReady } = latest.current;
    const doc = blocksToDoc(blocks);
    const decorations = buildDecorations(doc, initial, {
      activeId,
      flash: latest.current.flash ?? null,
      citations: latest.current.citations ?? NO_CITATIONS,
    });
    const view = new EditorView(host, {
      state: EditorState.create({ doc }),
      editable: () => false,
      decorations: () => decorations,
    });
    viewRef.current = view;
    onReady?.({
      coordsAtOffset: (offset) => {
        try {
          return view.coordsAtPos(offsetToPos(offset));
        } catch {
          return null;
        }
      },
    });
    return () => {
      latest.current.onReady?.(null);
      view.destroy();
      viewRef.current = null;
    };
  }, [revisionId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const decorations = buildDecorations(view.state.doc, markups, { activeId: activeMarkupId, flash, citations });
    view.setProps({ decorations: () => decorations });
  }, [markups, activeMarkupId, flash, citations]);

  // Bring a followed link's target into view.
  const flashToken = flash?.token;
  useEffect(() => {
    const view = viewRef.current;
    const target = latest.current.flash;
    if (!view || !target) return;
    const { node } = view.domAtPos(offsetToPos(target.start));
    (node instanceof Element ? node : node.parentElement)?.scrollIntoView({ block: 'center' });
  }, [flashToken]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const doc = host.ownerDocument;
    const onRelease = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      // Let the browser finish updating the selection first.
      setTimeout(() => {
        const view = viewRef.current;
        if (!view) return;
        const selection = readSelection(view, host);
        latest.current.onSelection(selection);
        if (!selection && target && host.contains(target)) {
          latest.current.onMarkupClick(markupIdsAt(target, host), target.getBoundingClientRect());
        }
      });
    };
    doc.addEventListener('mouseup', onRelease);
    doc.addEventListener('keyup', onRelease);
    return () => {
      doc.removeEventListener('mouseup', onRelease);
      doc.removeEventListener('keyup', onRelease);
    };
  }, []);

  return <div ref={hostRef} className="article-view" data-testid="article-view" />;
}
```

Append to `apps/client/src/styles/app.css`:
```css
/* Followed links and memo citations */
.cited { border-bottom: 1px dotted var(--accent); }
.flash { animation: jot-flash 1.6s ease-out; border-radius: 2px; }
@keyframes jot-flash {
  0%, 35% { background: rgba(47, 93, 138, 0.35); }
  100% { background: transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .flash { animation: none; background: rgba(47, 93, 138, 0.25); }
}
```

- [ ] **Step 3: Wire the focus into the article pane**

Replace `apps/client/src/components/ArticlePane.tsx` with the Task 6 version, plus these changes:
1. Add `targetRange` to the `@jot/db` import, and change the React import to `import { useCallback, useEffect, useRef, useState } from 'react';`.
2. Import `type FlashTarget` from `./ArticleView` alongside `ArticleViewHandle` and `SelectionInfo`.
3. Change `const { bridge } = useMemoContext();` to `const { bridge, focus, settle } = useMemoContext();`.
4. Add these lines right after `const closePopover = useCallback(() => setPopover(null), []);`:
```tsx
  const [flash, setFlash] = useState<FlashTarget | null>(null);

  // Following a memo link: find the target's current range, then scroll to it and flash it.
  useEffect(() => {
    if (!focus || focus.articleId !== articleId || !handle) return;
    let active = true;
    targetRange(lib, focus.targetType, focus.targetId).then((range) => {
      if (!active) return;
      settle(focus.token);
      if (!range || range.articleId !== articleId) {
        reportError(new Error(t('memo.missingTarget')));
        return;
      }
      setFlash({ start: range.start, end: range.end, token: focus.token });
    }, reportError);
    return () => {
      active = false;
    };
  }, [focus, handle, articleId, lib, t, settle]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(timer);
  }, [flash]);
```
5. Pass `flash={flash}` to `<ArticleView … />`.

- [ ] **Step 4: Run the unit tests and the follow e2e on both browsers**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client && pnpm typecheck && pnpm lint'`
Expected: every client test passes, with no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e follow links annotate`
Expected: follow 3 passed on each browser; links and annotate unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client): follow memo links to their passage with scroll and flash"
```

---

### Task 8: Backlinks: mark cited passages and open the citing memo

**Files:**
- Create: `apps/client/src/article/citations.ts`, `apps/client/e2e/backlinks.spec.ts`
- Modify:
  - `apps/client/src/article/decorations.ts` (`markupIdsAt` becomes `annotationIdsAt`)
  - `apps/client/src/article/decorations.test.ts`
  - `apps/client/src/components/ArticleView.tsx`
  - `apps/client/src/components/MarkupPopover.tsx` (replace)
  - `apps/client/src/components/ArticlePane.tsx` (replace)
- Test: `apps/client/src/article/citations.test.ts`, `apps/client/src/article/decorations.test.ts`, `apps/client/e2e/backlinks.spec.ts`

**Interfaces:**
- Consumes: `listBacklinks` and `Backlink` (Task 2); `Citation` (Task 7); `MemoBridge.showMemo` (Task 4).
- Produces:
  - `citationsOf(backlinks): Citation[]` — one citation per cited range, each memo listed once, orphans skipped
  - `interface AnnotationIds { markupIds: string[]; memoIds: string[] }` and `annotationIdsAt(el, root): AnnotationIds`
  - `ArticleView`'s prop `onMarkupClick` becomes `onAnnotationClick(ids: AnnotationIds, rect)`
  - `MarkupPopover` props `memos: CitingMemo[]` and `onOpenMemo(memoId)`, with test IDs `popover-memo` and `popover-open-memo`

- [ ] **Step 1: Write the failing tests**

`apps/client/src/article/citations.test.ts`:
```ts
import type { Backlink } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { citationsOf } from './citations';

const link = (memoId: string, start: number, end: number, status: Backlink['status'] = 'exact'): Backlink => ({
  memoId,
  memoTitle: memoId,
  targetType: 'anchor',
  targetId: `${start}`,
  start,
  end,
  status,
});

describe('citationsOf', () => {
  it('groups memos by cited range, listing each memo once', () => {
    expect(citationsOf([link('m1', 2, 4), link('m2', 2, 4), link('m1', 2, 4), link('m1', 8, 9)])).toEqual([
      { start: 2, end: 4, memoIds: ['m1', 'm2'] },
      { start: 8, end: 9, memoIds: ['m1'] },
    ]);
  });

  it('skips ranges whose anchor is orphaned', () => {
    expect(citationsOf([link('m1', 2, 4, 'orphan')])).toEqual([]);
  });
});
```

In `apps/client/src/article/decorations.test.ts`:
- change the import to `import { annotationIdsAt, buildDecorations } from './decorations';`
- replace the whole `describe('markupIdsAt', …)` block with:
```ts
describe('annotationIdsAt', () => {
  it('collects markup and citing-memo ids from the element and its ancestors inside the root', () => {
    document.body.innerHTML =
      '<div id="root"><p><span class="mk mk-bold mk-id-a mk-id-b cited cite-m-memo1">绿</span>x</p></div>';
    const root = document.getElementById('root') as HTMLElement;
    const ids = annotationIdsAt(root.querySelector('span') as Element, root);
    expect(ids.markupIds.sort()).toEqual(['a', 'b']);
    expect(ids.memoIds).toEqual(['memo1']);
    expect(annotationIdsAt(root, root)).toEqual({ markupIds: [], memoIds: [] });
  });
});
```

`apps/client/e2e/backlinks.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

async function quoteIntoMemo(page: Page) {
  await openApp(page);
  await importText(page, '引用', '春风又绿江南岸。他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.locator('.cited')).toHaveText('比喻');
}

test('marks cited passages and opens the citing memo from them', async ({ page }) => {
  await quoteIntoMemo(page);
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(2);
  await page.locator('.cited').click();
  await expect(page.getByTestId('popover-memo')).toHaveCount(1);
  await expect(page.getByTestId('popover-memo')).toContainText('Memo 1');
  await page.getByTestId('popover-open-memo').click();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['比喻']);
});

test('the cited mark disappears when its memo is deleted', async ({ page }) => {
  await quoteIntoMemo(page);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('memo-delete').click();
  await expect(page.locator('.cited')).toHaveCount(0);
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/article`
Expected: FAIL with `Cannot find module './citations'`, and `annotationIdsAt is not a function`.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e backlinks --project chromium --timeout 15000`
Expected: FAIL because no `.cited` element appears.

- [ ] **Step 2: Implement**

`apps/client/src/article/citations.ts`:
```ts
import type { Backlink } from '@jot/db';
import type { Citation } from './decorations';

/** One citation per cited range (orphaned anchors skipped), listing each citing memo once. */
export function citationsOf(backlinks: readonly Backlink[]): Citation[] {
  const byRange = new Map<string, { start: number; end: number; memoIds: string[] }>();
  for (const b of backlinks) {
    if (b.status === 'orphan') continue;
    const key = `${b.start}:${b.end}`;
    const entry = byRange.get(key) ?? { start: b.start, end: b.end, memoIds: [] };
    if (!entry.memoIds.includes(b.memoId)) entry.memoIds.push(b.memoId);
    byRange.set(key, entry);
  }
  return [...byRange.values()];
}
```

In `apps/client/src/article/decorations.ts`, replace the `markupIdsAt` function with:
```ts
export interface AnnotationIds {
  markupIds: string[];
  memoIds: string[];
}

/** Markup ids and citing-memo ids on `el` and its ancestors up to (not including) `root`. */
export function annotationIdsAt(el: Element, root: Element): AnnotationIds {
  const markupIds = new Set<string>();
  const memoIds = new Set<string>();
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    for (const cls of node.classList) {
      if (cls.startsWith(ID_PREFIX)) markupIds.add(cls.slice(ID_PREFIX.length));
      else if (cls.startsWith(CITE_PREFIX)) memoIds.add(cls.slice(CITE_PREFIX.length));
    }
  }
  return { markupIds: [...markupIds], memoIds: [...memoIds] };
}
```

In `apps/client/src/components/ArticleView.tsx`:
- import `annotationIdsAt` and `type AnnotationIds` instead of `markupIdsAt`: `import { annotationIdsAt, buildDecorations, type AnnotationIds, type Citation } from '../article/decorations';`
- in `Props`, replace `onMarkupClick(ids: string[], rect: DOMRect): void;` with `onAnnotationClick(ids: AnnotationIds, rect: DOMRect): void;`
- in the release handler, replace `latest.current.onMarkupClick(markupIdsAt(target, host), target.getBoundingClientRect());` with `latest.current.onAnnotationClick(annotationIdsAt(target, host), target.getBoundingClientRect());`
- add `export type { AnnotationIds };` after the imports

Replace `apps/client/src/components/MarkupPopover.tsx` with:
```tsx
import type { MarkupView } from '@jot/db';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { excerpt } from '../article/excerpt';

export interface CitingMemo {
  id: string;
  title: string;
}

interface Props {
  markups: MarkupView[];
  memos: CitingMemo[];
  top: number;
  left: number;
  onClose(): void;
  onRemove(markup: MarkupView): void;
  onAddNote(markup: MarkupView): void;
  onLinkInMemo(markup: MarkupView): void;
  onOpenMemo(memoId: string): void;
}

/** What is under a click in the article: its markups (with actions) and the memos that cite it. */
export function MarkupPopover({ markups, memos, top, left, onClose, onRemove, onAddNote, onLinkInMemo, onOpenMemo }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="popover" role="dialog" style={{ top, left }} onMouseDown={(e) => e.preventDefault()} data-testid="markup-popover">
      {markups.length > 0 && (
        <ul>
          {markups.map((m) => (
            <li key={m.id} data-testid="popover-item">
              <span className="muted">{t(`markup.styles.${m.style}`)}</span>
              <span className="excerpt">{excerpt(m.exact)}</span>
              <div className="actions">
                <button type="button" onClick={() => onLinkInMemo(m)} data-testid="popover-link">
                  {t('markup.linkInMemo')}
                </button>
                <button type="button" onClick={() => onAddNote(m)} data-testid="popover-add-note">
                  {t('markup.addNote')}
                </button>
                <button type="button" onClick={() => onRemove(m)} data-testid="popover-remove">
                  {t('markup.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {memos.length > 0 && (
        <section className="cited-in">
          <h3 className="muted">{t('memo.citedIn')}</h3>
          <ul>
            {memos.map((m) => (
              <li key={m.id} data-testid="popover-memo">
                <span>{m.title}</span>
                <div className="actions">
                  <button type="button" onClick={() => onOpenMemo(m.id)} data-testid="popover-open-memo">
                    {t('memo.open')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

Append to `apps/client/src/styles/app.css`:
```css
.popover .cited-in h3 { margin: 4px 6px 0; font-size: 12px; font-weight: normal; }
```

Replace `apps/client/src/components/ArticlePane.tsx` with (the final plan-3 version):
```tsx
import { captureAnchor } from '@jot/core';
import {
  createMarkup, createQuote, createSideNote, deleteMarkup, getArticle, listBacklinks, listMarkups, listSideNotes, targetRange,
  type MarkupView,
} from '@jot/db';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { citationsOf } from '../article/citations';
import { excerpt } from '../article/excerpt';
import { markupRange, type ToolbarAction } from '../article/markupRange';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { ArticleView, type AnnotationIds, type ArticleViewHandle, type FlashTarget, type SelectionInfo } from './ArticleView';
import { Margin } from './Margin';
import { MarkupPopover, type CitingMemo } from './MarkupPopover';
import { SelectionToolbar } from './SelectionToolbar';

interface PopoverState extends AnnotationIds {
  rect: DOMRect;
}

const FLASH_MS = 1600;

export function ArticlePane({ articleId }: { articleId: string }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const { bridge, focus, settle } = useMemoContext();
  const article = useLibraryQuery((l) => getArticle(l, articleId), [articleId], ['article', 'article_revision']);
  const markups = useLibraryQuery((l) => listMarkups(l, articleId), [articleId], ['markup', 'anchor']);
  const notes = useLibraryQuery((l) => listSideNotes(l, articleId), [articleId], ['side_note', 'markup']);
  const backlinks = useLibraryQuery((l) => listBacklinks(l, articleId), [articleId], [
    'memo',
    'memo_update',
    'markup',
    'side_note',
    'anchor',
  ]);
  const citations = useMemo(() => citationsOf(backlinks.data ?? []), [backlinks.data]);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [activeMarkupId, setActiveMarkupId] = useState<string | null>(null);
  const [handle, setHandle] = useState<ArticleViewHandle | null>(null);
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [flash, setFlash] = useState<FlashTarget | null>(null);
  const clearFocus = useCallback(() => setFocusNoteId(null), []);
  const closePopover = useCallback(() => setPopover(null), []);

  // Following a memo link: find the target's current range, then scroll to it and flash it.
  useEffect(() => {
    if (!focus || focus.articleId !== articleId || !handle) return;
    let active = true;
    targetRange(lib, focus.targetType, focus.targetId).then((range) => {
      if (!active) return;
      settle(focus.token);
      if (!range || range.articleId !== articleId) {
        reportError(new Error(t('memo.missingTarget')));
        return;
      }
      setFlash({ start: range.start, end: range.end, token: focus.token });
    }, reportError);
    return () => {
      active = false;
    };
  }, [focus, handle, articleId, lib, t, settle]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  const a = article.data;
  if (article.error) {
    return (
      <p className="empty error" role="alert">
        {t('app.error')} {article.error.message}
      </p>
    );
  }
  if (article.loading && !a) return <p className="empty">{t('article.loading')}</p>;
  if (!a) return <p className="empty">{t('article.missing')}</p>;

  const addNote = async (markupId: string) => {
    setActiveMarkupId(markupId);
    setFocusNoteId(await createSideNote(lib, { markupId, articleId, body: '' }));
  };

  const onAction = async (action: ToolbarAction) => {
    const sel = selection;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    if (!sel) return;
    const range = markupRange(a.text, sel);
    if (!range) return;
    const anchor = captureAnchor(a.text, range.start, range.end);
    if (action === 'quote') {
      const anchorId = await createQuote(lib, { articleId, revisionId: a.revisionId, anchor });
      bridge.insertLink({ targetType: 'anchor', targetId: anchorId, articleId, label: excerpt(anchor.exact) });
      return;
    }
    const style = action === 'note' ? 'highlight' : action;
    const { markupId } = await createMarkup(lib, { articleId, revisionId: a.revisionId, anchor, style });
    setActiveMarkupId(markupId);
    if (action === 'note') await addNote(markupId);
  };

  const onSelection = (next: SelectionInfo | null) => {
    setSelection(next);
    if (next) setPopover(null);
  };

  const onAnnotationClick = (ids: AnnotationIds, rect: DOMRect) => {
    setActiveMarkupId(ids.markupIds[0] ?? null);
    setPopover(ids.markupIds.length > 0 || ids.memoIds.length > 0 ? { ...ids, rect } : null);
  };

  const box = layoutRef.current?.getBoundingClientRect();
  const toolbarAt = selection && box ? { top: selection.rect.top - box.top - 6, left: Math.max(0, selection.rect.left - box.left) } : null;
  const popoverMarkups: MarkupView[] = popover ? (markups.data ?? []).filter((m) => popover.markupIds.includes(m.id)) : [];
  const popoverMemos: CitingMemo[] = popover
    ? popover.memoIds.flatMap((id) => {
        const cite = (backlinks.data ?? []).find((b) => b.memoId === id);
        return cite ? [{ id, title: cite.memoTitle }] : [];
      })
    : [];
  const popoverAt = popover && box ? { top: popover.rect.bottom - box.top + 6, left: Math.max(0, popover.rect.left - box.left) } : null;

  return (
    <div className="article-layout" ref={layoutRef}>
      <article lang={a.lang === 'zh' ? 'zh-CN' : 'en'}>
        <h1 className="article-title" data-testid="article-title">
          {a.title}
        </h1>
        {a.author && <p className="byline">{a.author}</p>}
        <ArticleView
          revisionId={a.revisionId}
          blocks={a.blocks}
          markups={markups.data ?? []}
          activeMarkupId={activeMarkupId}
          flash={flash}
          citations={citations}
          onSelection={onSelection}
          onAnnotationClick={onAnnotationClick}
          onReady={setHandle}
        />
      </article>
      <Margin
        notes={notes.data ?? []}
        markups={markups.data ?? []}
        handle={handle}
        focusNoteId={focusNoteId}
        onFocusHandled={clearFocus}
        onActivate={setActiveMarkupId}
        onLink={(note, body) =>
          bridge.insertLink({ targetType: 'side_note', targetId: note.id, articleId, label: excerpt(body) || t('notes.untitled') })
        }
      />
      {toolbarAt && <SelectionToolbar top={toolbarAt.top} left={toolbarAt.left} onAction={(k) => onAction(k).catch(reportError)} />}
      {popoverAt && (popoverMarkups.length > 0 || popoverMemos.length > 0) && (
        <MarkupPopover
          markups={popoverMarkups}
          memos={popoverMemos}
          top={popoverAt.top}
          left={popoverAt.left}
          onClose={closePopover}
          onRemove={(m) => {
            setPopover(null);
            setActiveMarkupId(null);
            deleteMarkup(lib, m.id).catch(reportError);
          }}
          onAddNote={(m) => {
            setPopover(null);
            addNote(m.id).catch(reportError);
          }}
          onLinkInMemo={(m) => {
            setPopover(null);
            bridge.insertLink({ targetType: 'markup', targetId: m.id, articleId, label: excerpt(m.exact) });
          }}
          onOpenMemo={(memoId) => {
            setPopover(null);
            bridge.showMemo(memoId);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run the unit tests, then the whole e2e suite on both browsers**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes (3 new ones), with no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e`
Expected: every spec passes. backlinks: 2 passed on each browser. The only skips are the WebKit OPFS and synthetic-paste tests.

- [ ] **Step 4: Commit**

```bash
git add apps/client
git commit -m "feat(client): mark passages cited by memos and open the citing memo from them"
```

---

### Task 9: Spec, README, desktop check and the full verification

**Files:**
- Modify: `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` (§6.5), `README.md`
- Test: the complete verification below, plus a desktop screenshot

**Interfaces:**
- Consumes: everything above.
- Produces: an up-to-date spec §6.5 and README, and a verified desktop build.

- [ ] **Step 1: Update spec §6.5 to match what was built**

In `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`, replace the `- **Anchor links:** …` bullet and its three sub-bullets (drag, copy link, `[[`) with:
```markdown
- **Anchor links:** a custom inline node `anchorLink {linkId, targetType: 'anchor'|'markup'|'side_note', targetId, articleId, label}`. A writer creates one with:
  - **Quote** (引用) in the selection toolbar, which creates an `anchor` row for the selection;
  - **Link in memo** (插入札记) in a highlight's menu;
  - **Quote in memo** (引用) on a side-note card.
  With no memo open, a new one is created for the current article. Drag-and-drop and copy-link-then-paste were dropped (plan 3). `[[` search-to-link arrives with the search UI (plan 4). Point links are deferred.
- **Memo column:** the current article's memos (`home_article_id`) are shown as tabs. A memo opened from elsewhere, or still being written when the writer switches articles, stays open as a closable tab.
```

In the `- **Backlinks:** …` bullet, replace its text with:
```markdown
- **Backlinks:** after each save, `memo_link` and `memo_cache.text` are recomputed. Passages cited by a memo get a dotted underline; clicking one lists the citing memos, each with an **Open** button.
```

- [ ] **Step 2: Update the README**

In `README.md`, replace the first paragraph under `# Jot` with:
```markdown
A library for writers who study model articles. Import an article (paste, `.txt`, `.md`), read it in a
calm two-column layout, underline, bold or highlight passages of any length, keep side notes beside them,
and write analysis memos that quote passages and jump back to them. Interface in 简体中文 and English.
Desktop (Windows, macOS) and web.
```

- [ ] **Step 3: Check the desktop app through WSLg**

Run `docker compose up -d desktop` and wait for `Running /cargo-target/debug/jot-desktop` in `docker compose logs desktop`. Then:
Run: `docker compose exec -T -u node desktop node apps/desktop/scripts/screenshot.mjs Jot .screenshots/desktop-memos.png`
Expected: the window shows the shell with the memo column heading (札记 or Memo). Open the PNG to check it.

Before this task is complete, ask the user to try it by hand: open an article, quote a passage into a memo, type, and click the chip.

Then: `docker compose stop desktop`

- [ ] **Step 4: Run the complete verification on a freshly started dev server**

Run:
```bash
docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test'
docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'
docker compose restart web && docker compose --profile e2e up -d playwright
docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e
```
Expected: every command exits 0. The e2e run shows no failures; the only skips are the WebKit OPFS and synthetic-paste tests.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-27-jot-core-app-design.md README.md
git commit -m "docs: memos, links and backlinks in the spec and README"
```

---

## Done when

- In the browser and in the desktop window, a writer can:
  - create memos beside an article and type in Chinese and English,
  - quote a passage, a highlight or a side note into a memo as a link,
  - click the link to jump back, including from another article,
  - see that a passage is cited and open the citing memo,
  - reload and find everything still there.
- Undo after a reload never deletes saved text, and a link to a deleted passage explains itself.
- `pnpm typecheck && pnpm lint && pnpm test` and `cargo test` pass, and the e2e suite passes on Chromium and WebKit.
