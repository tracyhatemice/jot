# Jot Plan 4: Tags and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Writers can:
- tag articles, markups, side notes and memos;
- arrange tags into a hierarchy where a tag can have several parents;
- find anything again from the sidebar by keyword, tag and item type;
- link a passage into a memo by typing `[[`.

**Architecture:** Plan 1's data layer already stores tags, edges and taggings, and already runs keyword, tag, type and inherit searches. This plan adds three things to it:
- a results query that returns the text each hit is shown with, plus a snippet builder;
- a single-step "move tag" operation;
- an article-wide tagging query.

The UI is built on top of those:
- one tag context for the whole shell;
- tag chips with a search-as-you-type picker on every taggable item;
- a tag tree in the sidebar: drag to move a tag, Alt-drag to add a parent, and a menu offering the same actions;
- a search panel that takes the library list's place while a search is active;
- a TipTap suggestion that searches markups and side notes after `[[` or `【【`.

**Tech Stack:** The same as plans 1–3, plus `@tiptap/suggestion` 3.31.3 (MIT) and its peer `@floating-ui/dom` (MIT).

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`, especially:
- §6.3 search;
- §6.4 tag graph;
- §6.5 `[[` links;
- §6.8 shell;
- §10, acceptance step 4.

**Series:** This is plan 4 of 5. Plan 5 covers:
- fix-up editing with reattachment and the orphaned-markups panel;
- `.docx` import;
- JSON export and import, and desktop backup;
- CI desktop builds.

**Branch:** `plan-4-tags-search`

## Global Constraints

- **Plan 1–3 constraints all still apply:**
  - Docker only; nothing is installed on the host.
  - Node ≥ 24, pnpm 10, TypeScript ~5.9 with `verbatimModuleSyntax`, so type-only imports use `import type`.
  - `SqlDriver` has only `query` and `batch`.
  - Synced tables are written only through `Library.commit`.
  - Dependencies must be MIT, BSD or Apache licensed.
  - Every user-facing string goes through i18next (`zh-CN` and `en`, typed `Messages`, identical keys in both files).
  - No `dangerouslySetInnerHTML`. Search highlights are React `<mark>` elements around plain text.
  - Unicode escapes are written as `\u{XXXX}`.
  - Conventional commits, with **no attribution lines**.
- **Commands:**
  - Run: `docker compose run --rm -T -e NO_COLOR=1 dev <cmd>`.
  - End-to-end: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e [spec]`, with the `web` and `playwright` services up.
  - After adding dependencies, run `docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright`. The Playwright container shares `web`'s network, so restarting `web` alone cuts it off (a plan-3 finding).
- **Tag names** are compared with `foldTagName` (NFKC, trimmed, spaces collapsed, lower case). When a typed name folds to an existing tag's name, that existing tag is used; the picker never offers to create a duplicate.
- **Cycles** are refused in the database layer (`addParent` and `moveTag`, under `lib.lock`). The UI explains the refusal with `tags.cycle`.
- **Which article a tagging belongs to (`tagging.article_id`):**
  - an article's tagging → the article's own id;
  - a markup's or side note's tagging → their article;
  - a memo's tagging → `null`, because memos are not inside an article (plan-3 ruling).
- **Search input** reaches FTS5 only through `buildFtsQuery`, by way of `search()`. Blank or whitespace-only input means "not searching".
- **Query refreshes:** every `useLibraryQuery` call passes the list of synced tables whose commits change its result. Search uses `SEARCH_TABLES`, which lists every synced table.
- **Spec §6.4 is followed in full:** drag moves a tag, Alt-drag adds a parent, and a row menu offers the same actions so they can be done without a mouse drag.

## Review Focus

These five inputs aren't covered by the happy paths and are most likely to bite. Each has a test in the task that owns the code.

1. **Search text that looks like syntax**, such as `") OR * NEAR(`, quoted words, or input that is only spaces.
   - Expectation: no error and no error banner. Operators are treated as plain text, and blank input simply isn't a search.
   - Tests: Task 1 (unit), Task 4 (end-to-end).
2. **Chinese input methods.**
   - Expectation:
     - Pinyin that is still being composed in the search box is not searched.
     - `【【`, which is what the `[` key types in Chinese mode, opens link suggestions, including right after Chinese text with no space.
   - Tests: Task 4 (end-to-end with composition driven through Chromium's DevTools protocol), Task 6 (end-to-end).
3. **Tag names that differ only by case, full-width letters or spacing** ("Craft", "ＣＲＡＦＴ", " craft ").
   - Expectation: the picker offers the existing tag and never fails with "already exists".
   - Tests: Task 3 (unit and end-to-end).
4. **Cycles and multiple parents.**
   - Expectation:
     - Dropping a tag onto its own subtag shows a message and changes nothing.
     - Dropping a tag onto itself does nothing.
     - A tag with two parents appears under both.
     - Deleting a parent keeps its subtags.
   - Tests: Task 2 (unit), Task 5 (unit and end-to-end).
5. **Items that change or disappear while listed in search results.**
   - Expectation: the results follow deletions. A result for a removed markup vanishes instead of leading to a dead end.
   - Tests: Task 4 (end-to-end).

---

## File Map

```
packages/core/src/search/snippet.ts              makeSnippet                                   Task 1
packages/db/src/search.ts                        + searchLibrary, SearchResult                 Task 1
apps/client/src/tags/tree.ts, TagContext.tsx, errors.ts   tree, shared tag index, messages      Task 2
packages/db/src/tags.ts                          + listArticleTaggings (Task 3), moveTag (Task 5), DuplicateTagNameError.tagName (Task 2)
apps/client/src/tags/match.ts, components/TagPicker.tsx, TagChips.tsx                          Task 3
components/ArticlePane.tsx, MarkupPopover.tsx, Margin.tsx, MemoPane.tsx (tag chips)            Task 3
components/SearchPanel.tsx, Sidebar.tsx                                                        Task 4
components/TagTree.tsx, Sidebar.tsx                                                            Task 5
apps/client/src/memo/passages.ts, linkSuggestion.ts, LinkSuggestionList.tsx, MemoEditor.tsx   Task 6
docs/superpowers/specs/…design.md, README.md                                                   Task 7
apps/client/e2e/tags.spec.ts, search.spec.ts, tagtree.spec.ts, suggest.spec.ts                 Tasks 3–6
```

---

### Task 1: Search results with snippets

**Files:**
- Create: `packages/core/src/search/snippet.ts`, `packages/core/src/search/snippet.test.ts`, `packages/db/src/searchLibrary.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/db/src/search.ts`
- Test: `packages/core/src/search/snippet.test.ts`, `packages/db/src/searchLibrary.test.ts`

**Interfaces:**
- Consumes: `search`, `SearchParams` and `SearchHit` (plan 1); `snapOffset` (core).
- Produces:
  - `interface SnippetPart { text: string; hit: boolean }`
  - `interface Snippet { parts: SnippetPart[]; cutStart: boolean; cutEnd: boolean }`
  - `makeSnippet(text, highlights: readonly TextRange[], radius = 40): Snippet`
    - It returns a window around the first highlight, or the start of the text when nothing is highlighted.
    - Whitespace runs become single spaces, and the cuts never split a surrogate pair.
    - `radius = Infinity` returns the whole text, with its highlights marked.
  - `interface SearchResult extends SearchHit { title: string; text: string; articleTitle: string | null }`
  - `searchLibrary(lib, params): Promise<SearchResult[]>`
    - `title` is the article's or memo's title, and is empty for markups and side notes.
    - `text` is the article text, the quoted passage, the note body or the memo text.
    - `articleTitle` is `null` for memos.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/search/snippet.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { makeSnippet } from './snippet';

describe('makeSnippet', () => {
  it('cuts a window around the first match and marks the matches in it', () => {
    const text = `${'甲'.repeat(50)}他用比喻写春天${'乙'.repeat(50)}`;
    expect(makeSnippet(text, [{ start: 52, end: 54 }], 4)).toEqual({
      parts: [
        { text: '甲甲他用', hit: false },
        { text: '比喻', hit: true },
        { text: '写春天乙', hit: false },
      ],
      cutStart: true,
      cutEnd: true,
    });
  });

  it('starts at the beginning when nothing is highlighted, and collapses whitespace', () => {
    expect(makeSnippet('第一段。\n\n第二段。', [], 40)).toEqual({
      parts: [{ text: '第一段。 第二段。', hit: false }],
      cutStart: false,
      cutEnd: false,
    });
  });

  it('never cuts inside an emoji', () => {
    const text = `${'😀'.repeat(10)}比喻`;
    expect(makeSnippet(text, [{ start: 20, end: 22 }], 3).parts[0]).toEqual({ text: '😀😀', hit: false });
  });

  it('marks every match inside the window, and an infinite radius keeps the whole text', () => {
    expect(makeSnippet('比喻和比喻', [{ start: 0, end: 2 }, { start: 3, end: 5 }], Infinity)).toEqual({
      parts: [
        { text: '比喻', hit: true },
        { text: '和', hit: false },
        { text: '比喻', hit: true },
      ],
      cutStart: false,
      cutEnd: false,
    });
  });
});
```

`packages/db/src/searchLibrary.test.ts`:
```ts
import { captureAnchor } from '@jot/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, getArticle } from './articles';
import { Library } from './library';
import { createMarkup, createSideNote } from './markups';
import { appendMemoUpdate, createMemo } from './memos';
import { searchLibrary } from './search';
import { createTag, tagEntity } from './tags';

let lib: Library;
let articleId: string;
let markupId: string;
let noteId: string;
let memoId: string;

beforeEach(async () => {
  let t = 1000;
  lib = await Library.open(createNodeDriver(), { now: () => t++ });
  const created = await createArticle(lib, {
    title: '春',
    importKind: 'paste',
    blocks: [{ k: 'p', runs: [{ t: '春风又绿江南岸。他用比喻写春天。' }] }],
  });
  articleId = created.articleId;
  const text = (await getArticle(lib, articleId))!.text;
  ({ markupId } = await createMarkup(lib, {
    articleId,
    revisionId: created.revisionId,
    anchor: captureAnchor(text, 10, 12),
    style: 'highlight',
  }));
  noteId = await createSideNote(lib, { markupId, articleId, body: '这个比喻很妙' });
  memoId = await createMemo(lib, { title: '比喻札记', homeArticleId: articleId });
  await appendMemoUpdate(lib, memoId, Uint8Array.from([1]), { text: '论比喻', links: [] });
});

describe('searchLibrary', () => {
  it('returns every matching item with the text to show for it', async () => {
    const results = await searchLibrary(lib, { text: '比喻' });
    const byType = Object.fromEntries(results.map((r) => [r.entityType, r]));
    expect(results).toHaveLength(4);
    expect(byType.article).toMatchObject({ entityId: articleId, title: '春', articleTitle: '春', text: '春风又绿江南岸。他用比喻写春天。' });
    expect(byType.markup).toMatchObject({ entityId: markupId, articleId, title: '', articleTitle: '春', text: '比喻' });
    expect(byType.side_note).toMatchObject({ entityId: noteId, articleId, title: '', articleTitle: '春', text: '这个比喻很妙' });
    expect(byType.memo).toMatchObject({ entityId: memoId, articleId: null, title: '比喻札记', articleTitle: null, text: '论比喻' });
  });

  it('filters by type and by tag', async () => {
    const tag = await createTag(lib, { name: '修辞' });
    await tagEntity(lib, { tagId: tag, entityType: 'side_note', entityId: noteId, articleId });
    expect((await searchLibrary(lib, { text: '比喻', types: ['markup'] })).map((r) => r.entityId)).toEqual([markupId]);
    expect((await searchLibrary(lib, { tagIds: [tag] })).map((r) => r.entityId)).toEqual([noteId]);
  });

  it('treats search syntax in the query as plain text (Review Focus 1)', async () => {
    await expect(searchLibrary(lib, { text: '") OR * NEAR(' })).resolves.toEqual([]);
    await expect(searchLibrary(lib, { text: '   ' })).resolves.toEqual([]);
    expect((await searchLibrary(lib, { text: '"比喻"', types: ['markup'] })).map((r) => r.entityId)).toEqual([markupId]);
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/core/src/search/snippet.test.ts packages/db/src/searchLibrary.test.ts`
Expected: FAIL with `Cannot find module './snippet'` and `searchLibrary is not a function` (or "does not provide an export named 'searchLibrary'").

- [ ] **Step 2: Implement**

`packages/core/src/search/snippet.ts`:
```ts
import { snapOffset } from '../anchoring/capture';
import type { TextRange } from '../text-range';

export interface SnippetPart {
  text: string;
  hit: boolean;
}

export interface Snippet {
  parts: SnippetPart[];
  /** Text was cut before or after the snippet (show an ellipsis there). */
  cutStart: boolean;
  cutEnd: boolean;
}

/**
 * A short excerpt of `text` around its first highlight (or from its start), with the highlights in it
 * marked. Whitespace runs become single spaces; cuts never split a surrogate pair. `radius = Infinity`
 * keeps the whole text.
 */
export function makeSnippet(text: string, highlights: readonly TextRange[], radius = 40): Snippet {
  const first = highlights[0];
  const start = snapOffset(text, first ? Math.max(0, first.start - radius) : 0, -1);
  const end = snapOffset(text, Math.min(text.length, first ? first.end + radius : radius * 2), 1);
  const parts: SnippetPart[] = [];
  let at = start;
  for (const h of highlights) {
    const s = Math.max(h.start, start);
    const e = Math.min(h.end, end);
    if (e <= s || s < at) continue;
    if (s > at) parts.push({ text: text.slice(at, s), hit: false });
    parts.push({ text: text.slice(s, e), hit: true });
    at = e;
  }
  if (end > at) parts.push({ text: text.slice(at, end), hit: false });
  return {
    parts: parts.map((p) => ({ ...p, text: p.text.replace(/\s+/gu, ' ') })).filter((p) => p.text !== ''),
    cutStart: start > 0,
    cutEnd: end < text.length,
  };
}
```

In `packages/core/src/index.ts`, add after `export * from './search/text';`:
```ts
export * from './search/snippet';
```

In `packages/db/src/search.ts`:
- add `import type { Library } from './library';` below the existing imports
- append:
```ts
export interface SearchResult extends SearchHit {
  /** An article's or memo's title; empty for markups and side notes. */
  title: string;
  /** The text the item is found by: article text, quoted passage, note body or memo text. */
  text: string;
  /** Title of the article the item belongs to (null for memos). */
  articleTitle: string | null;
}

type ShownRow = { id: string; title: string; text: string };

async function rowsById<T extends { id: string }>(
  driver: SqlDriver,
  sql: (inList: string) => string,
  ids: readonly string[],
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();
  const rows = await driver.query<T>(sql(ids.map(() => '?').join(', ')), [...ids]);
  return new Map(rows.map((r) => [r.id, r]));
}

/** `search`, plus what the results list shows for each hit. Hits whose item is gone are skipped. */
export async function searchLibrary(lib: Library, p: SearchParams): Promise<SearchResult[]> {
  const hits = await search(lib.driver, p);
  const idsOf = (type: EntityType) => hits.filter((h) => h.entityType === type).map((h) => h.entityId);
  const articleIds = [...new Set(hits.flatMap((h) => (h.articleId ? [h.articleId] : [])))];
  const [articles, markups, notes, memos, titles] = await Promise.all([
    rowsById<ShownRow>(
      lib.driver,
      (list) =>
        `SELECT a.id, a.title, r.text FROM article a JOIN article_revision r ON r.id = a.current_revision_id
         WHERE a.deleted = 0 AND a.id IN (${list})`,
      idsOf('article'),
    ),
    rowsById<ShownRow>(
      lib.driver,
      (list) =>
        `SELECT m.id, '' AS title, a.exact AS text FROM markup m JOIN anchor a ON a.id = m.anchor_id
         WHERE m.deleted = 0 AND m.id IN (${list})`,
      idsOf('markup'),
    ),
    rowsById<ShownRow>(
      lib.driver,
      (list) => `SELECT id, '' AS title, body AS text FROM side_note WHERE deleted = 0 AND id IN (${list})`,
      idsOf('side_note'),
    ),
    rowsById<ShownRow>(
      lib.driver,
      (list) =>
        `SELECT m.id, m.title, coalesce(c.text, '') AS text FROM memo m LEFT JOIN memo_cache c ON c.memo_id = m.id
         WHERE m.deleted = 0 AND m.id IN (${list})`,
      idsOf('memo'),
    ),
    rowsById<{ id: string; title: string }>(lib.driver, (list) => `SELECT id, title FROM article WHERE id IN (${list})`, articleIds),
  ]);
  const rowsOf: Record<EntityType, Map<string, ShownRow>> = { article: articles, markup: markups, side_note: notes, memo: memos };
  return hits.flatMap((h) => {
    const row = rowsOf[h.entityType].get(h.entityId);
    if (!row) return [];
    const articleTitle = h.articleId ? (titles.get(h.articleId)?.title ?? null) : null;
    return [{ ...h, title: row.title, text: row.text, articleTitle }];
  });
}
```

- [ ] **Step 3: Run the tests, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/core/src/search/snippet.test.ts packages/db/src/searchLibrary.test.ts && pnpm test && pnpm typecheck && pnpm lint'`
Expected: the 7 new tests pass, every other test passes, and there are no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core packages/db
git commit -m "feat(db): search results with display text, and snippets around matches"
```

---

### Task 2: The tag index, the tag tree and tag error messages

**Files:**
- Create:
  - `apps/client/src/tags/tree.ts` and `tree.test.ts`
  - `apps/client/src/tags/TagContext.tsx`
  - `apps/client/src/tags/errors.ts` and `errors.test.ts`
- Modify:
  - `packages/db/src/tags.ts` (`DuplicateTagNameError.tagName`)
  - `apps/client/src/components/Shell.tsx`
  - `apps/client/src/i18n/en.ts` and `zh-CN.ts` (a `tags` block)
- Test: `apps/client/src/tags/tree.test.ts`, `apps/client/src/tags/errors.test.ts`

**Interfaces:**
- Consumes: `listTags`, `listEdges`, `TagRow`, `TagEdgeRow`, `TagCycleError`, `DuplicateTagNameError` and `InvalidTagNameError` (plan 1).
- Produces:
  - `interface TagNode { tag: TagRow; parentId: string | null; key: string; depth: number; children: TagNode[] }`
  - `buildTagTree(tags, edges): TagNode[]`
    - A tag with several parents appears under each of them, and each occurrence has its own `key`.
    - Tags with no parent are roots.
    - A cycle that arrives from another device can neither hide its tags nor make the tree loop.
  - `TagProvider` and `useTagIndex(): { tags: TagRow[]; edges: TagEdgeRow[]; byId: ReadonlyMap<string, TagRow> }`, loaded once for the shell.
  - `tagErrorKey(error): { key: 'tags.cycle' | 'tags.duplicate' | 'tags.blank'; name?: string } | null`, and `useReportTagError(): (error: unknown) => void`.
  - The i18n `tags` block, used by Tasks 3–5.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/tags/tree.test.ts`:
```ts
import type { TagEdgeRow, TagRow } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { buildTagTree, type TagNode } from './tree';

const tag = (id: string, sort = id): TagRow => ({ id, name: id.toUpperCase(), color: null, sort_key: sort });
const edge = (parent: string, child: string): TagEdgeRow => ({ id: `e:${parent}:${child}`, parent_id: parent, child_id: child, hlc: '0' });
/** Each node as "depth:id", depth first. */
const flat = (nodes: TagNode[]): string[] => nodes.flatMap((n) => [`${n.depth}:${n.tag.id}`, ...flat(n.children)]);

describe('buildTagTree', () => {
  it('nests children under their parents, ordered by sort key', () => {
    expect(flat(buildTagTree([tag('b', 'a2'), tag('a', 'a1'), tag('c', 'a3')], [edge('a', 'c')]))).toEqual(['0:a', '1:c', '0:b']);
  });

  it('shows a tag with two parents under each, with distinct keys (Review Focus 4)', () => {
    const tree = buildTagTree([tag('a'), tag('b'), tag('c')], [edge('a', 'c'), edge('b', 'c')]);
    expect(flat(tree)).toEqual(['0:a', '1:c', '0:b', '1:c']);
    const [underA, underB] = [tree[0].children[0], tree[1].children[0]];
    expect(underA.key).not.toBe(underB.key);
    expect([underA.parentId, underB.parentId]).toEqual(['a', 'b']);
  });

  it('still shows tags caught in a cycle from another device, without looping', () => {
    expect(flat(buildTagTree([tag('a'), tag('b'), tag('r')], [edge('a', 'b'), edge('b', 'a')]))).toEqual(['0:r', '0:a', '1:b']);
  });

  it('ignores edges to tags that no longer exist', () => {
    expect(flat(buildTagTree([tag('c')], [edge('gone', 'c')]))).toEqual(['0:c']);
  });
});
```

`apps/client/src/tags/errors.test.ts`:
```ts
import { DuplicateTagNameError, InvalidTagNameError, TagCycleError } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { tagErrorKey } from './errors';

describe('tagErrorKey', () => {
  it('names the message that explains each tag error', () => {
    expect(tagErrorKey(new TagCycleError('x'))).toEqual({ key: 'tags.cycle' });
    expect(tagErrorKey(new DuplicateTagNameError('比喻'))).toEqual({ key: 'tags.duplicate', name: '比喻' });
    expect(tagErrorKey(new InvalidTagNameError())).toEqual({ key: 'tags.blank' });
  });

  it('leaves other errors alone', () => {
    expect(tagErrorKey(new Error('disk full'))).toBeNull();
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/tags`
Expected: FAIL with `Cannot find module './tree'` and `'./errors'`.

- [ ] **Step 2: Implement**

In `packages/db/src/tags.ts`, replace the `DuplicateTagNameError` class with:
```ts
export class DuplicateTagNameError extends Error {
  readonly tagName: string;

  constructor(tagName: string) {
    super(`A tag named "${tagName}" already exists`);
    this.name = 'DuplicateTagNameError';
    this.tagName = tagName;
  }
}
```

`apps/client/src/tags/tree.ts`:
```ts
import type { TagEdgeRow, TagRow } from '@jot/db';

export interface TagNode {
  tag: TagRow;
  /** The parent this occurrence sits under; null at the top level. */
  parentId: string | null;
  /** Unique per occurrence: a tag with two parents appears twice. */
  key: string;
  depth: number;
  children: TagNode[];
}

const bySortKey = (a: TagRow, b: TagRow) =>
  a.sort_key < b.sort_key ? -1 : a.sort_key > b.sort_key ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * The tag graph as a tree (spec §6.4): a tag with several parents appears under each of them, and tags
 * without a parent are at the top level. A cycle that arrived from another device (before it is
 * repaired) can neither hide its tags nor loop: a branch stops at a tag already on its path.
 */
export function buildTagTree(tags: readonly TagRow[], edges: readonly TagEdgeRow[]): TagNode[] {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const childrenOf = new Map<string, TagRow[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    const child = byId.get(e.child_id);
    if (!child || !byId.has(e.parent_id)) continue;
    hasParent.add(child.id);
    childrenOf.set(e.parent_id, [...(childrenOf.get(e.parent_id) ?? []), child]);
  }
  const seen = new Set<string>();
  const build = (tag: TagRow, parentId: string | null, depth: number, path: ReadonlySet<string>, prefix: string): TagNode => {
    seen.add(tag.id);
    const key = `${prefix}/${tag.id}`;
    const onPath = new Set(path).add(tag.id);
    const children = (childrenOf.get(tag.id) ?? [])
      .filter((c) => !onPath.has(c.id))
      .sort(bySortKey)
      .map((c) => build(c, tag.id, depth + 1, onPath, key));
    return { tag, parentId, key, depth, children };
  };
  const sorted = [...tags].sort(bySortKey);
  const roots = sorted.filter((t) => !hasParent.has(t.id)).map((t) => build(t, null, 0, new Set(), ''));
  // Tags reachable only through a cycle have parents but no root above them.
  for (const t of sorted) if (!seen.has(t.id)) roots.push(build(t, null, 0, new Set(), ''));
  return roots;
}
```

`apps/client/src/tags/TagContext.tsx`:
```tsx
import { listEdges, listTags, type TagEdgeRow, type TagRow } from '@jot/db';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLibraryQuery } from '../data/LibraryContext';

export interface TagIndex {
  /** Live tags, in creation order. */
  tags: TagRow[];
  edges: TagEdgeRow[];
  byId: ReadonlyMap<string, TagRow>;
}

const TagContext = createContext<TagIndex>({ tags: [], edges: [], byId: new Map() });

/** Loads the tags and their hierarchy once for the whole shell. */
export function TagProvider({ children }: { children: ReactNode }) {
  const tags = useLibraryQuery(listTags, [], ['tag']);
  const edges = useLibraryQuery(listEdges, [], ['tag_edge']);
  const value = useMemo<TagIndex>(() => {
    const list = tags.data ?? [];
    return { tags: list, edges: edges.data ?? [], byId: new Map(list.map((t) => [t.id, t])) };
  }, [tags.data, edges.data]);
  return <TagContext.Provider value={value}>{children}</TagContext.Provider>;
}

export function useTagIndex(): TagIndex {
  return useContext(TagContext);
}
```

`apps/client/src/tags/errors.ts`:
```ts
import { DuplicateTagNameError, InvalidTagNameError, TagCycleError } from '@jot/db';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';

export type TagErrorKey = 'tags.cycle' | 'tags.duplicate' | 'tags.blank';

/** The message (and its values) that explains a tag error, or null for other errors. */
export function tagErrorKey(error: unknown): { key: TagErrorKey; name?: string } | null {
  if (error instanceof TagCycleError) return { key: 'tags.cycle' };
  if (error instanceof DuplicateTagNameError) return { key: 'tags.duplicate', name: error.tagName };
  if (error instanceof InvalidTagNameError) return { key: 'tags.blank' };
  return null;
}

/** Reports a failed tag action, explaining tag errors in the interface language. */
export function useReportTagError(): (error: unknown) => void {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => {
      const known = tagErrorKey(error);
      reportError(known ? new Error(t(known.key, { name: known.name ?? '' })) : error);
    },
    [t],
  );
}
```

In `apps/client/src/components/Shell.tsx`:
- add `import { TagProvider } from '../tags/TagContext';`
- wrap the shell's contents: put `<TagProvider>` directly inside `<MemoProvider value={memoContext}>`, and `</TagProvider>` directly before `</MemoProvider>`.

In `apps/client/src/i18n/en.ts`, add this block after the `memo` block:
```ts
  tags: {
    heading: 'Tags',
    new: 'New tag',
    newPlaceholder: 'Tag name',
    empty: 'No tags yet.',
    add: 'Add tag',
    remove: 'Remove tag “{{name}}”',
    pick: 'Find or create a tag…',
    pickExisting: 'Find a tag…',
    create: 'Create “{{name}}”',
    noMatches: 'No matching tags',
    menu: 'Tag actions',
    rename: 'Rename',
    renameLabel: 'New name for “{{name}}”',
    addParent: 'Add parent…',
    removeFrom: 'Take out of “{{name}}”',
    delete: 'Delete',
    confirmDelete: 'Delete the tag “{{name}}”? It is removed from every item; its subtags stay.',
    expand: 'Expand',
    collapse: 'Collapse',
    topLevel: 'Drop a tag here to take it out of its parent. Drag onto a tag to move it there; hold Alt to add a second parent.',
    cycle: 'A tag can’t go under itself or one of its own subtags.',
    duplicate: 'A tag named “{{name}}” already exists.',
    blank: 'A tag needs a name.',
  },
```

In `apps/client/src/i18n/zh-CN.ts`, add after the `memo` block:
```ts
  tags: {
    heading: '标签',
    new: '新建标签',
    newPlaceholder: '标签名',
    empty: '还没有标签。',
    add: '添加标签',
    remove: '移除标签“{{name}}”',
    pick: '查找或新建标签…',
    pickExisting: '查找标签…',
    create: '新建“{{name}}”',
    noMatches: '没有匹配的标签',
    menu: '标签操作',
    rename: '重命名',
    renameLabel: '“{{name}}”的新名字',
    addParent: '添加上级…',
    removeFrom: '移出“{{name}}”',
    delete: '删除',
    confirmDelete: '删除标签“{{name}}”？所有条目上的这个标签都会移除，下级标签保留。',
    expand: '展开',
    collapse: '收起',
    topLevel: '把标签拖到这里即移出其上级。拖到另一个标签上即移到其下；按住 Alt 拖动则添加第二个上级。',
    cycle: '标签不能放到自己或自己的下级标签之下。',
    duplicate: '已有名为“{{name}}”的标签。',
    blank: '标签需要一个名字。',
  },
```

- [ ] **Step 3: Run the tests, then the whole suite and the shell end-to-end test**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/tags && pnpm test && pnpm typecheck && pnpm lint'`
Expected: the 6 new tests pass, every other test passes, and there are no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e shell memo`
Expected: all pass. The provider changes nothing visible yet.

- [ ] **Step 4: Commit**

```bash
git add packages/db apps/client
git commit -m "feat(client): shared tag index, tag tree builder and tag error messages"
```

---

### Task 3: Tagging every item: articles, markups, side notes and memos

**Files:**
- Create:
  - `apps/client/src/tags/match.ts` and `match.test.ts`
  - `apps/client/src/components/TagPicker.tsx` and `TagChips.tsx`
  - `packages/db/src/taggings.test.ts`
  - `apps/client/e2e/tags.spec.ts`
- Modify:
  - `packages/db/src/tags.ts` (`listArticleTaggings`)
  - `apps/client/src/components/ArticlePane.tsx`, `MarkupPopover.tsx`, `Margin.tsx` and `MemoPane.tsx`
  - `apps/client/src/styles/app.css`
  - `apps/client/e2e/helpers.ts` (`addTag`)
- Test: `apps/client/src/tags/match.test.ts`, `packages/db/src/taggings.test.ts`, `apps/client/e2e/tags.spec.ts`

**Interfaces:**
- Consumes:
  - from plan 1: `createTag`, `tagEntity`, `untagEntity`, `tagsOf` and `TaggingTarget`;
  - from Task 2: `useTagIndex` and `useReportTagError`.
- Produces:
  - `interface TaggingRef { entityType: EntityType; entityId: string; tagId: string }`
  - `listArticleTaggings(lib, articleId): Promise<TaggingRef[]>`: live taggings of the article itself and of its markups and side notes.
  - `matchTags(tags, query, exclude?): { matches: TagRow[]; exact: TagRow | null; canCreate: boolean }`
  - `<TagPicker exclude? allowCreate? onPick onCreate? onClose />`, with test IDs `tag-input`, `tag-option`, `tag-create` and `tag-no-matches`.
  - `type TagTarget = Omit<TaggingTarget, 'tagId'>`
  - `<TagChips target tagIds testId className? />`
    - Test IDs: `tag-chip` (the tag's name), `tag-chip-remove`, and `tag-add` (the `#` button).
    - Chip areas: `article-tags`, `markup-tags`, `note-tags` and `memo-tags`.
  - The e2e helper `addTag(page, area, name)`.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/tags/match.test.ts`:
```ts
import type { TagRow } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { matchTags } from './match';

const tag = (id: string, name: string, sort: string): TagRow => ({ id, name, color: null, sort_key: sort });
const tags = [tag('1', 'Craft', 'a1'), tag('2', '手法', 'a2'), tag('3', 'Aircraft', 'a3'), tag('4', 'crafting', 'a4')];
const names = (list: TagRow[]) => list.map((t) => t.name);

describe('matchTags', () => {
  it('lists names starting with the query before names containing it', () => {
    expect(names(matchTags(tags, 'craft').matches)).toEqual(['Craft', 'crafting', 'Aircraft']);
  });

  it('finds the existing tag for a name that differs only by case, width or spacing (Review Focus 3)', () => {
    for (const query of ['CRAFT', 'ＣＲＡＦＴ', '  craft ']) {
      const found = matchTags(tags, query);
      expect(found.exact?.id).toBe('1');
      expect(found.canCreate).toBe(false);
    }
    expect(matchTags(tags, '比喻')).toMatchObject({ exact: null, canCreate: true, matches: [] });
  });

  it('offers nothing to create for a blank query', () => {
    expect(matchTags(tags, '  ')).toMatchObject({ exact: null, canCreate: false });
    expect(matchTags(tags, '').matches).toHaveLength(4);
  });

  it('leaves out excluded tags but still reports an exact match among them', () => {
    const found = matchTags(tags, 'craft', new Set(['1']));
    expect(names(found.matches)).toEqual(['crafting', 'Aircraft']);
    expect(found.exact?.id).toBe('1');
    expect(found.canCreate).toBe(false);
  });
});
```

`packages/db/src/taggings.test.ts`:
```ts
import { captureAnchor } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, getArticle } from './articles';
import { Library } from './library';
import { createMarkup } from './markups';
import { createMemo } from './memos';
import { createTag, listArticleTaggings, tagEntity, untagEntity } from './tags';

describe('listArticleTaggings', () => {
  it('lists live taggings of an article and of the items in it, but not of memos or other articles', async () => {
    let t = 1000;
    const lib = await Library.open(createNodeDriver(), { now: () => t++ });
    const blocks = [{ k: 'p' as const, runs: [{ t: '他用比喻写春天。' }] }];
    const a = await createArticle(lib, { title: 'A', importKind: 'paste', blocks });
    const b = await createArticle(lib, { title: 'B', importKind: 'paste', blocks });
    const text = (await getArticle(lib, a.articleId))!.text;
    const { markupId } = await createMarkup(lib, {
      articleId: a.articleId,
      revisionId: a.revisionId,
      anchor: captureAnchor(text, 2, 4),
      style: 'bold',
    });
    const memoId = await createMemo(lib, { title: 'M', homeArticleId: a.articleId });
    const x = await createTag(lib, { name: 'x' });
    const y = await createTag(lib, { name: 'y' });
    await tagEntity(lib, { tagId: x, entityType: 'article', entityId: a.articleId, articleId: a.articleId });
    await tagEntity(lib, { tagId: y, entityType: 'markup', entityId: markupId, articleId: a.articleId });
    await tagEntity(lib, { tagId: x, entityType: 'markup', entityId: markupId, articleId: a.articleId });
    await untagEntity(lib, { tagId: x, entityType: 'markup', entityId: markupId, articleId: a.articleId });
    await tagEntity(lib, { tagId: x, entityType: 'memo', entityId: memoId, articleId: null });
    await tagEntity(lib, { tagId: y, entityType: 'article', entityId: b.articleId, articleId: b.articleId });
    expect(await listArticleTaggings(lib, a.articleId)).toEqual([
      { entityType: 'article', entityId: a.articleId, tagId: x },
      { entityType: 'markup', entityId: markupId, tagId: y },
    ]);
  });
});
```

Append to `apps/client/e2e/helpers.ts`:
```ts
/** Adds a tag (picking an existing one, or creating it) to the item whose tag chips have the test id `area`. */
export async function addTag(page: Page, area: string, name: string): Promise<void> {
  await page.getByTestId(area).getByTestId('tag-add').click();
  await page.getByTestId('tag-input').fill(name);
  await page.getByTestId('tag-input').press('Enter');
}
```

`apps/client/e2e/tags.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

const chipsIn = (page: Page, area: string) => page.getByTestId(area).getByTestId('tag-chip');

async function setup(page: Page, memory = true) {
  await openApp(page, { memory });
  await importText(page, '标签', '春风又绿江南岸。他用比喻写春天。');
}

test('tags an article, a highlight, a side note and a memo', async ({ page }) => {
  await setup(page);
  await addTag(page, 'article-tags', '写景');
  await expect(chipsIn(page, 'article-tags')).toHaveText(['写景']);

  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await page.locator('.mk-highlight').click();
  await addTag(page, 'markup-tags', '修辞');
  await expect(chipsIn(page, 'markup-tags')).toHaveText(['修辞']);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('markup-popover')).toHaveCount(0);

  await selectText(page, '春风');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await addTag(page, 'note-tags', '写景');
  await expect(chipsIn(page, 'note-tags')).toHaveText(['写景']);

  await page.getByTestId('memo-new').click();
  await addTag(page, 'memo-tags', '结构');
  await expect(chipsIn(page, 'memo-tags')).toHaveText(['结构']);
  await expect(page.getByTestId('error-banner')).toHaveCount(0);
});

test('reuses a tag whose name differs only by case or width (Review Focus 3)', async ({ page }) => {
  await setup(page);
  await addTag(page, 'article-tags', 'Craft');
  await expect(chipsIn(page, 'article-tags')).toHaveText(['Craft']);
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-tags').getByTestId('tag-add').click();
  await page.getByTestId('tag-input').fill('ＣＲＡＦＴ');
  await expect(page.getByTestId('tag-create')).toHaveCount(0);
  await page.getByTestId('tag-input').press('Enter');
  await expect(chipsIn(page, 'memo-tags')).toHaveText(['Craft']);
  await expect(page.getByTestId('error-banner')).toHaveCount(0);
});

test('removes a tag from an item', async ({ page }) => {
  await setup(page);
  await addTag(page, 'article-tags', '写景');
  await addTag(page, 'article-tags', '抒情');
  await expect(chipsIn(page, 'article-tags')).toHaveText(['写景', '抒情']);
  await page.getByRole('button', { name: 'Remove tag “写景”' }).click();
  await expect(chipsIn(page, 'article-tags')).toHaveText(['抒情']);
});

test('Escape closes the tag picker but keeps the markup menu open', async ({ page }) => {
  await setup(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await page.locator('.mk-highlight').click();
  await page.getByTestId('markup-tags').getByTestId('tag-add').click();
  await page.getByTestId('tag-input').press('Escape');
  await expect(page.getByTestId('tag-input')).toHaveCount(0);
  await expect(page.getByTestId('markup-popover')).toBeVisible();
});

test('keeps tags after a reload', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await addTag(page, 'article-tags', '写景');
  await expect(chipsIn(page, 'article-tags')).toHaveText(['写景']);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(chipsIn(page, 'article-tags')).toHaveText(['写景'], { timeout: 30_000 });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/tags/match.test.ts packages/db/src/taggings.test.ts`
Expected: FAIL with `Cannot find module './match'`, and `listArticleTaggings is not a function` (or "does not provide an export named").

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tags --project chromium --timeout 15000`
Expected: FAIL: there is no `article-tags` area.

- [ ] **Step 3: Implement the query, the matching and the two components**

In `packages/db/src/tags.ts`, append:
```ts
export interface TaggingRef {
  entityType: EntityType;
  entityId: string;
  tagId: string;
}

/** Live taggings of an article and of the markups and side notes in it (memos are not inside an article). */
export function listArticleTaggings(lib: Library, articleId: string): Promise<TaggingRef[]> {
  return lib.driver.query<TaggingRef>(
    `SELECT entity_type AS entityType, entity_id AS entityId, tag_id AS tagId FROM tagging
     WHERE deleted = 0 AND article_id = ? AND entity_type <> 'memo' ORDER BY created_at, id`,
    [articleId],
  );
}
```

`apps/client/src/tags/match.ts`:
```ts
import { foldTagName } from '@jot/core';
import type { TagRow } from '@jot/db';

/** How many tags the picker lists at most. */
export const MAX_MATCHES = 8;

export interface TagMatches {
  /** Tags whose name contains the query; names starting with it come first. */
  matches: TagRow[];
  /** The tag whose name is the query, ignoring case, width and spacing (even when excluded). */
  exact: TagRow | null;
  /** Whether a new tag named after the query may be created. */
  canCreate: boolean;
}

/** Tags for a picker's text, compared the way tag names are kept unique (`foldTagName`). */
export function matchTags(tags: readonly TagRow[], query: string, exclude: ReadonlySet<string> = new Set()): TagMatches {
  const q = foldTagName(query);
  const pool = tags.filter((t) => !exclude.has(t.id));
  if (!q) return { matches: pool.slice(0, MAX_MATCHES), exact: null, canCreate: false };
  const exact = tags.find((t) => foldTagName(t.name) === q) ?? null;
  const found = pool
    .map((tag) => ({ tag, folded: foldTagName(tag.name) }))
    .filter((x) => x.folded.includes(q))
    .sort((a, b) => Number(!a.folded.startsWith(q)) - Number(!b.folded.startsWith(q)));
  return { matches: found.slice(0, MAX_MATCHES).map((x) => x.tag), exact, canCreate: exact === null };
}
```

`apps/client/src/components/TagPicker.tsx`:
```tsx
import type { TagRow } from '@jot/db';
import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { matchTags } from '../tags/match';
import { useTagIndex } from '../tags/TagContext';

interface Props {
  /** Tags not to offer: already applied, or not allowed here. */
  exclude?: ReadonlySet<string>;
  /** Offer to create a tag named after the text when no tag has that name. */
  allowCreate?: boolean;
  onPick(tag: TagRow): void;
  onCreate?(name: string): void;
  onClose(): void;
}

type Option = { kind: 'tag'; tag: TagRow } | { kind: 'create'; name: string };

/**
 * A search-as-you-type tag chooser. Enter takes the highlighted option: by default the tag whose name
 * matches the text ignoring case and width, so "ＣＲＡＦＴ" picks "Craft" rather than making a duplicate.
 * Escape, or leaving the field, closes it.
 */
export function TagPicker({ exclude, allowCreate = false, onPick, onCreate, onClose }: Props) {
  const { t } = useTranslation();
  const { tags } = useTagIndex();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<number | null>(null);
  const { matches, exact, canCreate } = matchTags(tags, query, exclude);
  const name = query.trim();
  const options: Option[] = matches.map((tag) => ({ kind: 'tag', tag }));
  if (allowCreate && canCreate && name) options.push({ kind: 'create', name });
  // With an exact match the default is that tag; if it is excluded (already applied) there is nothing to do.
  const fallback = exact ? options.findIndex((o) => o.kind === 'tag' && o.tag.id === exact.id) : 0;
  const active = chosen ?? fallback;
  const label = allowCreate ? t('tags.pick') : t('tags.pickExisting');

  const choose = (option: Option) => {
    if (option.kind === 'tag') onPick(option.tag);
    else onCreate?.(option.name);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // Enter confirms the input method's text, not a tag
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = options.length;
      if (n === 0) return;
      const down = e.key === 'ArrowDown';
      const from = active < 0 ? (down ? -1 : 0) : active;
      setChosen((from + (down ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = options[active];
      if (option) choose(option);
      else onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // close the picker only, not the menu around it
      onClose();
    }
  };

  return (
    <div className="tag-picker">
      <input
        autoFocus
        value={query}
        placeholder={label}
        aria-label={label}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setChosen(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={onClose}
        data-testid="tag-input"
      />
      <ul id={listId} role="listbox" className="tag-options">
        {options.map((option, i) => (
          <li
            key={option.kind === 'tag' ? option.tag.id : 'create'}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(option)}
            data-testid={option.kind === 'tag' ? 'tag-option' : 'tag-create'}
          >
            {option.kind === 'tag' ? option.tag.name : t('tags.create', { name: option.name })}
          </li>
        ))}
        {options.length === 0 && (
          <li className="muted" data-testid="tag-no-matches">
            {t('tags.noMatches')}
          </li>
        )}
      </ul>
    </div>
  );
}
```

`apps/client/src/components/TagChips.tsx`:
```tsx
import { createTag, tagEntity, untagEntity, type TaggingTarget } from '@jot/db';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibrary } from '../data/LibraryContext';
import { useReportTagError } from '../tags/errors';
import { useTagIndex } from '../tags/TagContext';
import { TagPicker } from './TagPicker';

/** The item being tagged. */
export type TagTarget = Omit<TaggingTarget, 'tagId'>;

interface Props {
  target: TagTarget;
  tagIds: readonly string[];
  testId: string;
  className?: string;
}

/** An item's tags as chips: × removes one, # adds an existing or new tag. */
export function TagChips({ target, tagIds, testId, className }: Props) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const report = useReportTagError();
  const { tags } = useTagIndex();
  const [adding, setAdding] = useState(false);
  const applied = new Set(tagIds);
  const shown = tags.filter((tag) => applied.has(tag.id));

  const add = (tagId: string) => tagEntity(lib, { ...target, tagId });
  const create = async (name: string) => add(await createTag(lib, { name }));

  return (
    <div className={className ? `tag-chips ${className}` : 'tag-chips'} data-testid={testId}>
      {shown.map((tag) => (
        <span key={tag.id} className="tag-chip">
          <span data-testid="tag-chip">{tag.name}</span>
          <button
            type="button"
            className="tag-chip-remove"
            aria-label={t('tags.remove', { name: tag.name })}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => untagEntity(lib, { ...target, tagId: tag.id }).catch(report)}
            data-testid="tag-chip-remove"
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <TagPicker
          allowCreate
          exclude={applied}
          onPick={(tag) => add(tag.id).catch(report)}
          onCreate={(name) => create(name).catch(report)}
          onClose={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          className="tag-add"
          aria-label={t('tags.add')}
          title={t('tags.add')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setAdding(true)}
          data-testid="tag-add"
        >
          #
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Put tag chips on every taggable item**

In `apps/client/src/components/ArticlePane.tsx`:
1. Change `import { captureAnchor } from '@jot/core';` to `import { captureAnchor, type EntityType } from '@jot/core';`.
2. In the `@jot/db` import, add `listArticleTaggings,` after `getArticle,`.
3. Add `import { TagChips } from './TagChips';` after the `./SelectionToolbar` import.
4. Below the `const citations = useMemo(…)` line, add:
```tsx
  const taggings = useLibraryQuery((l) => listArticleTaggings(l, articleId), [articleId], ['tagging']);
```
5. Directly after the line `if (!a) return <p className="empty">{t('article.missing')}</p>;`, add:
```tsx
  const tagIdsOf = (entityType: EntityType, entityId: string) =>
    (taggings.data ?? []).filter((x) => x.entityType === entityType && x.entityId === entityId).map((x) => x.tagId);
```
6. After `{a.author && <p className="byline">{a.author}</p>}`, add:
```tsx
        <TagChips
          className="article-tags"
          target={{ entityType: 'article', entityId: articleId, articleId }}
          tagIds={tagIdsOf('article', articleId)}
          testId="article-tags"
        />
```
7. In the `<Margin … />` element, add the props `articleId={articleId}` and `tagsOf={(noteId) => tagIdsOf('side_note', noteId)}`.
8. In the `<MarkupPopover … />` element, add the props `articleId={articleId}` and `tagsOf={(markupId) => tagIdsOf('markup', markupId)}`.

In `apps/client/src/components/MarkupPopover.tsx`:
1. Add `import { TagChips } from './TagChips';` after the `../article/excerpt` import.
2. In `interface Props`, add `articleId: string;` and `tagsOf(markupId: string): string[];`.
3. Add `articleId, tagsOf` to the destructured props.
4. Inside each markup's `<li>`, directly after its `<div className="actions">…</div>`, add:
```tsx
              <TagChips target={{ entityType: 'markup', entityId: m.id, articleId }} tagIds={tagsOf(m.id)} testId="markup-tags" />
```

In `apps/client/src/components/Margin.tsx`:
1. Add `import { TagChips } from './TagChips';` after the `./ArticleView` import.
2. In `interface MarginProps`, add `articleId: string;` and `tagsOf(noteId: string): string[];`. Add `articleId, tagsOf` to `Margin`'s destructured props.
3. In the `<NoteCard … />` element, add `articleId={articleId}` and `tagIds={tagsOf(note.id)}`.
4. In `interface NoteCardProps`, add `articleId: string;` and `tagIds: string[];`. Add `articleId, tagIds` to `NoteCard`'s destructured props.
5. In `NoteCard`, directly after `const savedRef = useRef(note.body);`, add:
```tsx
  const cardRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef(onResize);
  resizeRef.current = onResize;
  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === 'undefined') return;
    // Adding or removing a tag changes the card's height, and the cards below it must move.
    const observer = new ResizeObserver(() => resizeRef.current());
    observer.observe(card);
    return () => observer.disconnect();
  }, []);
```
6. Change the card's `ref={register}` to:
```tsx
      ref={(el) => {
        cardRef.current = el;
        register(el);
      }}
```
7. Between the self-closing `<textarea … />` element and `<footer>`, add:
```tsx
      <TagChips target={{ entityType: 'side_note', entityId: note.id, articleId }} tagIds={tagIds} testId="note-tags" />
```

In `apps/client/src/components/MemoPane.tsx`:
1. Add `tagsOf` to the `@jot/db` import, and `import { TagChips } from './TagChips';` after the other imports.
2. After `<MemoTitle memo={active} />`, add `<MemoTags memoId={active.id} />`.
3. Append:
```tsx
function MemoTags({ memoId }: { memoId: string }) {
  const tags = useLibraryQuery((l) => tagsOf(l, 'memo', memoId), [memoId], ['tagging']);
  return <TagChips target={{ entityType: 'memo', entityId: memoId, articleId: null }} tagIds={tags.data ?? []} testId="memo-tags" />;
}
```

Append to `apps/client/src/styles/app.css`:
```css
/* Tags */
.tag-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.tag-chip { display: inline-flex; align-items: center; padding: 0 0 0 8px; font-size: 12px; line-height: 20px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); }
.tag-chip::before { content: '#'; color: var(--muted); margin-right: 1px; }
.tag-chip-remove { border: none; background: none; padding: 0 6px 0 4px; font-size: 12px; line-height: 20px; color: var(--muted); }
.tag-add { border: 1px dashed var(--line); border-radius: 999px; background: none; padding: 0 8px; font-size: 12px; line-height: 20px; color: var(--muted); }
.tag-picker { position: relative; }
.tag-picker input { font: inherit; font-size: 13px; width: 11em; padding: 2px 6px; border: 1px solid var(--accent); border-radius: 6px; background: var(--bg); color: var(--text); outline: none; }
.tag-options { position: absolute; z-index: 20; left: 0; top: 100%; min-width: 11em; max-height: 220px; overflow: auto; margin: 2px 0 0; padding: 4px; list-style: none; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); font-size: 13px; }
.tag-options li { padding: 3px 6px; border-radius: 4px; cursor: pointer; }
.tag-options li.active { background: var(--panel); color: var(--accent); }
.article-tags { margin: 0 0 16px; }
.note .tag-chips { margin: 2px 0; }
```

- [ ] **Step 5: Run the unit tests, then the tags end-to-end tests on both browsers plus regressions**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes (5 new ones), with no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tags notes popover memo`
Expected:
- tags: chromium 5 passed; webkit 4 passed and 1 skipped.
- notes, popover and memo: unchanged. The margin re-lays out taller note cards, so "stacks notes on the same line without overlapping" still passes.

- [ ] **Step 6: Commit**

```bash
git add packages/db apps/client
git commit -m "feat(client): tag articles, markups, side notes and memos with a search-as-you-type picker"
```

---

### Task 4: Searching from the sidebar

**Files:**
- Create: `apps/client/src/components/SearchPanel.tsx`, `apps/client/e2e/search.spec.ts`
- Modify:
  - `apps/client/src/components/Sidebar.tsx` (replace)
  - `apps/client/src/i18n/en.ts` and `zh-CN.ts` (a `search` block)
  - `apps/client/src/styles/app.css`
- Test: `apps/client/e2e/search.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `searchLibrary`, `SearchResult` and `makeSnippet`;
  - from core: `findHighlights`;
  - from Task 2: `useTagIndex`;
  - from Task 3: `TagPicker`;
  - from plan 3: `useMemoContext().follow` and `bridge.showMemo`.
- Produces:
  - `interface SearchState { draft; query; types: EntityType[]; tagIds: string[]; inherit: boolean }`, plus `EMPTY_SEARCH` and `isSearching(state)`.
  - `<SearchBox state onChange />`, with test ID `search-input`. Text that an input method is still composing goes into `draft` but not into `query`.
  - `<SearchPanel state onChange />`, with these test IDs:
    - `search-panel`, `search-type-<type>`, `search-tag`, `search-add-tag`, `search-inherit`, `search-clear` and `search-empty`;
    - `search-result`, which carries a `data-entity-type` attribute.
  - Clicking a result:
    - an article opens it;
    - a markup or side note jumps to it (the plan-3 follow, with the flash and the missing-target message);
    - a memo opens it in the memo column.
  - `Sidebar` keeps the search state. Task 5 adds the tag tree to it.

- [ ] **Step 1: Write the failing end-to-end tests**

`apps/client/e2e/search.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

const results = (page: Page) => page.getByTestId('search-result');

/** An article with a highlight on 比喻 and a side note (on 春风) that mentions 比喻. */
async function setup(page: Page) {
  await openApp(page);
  await importText(page, '春日', '春风又绿江南岸。他用比喻写春天，比喻很生动。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await selectText(page, '春风');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('这个比喻很妙');
}

test('finds articles, markups and side notes by 1- and 2-character Chinese queries, marking the match', async ({ page }) => {
  await setup(page);
  await page.getByTestId('search-input').fill('比喻');
  await expect(results(page)).toHaveCount(3);
  await expect(page.getByTestId('search-panel').locator('mark').first()).toHaveText('比喻');
  await page.getByTestId('search-input').fill('喻');
  await expect(results(page)).toHaveCount(3);
  await expect(page.getByTestId('search-panel').locator('mark').first()).toHaveText('喻');
});

test('filters by item type, and a markup result jumps to the passage', async ({ page }) => {
  await setup(page);
  await page.getByTestId('search-input').fill('比喻');
  await page.getByTestId('search-type-side_note').click();
  await expect(results(page)).toHaveCount(1);
  await expect(results(page)).toHaveAttribute('data-entity-type', 'side_note');
  await page.getByTestId('search-type-side_note').click();
  await page.getByTestId('search-type-markup').click();
  await expect(results(page)).toHaveCount(1);
  await results(page).click();
  await expect(page.locator('.flash')).toHaveText('比喻');
});

test('narrows by tag, and the inherit toggle adds items inside tagged articles (spec §10 step 4)', async ({ page }) => {
  await setup(page);
  await addTag(page, 'article-tags', '写景');
  await page.getByTestId('search-input').fill('比喻');
  await page.getByTestId('search-add-tag').click();
  await page.getByTestId('tag-input').fill('写景');
  await page.getByTestId('tag-input').press('Enter');
  await expect(page.getByTestId('search-tag')).toHaveText(['写景']);
  await expect(results(page)).toHaveCount(1);
  await expect(results(page)).toHaveAttribute('data-entity-type', 'article');
  await page.getByTestId('search-inherit').check();
  await expect(results(page)).toHaveCount(3);
});

test('opens a memo from its search result', async ({ page }) => {
  await setup(page);
  await page.getByTestId('memo-new').click();
  await page.getByTestId('memo-editor').click();
  await page.keyboard.insertText('比喻的用法');
  await page.getByTestId('memo-new').click();
  await expect(page.getByTestId('memo-tab')).toHaveCount(2);
  await page.getByTestId('search-input').fill('用法');
  await expect(results(page)).toHaveCount(1);
  await results(page).click();
  await expect(page.locator('.memo-tab.active')).toContainText('Memo 1');
});

test('treats search syntax as plain text and ignores blank queries (Review Focus 1)', async ({ page }) => {
  await setup(page);
  await page.getByTestId('search-input').fill('") OR * NEAR(');
  await expect(page.getByTestId('search-empty')).toBeVisible();
  await page.getByTestId('search-input').fill('"比喻"');
  await expect(results(page)).toHaveCount(3);
  await page.getByTestId('search-input').fill('   ');
  await expect(page.getByTestId('library-list')).toBeVisible();
  await expect(page.getByTestId('error-banner')).toHaveCount(0);
});

test('results follow deletions (Review Focus 5)', async ({ page }) => {
  await setup(page);
  await page.getByTestId('search-input').fill('比喻');
  await expect(results(page)).toHaveCount(3);
  await page.locator('.mk-highlight', { hasText: '比喻' }).click();
  await page.getByTestId('popover-remove').click();
  await expect(results(page)).toHaveCount(2);
  await expect(page.locator('[data-testid="search-result"][data-entity-type="markup"]')).toHaveCount(0);
});

test('does not search input-method text that is still being composed (Review Focus 2)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'input-method composition is driven through the Chrome DevTools Protocol');
  await setup(page);
  await page.getByTestId('search-input').click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'bi', selectionStart: 2, selectionEnd: 2 });
  await expect(page.getByTestId('search-input')).toHaveValue('bi');
  await expect(page.getByTestId('library-list')).toBeVisible();
  await cdp.send('Input.insertText', { text: '比' });
  await expect(page.getByTestId('search-input')).toHaveValue('比');
  await expect(results(page)).toHaveCount(3);
});
```

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e search --project chromium --timeout 15000`
Expected: FAIL: there is no `search-input`.

- [ ] **Step 2: Implement the search box and panel**

`apps/client/src/components/SearchPanel.tsx`:
```tsx
import { ENTITY_TYPES, findHighlights, makeSnippet, type EntityType, type SyncedTable } from '@jot/core';
import { searchLibrary, type SearchResult } from '@jot/db';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { navigate } from '../router';
import { useTagIndex } from '../tags/TagContext';
import { TagPicker } from './TagPicker';

export interface SearchState {
  /** What the search box shows, including text an input method is still composing. */
  draft: string;
  /** What is searched for. */
  query: string;
  types: EntityType[];
  tagIds: string[];
  /** Also match items inside articles that carry the tags (spec §6.3; off by default). */
  inherit: boolean;
}

export const EMPTY_SEARCH: SearchState = { draft: '', query: '', types: [], tagIds: [], inherit: false };

/** A search runs while there is a query (not just spaces) or a tag filter. */
export function isSearching(state: SearchState): boolean {
  return state.query.trim() !== '' || state.tagIds.length > 0;
}

/** A commit to any of these can change what a search finds or shows. */
const SEARCH_TABLES: SyncedTable[] = [
  'article',
  'article_revision',
  'anchor',
  'markup',
  'side_note',
  'memo',
  'memo_update',
  'tag',
  'tag_edge',
  'tagging',
];

interface Props {
  state: SearchState;
  onChange(next: SearchState): void;
}

/** The sidebar's search field. Text an input method is still composing is shown but not searched yet. */
export function SearchBox({ state, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <input
      type="search"
      className="search-input"
      value={state.draft}
      placeholder={t('search.placeholder')}
      aria-label={t('search.placeholder')}
      onChange={(e) => {
        const composing = (e.nativeEvent as InputEvent).isComposing === true;
        onChange({ ...state, draft: e.target.value, query: composing ? state.query : e.target.value });
      }}
      onCompositionEnd={(e) => onChange({ ...state, draft: e.currentTarget.value, query: e.currentTarget.value })}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) onChange(EMPTY_SEARCH);
      }}
      data-testid="search-input"
    />
  );
}

/** `text` with the query's matches marked; a finite `radius` cuts a snippet around the first match. */
function Highlighted({ text, query, radius = Infinity }: { text: string; query: string; radius?: number }) {
  const snippet = makeSnippet(text, findHighlights(text, query), radius);
  return (
    <>
      {snippet.cutStart && '…'}
      {snippet.parts.map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
      {snippet.cutEnd && '…'}
    </>
  );
}

/** Filters and results, shown in place of the library list while searching (spec §6.3). */
export function SearchPanel({ state, onChange }: Props) {
  const { t } = useTranslation();
  const { byId } = useTagIndex();
  const { bridge, follow } = useMemoContext();
  const [pickingTag, setPickingTag] = useState(false);
  const results = useLibraryQuery(
    (l) => searchLibrary(l, { text: state.query, types: state.types, tagIds: state.tagIds, inherit: state.inherit, limit: 50 }),
    [state.query, state.types.join('|'), state.tagIds.join('|'), state.inherit],
    SEARCH_TABLES,
  );

  const toggleType = (type: EntityType) =>
    onChange({ ...state, types: state.types.includes(type) ? state.types.filter((x) => x !== type) : [...state.types, type] });

  const open = (r: SearchResult) => {
    if (r.entityType === 'article') navigate({ name: 'article', id: r.entityId });
    else if (r.entityType === 'memo') bridge.showMemo(r.entityId);
    else if (r.articleId) follow({ targetType: r.entityType, targetId: r.entityId, articleId: r.articleId, label: '' });
  };

  return (
    <section className="search-panel" data-testid="search-panel">
      <div className="search-types" role="group" aria-label={t('search.types')}>
        {ENTITY_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={state.types.includes(type)}
            onClick={() => toggleType(type)}
            data-testid={`search-type-${type}`}
          >
            {t(`search.type.${type}`)}
          </button>
        ))}
      </div>
      <div className="search-tags">
        {state.tagIds.map((id) => {
          const name = byId.get(id)?.name ?? '…';
          return (
            <span key={id} className="tag-chip">
              <span data-testid="search-tag">{name}</span>
              <button
                type="button"
                className="tag-chip-remove"
                aria-label={t('tags.remove', { name })}
                onClick={() => onChange({ ...state, tagIds: state.tagIds.filter((x) => x !== id) })}
              >
                ×
              </button>
            </span>
          );
        })}
        {pickingTag ? (
          <TagPicker
            exclude={new Set(state.tagIds)}
            onPick={(tag) => onChange({ ...state, tagIds: [...state.tagIds, tag.id] })}
            onClose={() => setPickingTag(false)}
          />
        ) : (
          <button type="button" className="tag-add" onClick={() => setPickingTag(true)} data-testid="search-add-tag">
            {t('search.addTag')}
          </button>
        )}
      </div>
      {state.tagIds.length > 0 && (
        <label className="search-inherit">
          <input
            type="checkbox"
            checked={state.inherit}
            onChange={(e) => onChange({ ...state, inherit: e.target.checked })}
            data-testid="search-inherit"
          />
          {t('search.inherit')}
        </label>
      )}
      <button type="button" className="quiet" onClick={() => onChange(EMPTY_SEARCH)} data-testid="search-clear">
        {t('search.clear')}
      </button>
      {results.error && (
        <p className="error" role="alert">
          {t('app.error')} {results.error.message}
        </p>
      )}
      {results.data?.length === 0 && (
        <p className="muted" data-testid="search-empty">
          {t('search.none')}
        </p>
      )}
      <ul className="search-results">
        {results.data?.map((r) => (
          <li key={`${r.entityType}:${r.entityId}`}>
            <button
              type="button"
              className="search-result"
              onClick={() => open(r)}
              data-testid="search-result"
              data-entity-type={r.entityType}
            >
              <span className="search-result-type">{t(`search.kind.${r.entityType}`)}</span>
              <span className="search-result-title">
                <Highlighted text={r.entityType === 'article' || r.entityType === 'memo' ? r.title : (r.articleTitle ?? '')} query={state.query} />
              </span>
              {r.text && (
                <span className="search-snippet">
                  <Highlighted text={r.text} query={state.query} radius={40} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Replace `apps/client/src/components/Sidebar.tsx` with:
```tsx
import { deleteArticle, listArticles, type ArticleSummary } from '@jot/db';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { LANGUAGES, setLanguage, type Language } from '../i18n';
import { navigate, routeHash } from '../router';
import { EMPTY_SEARCH, isSearching, SearchBox, SearchPanel, type SearchState } from './SearchPanel';

const LANGUAGE_NAMES: Record<Language, string> = { 'zh-CN': '简体中文', en: 'English' };

interface SidebarProps {
  activeId: string | null;
  collapsed: boolean;
  onToggle(): void;
  onImport(): void;
}

export function Sidebar({ activeId, collapsed, onToggle, onImport }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const lib = useLibrary();
  const { data: articles, error } = useLibraryQuery(listArticles, [], ['article']);
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);

  const remove = async (article: ArticleSummary) => {
    if (!window.confirm(t('library.confirmDelete', { title: article.title }))) return;
    await deleteArticle(lib, article.id);
    if (article.id === activeId) navigate({ name: 'home' });
  };

  if (collapsed) {
    return (
      <nav className="sidebar collapsed">
        <button type="button" className="icon" onClick={onToggle} aria-label={t('library.expand')} data-testid="sidebar-toggle">
          ›
        </button>
      </nav>
    );
  }

  return (
    <nav className="sidebar">
      <header>
        <h1>Jot</h1>
        <button type="button" onClick={onImport} data-testid="import-open">
          {t('library.import')}
        </button>
        <button type="button" className="icon" onClick={onToggle} aria-label={t('library.collapse')} data-testid="sidebar-toggle">
          ‹
        </button>
      </header>
      <SearchBox state={search} onChange={setSearch} />
      {isSearching(search) ? (
        <SearchPanel state={search} onChange={setSearch} />
      ) : (
        <>
          <h2>{t('library.heading')}</h2>
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
                <button type="button" className="icon" aria-label={t('library.delete')} onClick={() => remove(a).catch(reportError)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <footer>
        <label>
          {t('app.language')}{' '}
          <select value={i18n.language} onChange={(e) => setLanguage(e.target.value as Language).catch(reportError)} data-testid="language">
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
      </footer>
    </nav>
  );
}
```

In `apps/client/src/i18n/en.ts`, add after the `tags` block:
```ts
  search: {
    placeholder: 'Search the library',
    types: 'Item types',
    type: { article: 'Articles', markup: 'Markups', side_note: 'Side notes', memo: 'Memos' },
    kind: { article: 'Article', markup: 'Markup', side_note: 'Side note', memo: 'Memo' },
    addTag: '# Tag',
    inherit: 'Include items in tagged articles',
    clear: 'Clear search',
    none: 'Nothing found.',
  },
```

In `apps/client/src/i18n/zh-CN.ts`, add after the `tags` block:
```ts
  search: {
    placeholder: '搜索文库',
    types: '条目类型',
    type: { article: '文章', markup: '标注', side_note: '旁注', memo: '札记' },
    kind: { article: '文章', markup: '标注', side_note: '旁注', memo: '札记' },
    addTag: '# 标签',
    inherit: '包括带此标签的文章中的条目',
    clear: '清除搜索',
    none: '没有找到。',
  },
```

Append to `apps/client/src/styles/app.css`:
```css
/* Search */
.search-input { font: inherit; width: 100%; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--text); }
.search-input:focus { outline: none; border-color: var(--accent); }
.search-panel { display: flex; flex-direction: column; gap: 8px; }
.search-types, .search-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.search-types button { font-size: 12px; padding: 2px 8px; }
.search-types button[aria-pressed='true'] { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.search-inherit { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.search-panel > .quiet { align-self: flex-start; padding: 0; }
.search-results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.search-result { display: flex; flex-direction: column; align-items: stretch; gap: 2px; width: 100%; text-align: left; border: none; background: none; padding: 6px 8px; border-radius: 6px; }
.search-result:hover { background: var(--bg); }
.search-result-type { font-size: 11px; color: var(--muted); }
.search-result-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-snippet { font-family: var(--font-read); font-size: 13px; line-height: 1.5; color: var(--muted); }
.search-panel mark { background: var(--mk-highlight); color: inherit; border-radius: 2px; }
```

- [ ] **Step 3: Run the search end-to-end tests on both browsers, plus regressions and the unit suite**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e search shell import follow`
Expected:
- search: chromium 7 passed; webkit 6 passed and 1 skipped (the composition test);
- shell, import and follow: unchanged.

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add apps/client
git commit -m "feat(client): search the library from the sidebar by keyword, type and tag, with snippets"
```

---

### Task 5: The tag tree in the sidebar

**Files:**
- Create: `apps/client/src/components/TagTree.tsx`, `packages/db/src/tagMove.test.ts`, `apps/client/e2e/tagtree.spec.ts`
- Modify: `packages/db/src/tags.ts` (`moveTag`), `apps/client/src/components/Sidebar.tsx`, `apps/client/src/styles/app.css`
- Test: `packages/db/src/tagMove.test.ts`, `apps/client/e2e/tagtree.spec.ts`

**Interfaces:**
- Consumes:
  - from plan 1: `addParent`, `removeParent`, `createTag`, `renameTag` and `deleteTag`;
  - from core: `descendants`;
  - from Task 2: `buildTagTree` and `useTagIndex`;
  - from Task 3: `TagPicker`;
  - from Task 4: `EMPTY_SEARCH`.
- Produces:
  - `moveTag(lib, childId, fromParentId: string | null, toParentId)`: one commit that adds the new edge and removes the old one. It refuses cycles with `TagCycleError`, like `addParent`.
  - `<TagTree onSelect(tagId) />`, with these test IDs:
    - `tag-tree`, `tag-new`, `tag-name-input` and `tags-top` (the heading, which is also a drop zone);
    - `tag-row`, which carries a `data-tag` attribute with the name; its `li` has `role="treeitem"` and `aria-level`;
    - `tag-name`, `tag-menu` and `tag-rename-input`;
    - menu items `tag-rename`, `tag-add-parent`, `tag-remove-from` and `tag-delete`.
  - Clicking a tag's name starts a tag-only search for it.

- [ ] **Step 1: Write the failing tests**

`packages/db/src/tagMove.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { Library } from './library';
import { addParent, createTag, listEdges, moveTag, TagCycleError } from './tags';

const pairs = async (lib: Library) => (await listEdges(lib)).map((e) => `${e.parent_id}>${e.child_id}`).sort();

describe('moveTag', () => {
  it('moves a tag from one parent to another, or from the top level, in one step', async () => {
    const lib = await Library.open(createNodeDriver());
    const a = await createTag(lib, { name: 'a' });
    const b = await createTag(lib, { name: 'b' });
    const c = await createTag(lib, { name: 'c' });
    await addParent(lib, c, a);
    await moveTag(lib, c, a, b);
    expect(await pairs(lib)).toEqual([`${b}>${c}`]);
    await moveTag(lib, a, null, b);
    expect(await pairs(lib)).toEqual([`${b}>${a}`, `${b}>${c}`].sort());
  });

  it('refuses to move a tag under itself or its own subtag, changing nothing (Review Focus 4)', async () => {
    const lib = await Library.open(createNodeDriver());
    const a = await createTag(lib, { name: 'a' });
    const b = await createTag(lib, { name: 'b' });
    await addParent(lib, b, a);
    await expect(moveTag(lib, a, null, b)).rejects.toBeInstanceOf(TagCycleError);
    await expect(moveTag(lib, a, null, a)).rejects.toBeInstanceOf(TagCycleError);
    expect(await pairs(lib)).toEqual([`${a}>${b}`]);
  });
});
```

`apps/client/e2e/tagtree.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

/** The row of tag `name`, optionally only at tree level `level` (1 = top). */
const row = (page: Page, name: string, level?: number) =>
  page.locator(`[role="treeitem"]${level ? `[aria-level="${level}"]` : ''} > [data-testid="tag-row"][data-tag="${name}"]`);

async function newTag(page: Page, name: string) {
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill(name);
  await page.getByTestId('tag-name-input').press('Enter');
  await expect(row(page, name).first()).toBeVisible();
}

async function menu(page: Page, name: string, item: string) {
  await row(page, name).first().getByTestId('tag-menu').click();
  await page.getByTestId(item).click();
}

async function addParentByMenu(page: Page, child: string, parent: string) {
  await menu(page, child, 'tag-add-parent');
  await page.getByTestId('tag-input').fill(parent);
  await page.getByTestId('tag-input').press('Enter');
}

test('arranges tags by dragging; Alt-drag adds a second parent (spec §6.4)', async ({ page }) => {
  await openApp(page);
  for (const name of ['技巧', '修辞', '比喻', '意象']) await newTag(page, name);
  await row(page, '修辞').dragTo(row(page, '技巧'));
  await expect(row(page, '修辞', 2)).toBeVisible();
  await row(page, '比喻').dragTo(row(page, '修辞'));
  await expect(row(page, '比喻', 3)).toBeVisible();
  await page.keyboard.down('Alt');
  await row(page, '比喻').dragTo(row(page, '意象'));
  await page.keyboard.up('Alt');
  await expect(row(page, '比喻')).toHaveCount(2);
  await expect(row(page, '比喻', 3)).toHaveCount(1);
  await expect(row(page, '比喻', 2)).toHaveCount(1);
});

test('refuses to put a tag under its own subtag, and never offers one as a parent (Review Focus 4)', async ({ page }) => {
  await openApp(page);
  await newTag(page, '技巧');
  await newTag(page, '修辞');
  await addParentByMenu(page, '修辞', '技巧');
  await expect(row(page, '修辞', 2)).toBeVisible();
  await row(page, '技巧').dragTo(row(page, '修辞'));
  await expect(page.getByTestId('error-banner')).toContainText('can’t go under itself');
  await expect(row(page, '技巧', 1)).toBeVisible();
  await expect(row(page, '修辞', 2)).toBeVisible();
  await menu(page, '技巧', 'tag-add-parent');
  await page.getByTestId('tag-input').fill('修辞');
  await expect(page.getByTestId('tag-option')).toHaveCount(0);
  await expect(page.getByTestId('tag-create')).toHaveCount(0);
});

test('takes a tag out of its parent, renames, and deleting a parent keeps its subtags', async ({ page }) => {
  await openApp(page);
  for (const name of ['技巧', '修辞', '比喻']) await newTag(page, name);
  await addParentByMenu(page, '修辞', '技巧');
  await addParentByMenu(page, '比喻', '技巧');
  await expect(row(page, '修辞', 2)).toBeVisible();
  await menu(page, '修辞', 'tag-remove-from');
  await expect(row(page, '修辞', 1)).toBeVisible();
  await menu(page, '技巧', 'tag-rename');
  await page.getByTestId('tag-rename-input').fill('手法');
  await page.getByTestId('tag-rename-input').press('Enter');
  await expect(row(page, '手法', 1)).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await menu(page, '手法', 'tag-delete');
  await expect(row(page, '手法')).toHaveCount(0);
  await expect(row(page, '比喻', 1)).toBeVisible();
});

test('finds a side note by tag 技巧 and the query 比喻, and the inherit toggle (spec §10 step 4)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春日', '春风又绿江南岸。他用比喻写春天，比喻很生动。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await selectText(page, '春风');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('这里的比喻很妙');
  for (const name of ['技巧', '修辞', '比喻', '意象']) await newTag(page, name);
  await addParentByMenu(page, '修辞', '技巧');
  await addParentByMenu(page, '比喻', '修辞');
  await addParentByMenu(page, '比喻', '意象');
  await expect(row(page, '比喻')).toHaveCount(2);
  await addTag(page, 'note-tags', '比喻');
  await addTag(page, 'article-tags', '修辞');
  await row(page, '技巧').getByTestId('tag-name').click();
  await expect(page.getByTestId('search-tag')).toHaveText(['技巧']);
  await expect(page.getByTestId('search-result')).toHaveCount(2);
  await page.getByTestId('search-input').fill('比喻');
  await expect(page.locator('[data-testid="search-result"][data-entity-type="side_note"]')).toHaveCount(1);
  await expect(page.getByTestId('search-result')).toHaveCount(2);
  await page.getByTestId('search-inherit').check();
  await expect(page.getByTestId('search-result')).toHaveCount(3);
  await expect(page.locator('[data-testid="search-result"][data-entity-type="markup"]')).toHaveCount(1);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/tagMove.test.ts`
Expected: FAIL with `moveTag is not a function` (or "does not provide an export named 'moveTag'").

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tagtree --project chromium --timeout 15000`
Expected: FAIL: there is no `tag-new` button.

- [ ] **Step 3: Implement `moveTag`**

In `packages/db/src/tags.ts`, replace the `addParent` and `removeParent` functions with:
```ts
const edgeInput = (parentId: string, childId: string, deleted: 0 | 1): OpInput => ({
  table: 'tag_edge',
  id: tagEdgeId(parentId, childId),
  fields: { parent_id: parentId, child_id: childId, deleted },
});

/** Call inside `lib.lock`: the check and the write that follows must not interleave with another change. */
async function assertCanAddParent(lib: Library, childId: string, parentId: string): Promise<void> {
  if (childId === parentId) throw new TagCycleError('A tag cannot be its own parent');
  if ((await descendantTagIds(lib, childId)).includes(parentId)) {
    throw new TagCycleError('That parent is already below this tag');
  }
}

export async function addParent(lib: Library, childId: string, parentId: string): Promise<void> {
  await lib.lock.run(async () => {
    await assertCanAddParent(lib, childId, parentId);
    await lib.commit([edgeInput(parentId, childId, 0)]);
  });
}

/** Moves a tag from one parent (or the top level) to another in one commit; refuses cycles like `addParent`. */
export async function moveTag(lib: Library, childId: string, fromParentId: string | null, toParentId: string): Promise<void> {
  await lib.lock.run(async () => {
    await assertCanAddParent(lib, childId, toParentId);
    const inputs = [edgeInput(toParentId, childId, 0)];
    if (fromParentId && fromParentId !== toParentId) inputs.push(edgeInput(fromParentId, childId, 1));
    await lib.commit(inputs);
  });
}

export async function removeParent(lib: Library, childId: string, parentId: string): Promise<void> {
  await lib.commit([edgeInput(parentId, childId, 1)]);
}
```

- [ ] **Step 4: Implement the tree and put it in the sidebar**

`apps/client/src/components/TagTree.tsx`:
```tsx
import { descendants } from '@jot/core';
import { addParent, createTag, deleteTag, moveTag, removeParent, renameTag, type TagRow } from '@jot/db';
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibrary } from '../data/LibraryContext';
import { useReportTagError } from '../tags/errors';
import { useTagIndex } from '../tags/TagContext';
import { buildTagTree, type TagNode } from '../tags/tree';
import { TagPicker } from './TagPicker';

const DRAG_TYPE = 'application/x-jot-tag';
/** Drop-highlight key of the heading, which takes a dropped tag out of its parent. */
const TOP = '#top';
const INDENT = 14;

/** What is being dragged: a tag, and the parent it was dragged out from (null at the top level). */
interface DraggedTag {
  tagId: string;
  parentId: string | null;
}

interface Props {
  /** Lists everything that carries the tag or one of its subtags. */
  onSelect(tagId: string): void;
}

/**
 * The tag hierarchy (spec §6.4). Drag a tag onto another to move it there, or hold Alt to add that tag
 * as a further parent; drop it on the heading to take it out of its parent. Each row's menu offers the
 * same changes without dragging.
 */
export function TagTree({ onSelect }: Props) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const report = useReportTagError();
  const { tags, edges, byId } = useTagIndex();
  const tree = useMemo(() => buildTagTree(tags, edges), [tags, edges]);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [pickingParentKey, setPickingParentKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const toggle = (key: string) =>
    setCollapsed((keys) => {
      const next = new Set(keys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** The tag itself, everything below it and its current parents can't be added as its parent. */
  const notParentable = (tagId: string): ReadonlySet<string> => {
    const blocked = descendants(
      edges.map((e) => ({ parent: e.parent_id, child: e.child_id })),
      tagId,
    );
    for (const e of edges) if (e.child_id === tagId) blocked.add(e.parent_id);
    return blocked;
  };

  const dragOver = (e: DragEvent, key: string) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
    setDropKey(key);
  };

  const drop = (e: DragEvent, target: TagRow | null) => {
    e.preventDefault();
    setDropKey(null);
    let dragged: DraggedTag;
    try {
      dragged = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as DraggedTag;
    } catch {
      return;
    }
    if (target === null) {
      if (dragged.parentId) removeParent(lib, dragged.tagId, dragged.parentId).catch(report);
      return;
    }
    if (target.id === dragged.tagId) return; // dropped back onto itself
    const change = e.altKey ? addParent(lib, dragged.tagId, target.id) : moveTag(lib, dragged.tagId, dragged.parentId, target.id);
    change.catch(report);
  };

  const renderNode = (node: TagNode): ReactNode => {
    const { tag, parentId } = node;
    const open = !collapsed.has(node.key);
    const menuIndent = { marginLeft: node.depth * INDENT + 20 };
    return (
      <li key={node.key} role="treeitem" aria-level={node.depth + 1} aria-expanded={node.children.length > 0 ? open : undefined}>
        <div
          className={dropKey === node.key ? 'tag-row drop' : 'tag-row'}
          style={{ paddingLeft: node.depth * INDENT }}
          draggable={renamingKey !== node.key}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ tagId: tag.id, parentId } satisfies DraggedTag));
            e.dataTransfer.effectAllowed = 'copyMove';
          }}
          onDragOver={(e) => dragOver(e, node.key)}
          onDragLeave={() => setDropKey((k) => (k === node.key ? null : k))}
          onDrop={(e) => drop(e, tag)}
          data-testid="tag-row"
          data-tag={tag.name}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              className="icon tag-toggle"
              aria-label={open ? t('tags.collapse') : t('tags.expand')}
              onClick={() => toggle(node.key)}
            >
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="tag-toggle" />
          )}
          {renamingKey === node.key ? (
            <NameInput
              label={t('tags.renameLabel', { name: tag.name })}
              initial={tag.name}
              testId="tag-rename-input"
              onDone={(name) => {
                setRenamingKey(null);
                if (name && name !== tag.name) renameTag(lib, tag.id, name).catch(report);
              }}
            />
          ) : (
            <button type="button" className="tag-name" onClick={() => onSelect(tag.id)} data-testid="tag-name">
              {tag.name}
            </button>
          )}
          <button
            type="button"
            className="icon tag-menu-button"
            aria-label={t('tags.menu')}
            aria-haspopup="menu"
            aria-expanded={menuKey === node.key}
            onClick={() => setMenuKey(menuKey === node.key ? null : node.key)}
            data-testid="tag-menu"
          >
            ⋯
          </button>
        </div>
        {menuKey === node.key && (
          <div className="tag-menu" role="menu" style={menuIndent}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuKey(null);
                setRenamingKey(node.key);
              }}
              data-testid="tag-rename"
            >
              {t('tags.rename')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuKey(null);
                setPickingParentKey(node.key);
              }}
              data-testid="tag-add-parent"
            >
              {t('tags.addParent')}
            </button>
            {parentId && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuKey(null);
                  removeParent(lib, tag.id, parentId).catch(report);
                }}
                data-testid="tag-remove-from"
              >
                {t('tags.removeFrom', { name: byId.get(parentId)?.name ?? '' })}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuKey(null);
                if (window.confirm(t('tags.confirmDelete', { name: tag.name }))) deleteTag(lib, tag.id).catch(report);
              }}
              data-testid="tag-delete"
            >
              {t('tags.delete')}
            </button>
          </div>
        )}
        {pickingParentKey === node.key && (
          <div className="tag-parent-picker" style={menuIndent}>
            <TagPicker
              allowCreate
              exclude={notParentable(tag.id)}
              onPick={(parent) => addParent(lib, tag.id, parent.id).catch(report)}
              onCreate={(name) =>
                createTag(lib, { name })
                  .then((newParentId) => addParent(lib, tag.id, newParentId))
                  .catch(report)
              }
              onClose={() => setPickingParentKey(null)}
            />
          </div>
        )}
        {open && node.children.length > 0 && <ul role="group">{node.children.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <section className="tag-tree-section">
      <div
        className={dropKey === TOP ? 'tags-heading drop' : 'tags-heading'}
        title={t('tags.topLevel')}
        onDragOver={(e) => dragOver(e, TOP)}
        onDragLeave={() => setDropKey((k) => (k === TOP ? null : k))}
        onDrop={(e) => drop(e, null)}
        data-testid="tags-top"
      >
        <h2>{t('tags.heading')}</h2>
        <button type="button" className="icon" aria-label={t('tags.new')} title={t('tags.new')} onClick={() => setCreating(true)} data-testid="tag-new">
          +
        </button>
      </div>
      {creating && (
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
      )}
      {tree.length === 0 && !creating && <p className="muted">{t('tags.empty')}</p>}
      <ul className="tag-tree" role="tree" aria-label={t('tags.heading')} data-testid="tag-tree">
        {tree.map(renderNode)}
      </ul>
    </section>
  );
}

interface NameInputProps {
  label: string;
  placeholder?: string;
  initial: string;
  testId: string;
  /** The trimmed name, or null when cancelled (Escape) or left empty. */
  onDone(name: string | null): void;
}

/** An inline name field: Enter or leaving it finishes, Escape cancels. */
function NameInput({ label, placeholder, initial, testId, onDone }: NameInputProps) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      className="tag-name-input"
      autoFocus
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') finish(value.trim() || null);
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(value.trim() || null)}
      data-testid={testId}
    />
  );
}
```

In `apps/client/src/components/Sidebar.tsx`:
- add `import { TagTree } from './TagTree';` after the `./SearchPanel` import
- directly after the library list's closing `</ul>` (inside the fragment), add:
```tsx
          <TagTree onSelect={(tagId) => setSearch({ ...EMPTY_SEARCH, tagIds: [tagId] })} />
```

Append to `apps/client/src/styles/app.css`:
```css
/* Tag tree */
.tags-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; border-radius: 6px; }
.tags-heading h2 { margin: 0; }
.tags-heading.drop, .tag-row.drop { background: var(--bg); outline: 1px dashed var(--accent); }
.tag-tree, .tag-tree ul { list-style: none; margin: 0; padding: 0; }
.tag-row { display: flex; align-items: center; gap: 2px; border-radius: 6px; }
.tag-row:hover { background: var(--bg); }
.tag-toggle { width: 18px; flex: none; padding: 0; text-align: center; }
.tag-name { flex: 1; min-width: 0; text-align: left; border: none; background: none; padding: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-name::before { content: '#'; color: var(--muted); margin-right: 2px; }
.tag-menu-button { opacity: 0.35; }
.tag-row:hover .tag-menu-button, .tag-menu-button:focus-visible, .tag-menu-button[aria-expanded='true'] { opacity: 1; }
.tag-menu { display: flex; flex-direction: column; align-items: stretch; margin: 2px 0 6px; padding: 4px; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; }
.tag-menu button { border: none; background: none; text-align: left; padding: 3px 6px; font-size: 13px; }
.tag-menu button:hover { color: var(--accent); }
.tag-name-input { font: inherit; flex: 1; min-width: 0; padding: 2px 6px; border: 1px solid var(--accent); border-radius: 6px; background: var(--bg); color: var(--text); outline: none; }
.tag-parent-picker { margin: 2px 0 6px; }
```

- [ ] **Step 5: Run the tests on both browsers, plus regressions**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes (2 new ones), with no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e tagtree search tags shell`
Expected: tagtree passes 4 on each browser; search, tags and shell are unchanged.

If the Alt-drag assertion fails because Playwright did not carry Alt into the drop event (比喻 was moved rather than given a second parent):
- confirm this with a one-off check that logs `event.altKey` in `drop`;
- then add the second parent in that test through `addParentByMenu`;
- record a ruling;
- ask the user to check Alt-drag by hand in Task 7.

If HTML5 drag-and-drop doesn't reach the page in Playwright's WebKit, skip the two drag tests on WebKit with that reason and record a ruling. The menu paths are covered on both browsers.

- [ ] **Step 6: Commit**

```bash
git add packages/db apps/client
git commit -m "feat(client): tag tree with drag, Alt-drag and a menu to arrange, rename and delete tags"
```

---

### Task 6: Linking a passage by typing `[[`

**Files:**
- Create:
  - `apps/client/src/memo/passages.ts` and `passages.test.ts`
  - `apps/client/src/memo/linkSuggestion.ts`
  - `apps/client/src/memo/LinkSuggestionList.tsx`
  - `apps/client/e2e/suggest.spec.ts`
- Modify:
  - `apps/client/src/memo/MemoEditor.tsx`
  - `apps/client/src/i18n/en.ts` and `zh-CN.ts` (the `memo` block)
  - `apps/client/src/styles/app.css`
  - `apps/client/package.json` (dependencies)
- Test: `apps/client/src/memo/passages.test.ts`, `apps/client/e2e/suggest.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `searchLibrary`;
  - from plan 3: `excerpt`, `LinkTarget` and the `anchorLink` node;
  - from core: `newId`.
- Produces:
  - `interface PassageOption extends LinkTarget { source: string }`, where `source` is the article's title.
  - `findPassages(lib, query, untitled): Promise<PassageOption[]>`: markups and side notes matching `query`, at most 8. A blank query finds nothing.
  - `LinkSuggestion`, a TipTap extension with the options `{ find, onChange, onKeyDown }`:
    - its triggers are `LINK_TRIGGERS = ['[[', '【【']`, with no prefix required before them;
    - choosing a passage replaces the trigger and the typed text with a link chip followed by a space.
  - `<LinkSuggestionList state />`, which exposes `onKeyDown` through a ref. Its test IDs are `link-suggestions`, `link-suggestion` and `link-suggestion-empty`.

- [ ] **Step 1: Add the dependencies**

Run: `docker compose run --rm -T dev pnpm --filter @jot/client add @tiptap/suggestion@3.31.3 @floating-ui/dom`
Then: `docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright`

- [ ] **Step 2: Write the failing tests**

`apps/client/src/memo/passages.test.ts`:
```ts
import { captureAnchor } from '@jot/core';
import { createArticle, createMarkup, createSideNote, getArticle, Library } from '@jot/db';
import { createNodeDriver } from '@jot/db/testing/node';
import { describe, expect, it } from 'vitest';
import { findPassages } from './passages';

describe('findPassages', () => {
  it('offers matching markups and side notes, not articles, as link targets', async () => {
    let t = 1000;
    const lib = await Library.open(createNodeDriver(), { now: () => t++ });
    const { articleId, revisionId } = await createArticle(lib, {
      title: '春',
      importKind: 'paste',
      blocks: [{ k: 'p', runs: [{ t: '春风又绿江南岸，明月何时照我还。' }] }],
    });
    const text = (await getArticle(lib, articleId))!.text;
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 8, 10), style: 'highlight' });
    const noteId = await createSideNote(lib, { markupId, articleId, body: '以明月寄情' });
    const found = await findPassages(lib, '明月', 'Side note');
    expect(found).toHaveLength(2);
    expect(found).toEqual(
      expect.arrayContaining([
        { targetType: 'markup', targetId: markupId, articleId, label: '明月', source: '春' },
        { targetType: 'side_note', targetId: noteId, articleId, label: '以明月寄情', source: '春' },
      ]),
    );
    expect(await findPassages(lib, '  ', 'Side note')).toEqual([]);
  });
});
```

`apps/client/e2e/suggest.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

const editor = (page: Page) => page.getByTestId('memo-editor');
const chips = (page: Page) => editor(page).locator('.anchor-chip');

/** A highlight on 明月, a side note 以景起兴 (on 春风), and an empty memo with the cursor in it. */
async function setup(page: Page) {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸，明月何时照我还。');
  await selectText(page, '明月');
  await page.getByTestId('toolbar-highlight').click();
  await selectText(page, '春风');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await page.getByTestId('memo-new').click();
  await editor(page).click();
}

test('links a highlight by typing [[ and part of its text', async ({ page }) => {
  await setup(page);
  await page.keyboard.insertText('对比[[明月');
  await expect(page.getByTestId('link-suggestion')).toHaveCount(1);
  await expect(page.getByTestId('link-suggestion')).toContainText('明月');
  await page.keyboard.press('Enter');
  await expect(chips(page)).toHaveText(['明月']);
  await expect(editor(page)).not.toContainText('[[');
  await expect(editor(page)).toContainText('对比');
});

test('【【, which a Chinese input method types, works right after Chinese text (Review Focus 2)', async ({ page }) => {
  await setup(page);
  await page.keyboard.insertText('起笔【【以景');
  await expect(page.getByTestId('link-suggestion')).toHaveCount(1);
  await page.getByTestId('link-suggestion').click();
  await expect(chips(page)).toHaveText(['以景起兴']);
  await expect(editor(page)).not.toContainText('【【');
});

test('Escape closes the list without inserting a link', async ({ page }) => {
  await setup(page);
  await page.keyboard.insertText('[[明');
  await expect(page.getByTestId('link-suggestion')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('link-suggestions')).toHaveCount(0);
  await expect(chips(page)).toHaveCount(0);
  await expect(editor(page)).toContainText('[[明');
});

test('says so when nothing matches', async ({ page }) => {
  await setup(page);
  await page.keyboard.insertText('[[没有这句');
  await expect(page.getByTestId('link-suggestion-empty')).toBeVisible();
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/memo/passages.test.ts`
Expected: FAIL with `Cannot find module './passages'`.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e suggest --project chromium --timeout 15000`
Expected: FAIL: no `link-suggestion` appears.

- [ ] **Step 3: Implement**

`apps/client/src/memo/passages.ts`:
```ts
import { searchLibrary, type Library } from '@jot/db';
import { excerpt } from '../article/excerpt';
import type { LinkTarget } from './bridge';

/** A passage offered after `[[`: a link target, plus the title of its article. */
export interface PassageOption extends LinkTarget {
  source: string;
}

/** Markups and side notes matching `query`, best first, as link targets. A blank query finds nothing. */
export async function findPassages(lib: Library, query: string, untitled: string): Promise<PassageOption[]> {
  if (query.trim() === '') return [];
  const results = await searchLibrary(lib, { text: query, types: ['markup', 'side_note'], limit: 8 });
  return results.flatMap((r): PassageOption[] =>
    r.articleId && (r.entityType === 'markup' || r.entityType === 'side_note')
      ? [{ targetType: r.entityType, targetId: r.entityId, articleId: r.articleId, label: excerpt(r.text) || untitled, source: r.articleTitle ?? '' }]
      : [],
  );
}
```

`apps/client/src/memo/linkSuggestion.ts`:
```ts
import { newId } from '@jot/core';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import type { PassageOption } from './passages';

export interface LinkSuggestionState {
  query: string;
  items: PassageOption[];
  /** Where the trigger was typed (viewport coordinates), for placing the list. */
  rect: DOMRect | null;
  choose(item: PassageOption): void;
}

export interface LinkSuggestionOptions {
  find(query: string): Promise<PassageOption[]>;
  /** The list to show, or null to hide it. */
  onChange(state: LinkSuggestionState | null): void;
  /** Arrow keys and Enter while the list is shown; true when handled. */
  onKeyDown(event: KeyboardEvent): boolean;
}

/** `[[`, and `【【`, which is what the `[` key types with a Chinese input method. */
export const LINK_TRIGGERS = ['[[', '【【'] as const;

const toState = (props: SuggestionProps<PassageOption, PassageOption>): LinkSuggestionState => ({
  query: props.query,
  items: props.items,
  rect: props.clientRect?.() ?? null,
  choose: (item) => props.command(item),
});

/** Typing a trigger and part of a passage offers matching markups and side notes; choosing one inserts a chip. */
export const LinkSuggestion = Extension.create<LinkSuggestionOptions>({
  name: 'linkSuggestion',

  addOptions() {
    return { find: async () => [], onChange: () => undefined, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const { find, onChange, onKeyDown } = this.options;
    return LINK_TRIGGERS.map((char, i) =>
      Suggestion<PassageOption, PassageOption>({
        editor: this.editor,
        pluginKey: new PluginKey(`linkSuggestion${i}`),
        char,
        // Chinese text has no space before the trigger.
        allowedPrefixes: null,
        items: ({ query }) => find(query),
        command: ({ editor, range, props }) => {
          const link = { targetType: props.targetType, targetId: props.targetId, articleId: props.articleId, label: props.label };
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: 'anchorLink', attrs: { ...link, linkId: newId() } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: () => ({
          onStart: (props) => onChange(toState(props)),
          onUpdate: (props) => onChange(toState(props)),
          onKeyDown: ({ event }) => {
            if (event.key === 'Escape') {
              onChange(null);
              return true;
            }
            return onKeyDown(event);
          },
          onExit: () => onChange(null),
        }),
      }),
    );
  },
});
```

`apps/client/src/memo/LinkSuggestionList.tsx`:
```tsx
import { forwardRef, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LinkSuggestionState } from './linkSuggestion';

export interface LinkSuggestionListHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

/** The passages offered after `[[`, under the typed trigger. Arrow keys move, Enter or a click chooses. */
export const LinkSuggestionList = forwardRef<LinkSuggestionListHandle, { state: LinkSuggestionState }>(function LinkSuggestionList(
  { state },
  ref,
) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [indexFor, setIndexFor] = useState(state.query);
  if (indexFor !== state.query) {
    // New text after the trigger: start again at the best match.
    setIndexFor(state.query);
    setIndex(0);
  }
  const count = state.items.length;
  const current = Math.min(index, Math.max(count - 1, 0));

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown(event) {
        if (count === 0) return false;
        if (event.key === 'ArrowDown') setIndex((current + 1) % count);
        else if (event.key === 'ArrowUp') setIndex((current - 1 + count) % count);
        else if (event.key === 'Enter') state.choose(state.items[current]);
        else return false;
        return true;
      },
    }),
    [count, current, state],
  );

  const blank = state.query.trim() === '';
  return (
    <ul
      className="link-suggestions"
      role="listbox"
      style={state.rect ? { left: state.rect.left, top: state.rect.bottom + 4 } : undefined}
      onMouseDown={(e) => e.preventDefault()}
      data-testid="link-suggestions"
    >
      {blank && <li className="muted">{t('memo.suggestHint')}</li>}
      {!blank && count === 0 && (
        <li className="muted" data-testid="link-suggestion-empty">
          {t('memo.suggestNone')}
        </li>
      )}
      {state.items.map((item, i) => (
        <li
          key={`${item.targetType}:${item.targetId}`}
          role="option"
          aria-selected={i === current}
          className={i === current ? 'active' : undefined}
          onClick={() => state.choose(item)}
          data-testid="link-suggestion"
        >
          <span className="label">{item.label}</span>
          <span className="source">{item.source}</span>
        </li>
      ))}
    </ul>
  );
});
```

In `apps/client/src/memo/MemoEditor.tsx`:
1. Add these imports after the `./bridge` import (`reportError`, `useRef` and `useState` are already imported):
```tsx
import { LinkSuggestion, type LinkSuggestionState } from './linkSuggestion';
import { LinkSuggestionList, type LinkSuggestionListHandle } from './LinkSuggestionList';
import { findPassages } from './passages';
```
2. In `LoadedMemoEditor`, before `const editor = useEditor(`, add:
```tsx
  const [suggest, setSuggest] = useState<LinkSuggestionState | null>(null);
  const listRef = useRef<LinkSuggestionListHandle>(null);
```
3. In the `extensions` array, after `Placeholder.configure(…)`, add:
```tsx
        LinkSuggestion.configure({
          find: (query) =>
            findPassages(lib, query, t('notes.untitled')).catch((error: unknown) => {
              reportError(error);
              return [];
            }),
          onChange: setSuggest,
          onKeyDown: (event) => listRef.current?.onKeyDown(event) ?? false,
        }),
```
4. Replace `return <EditorContent editor={editor} />;` with:
```tsx
  return (
    <>
      <EditorContent editor={editor} />
      {suggest && <LinkSuggestionList ref={listRef} state={suggest} />}
    </>
  );
```

In `apps/client/src/i18n/en.ts`, in the `memo` block:
- change `placeholder` to `'Write your analysis… Type [[ to link a highlight or side note, or quote with the toolbar.'`
- add `suggestHint: 'Type to find a highlight or side note',` and `suggestNone: 'No matching passages',`.

In `apps/client/src/i18n/zh-CN.ts`, in the `memo` block:
- change `placeholder` to `'写下你的分析…… 输入 [[ 或【【 链接标注或旁注，也可用工具栏引用。'`
- add `suggestHint: '输入文字以查找标注或旁注',` and `suggestNone: '没有匹配的原文',`.

Append to `apps/client/src/styles/app.css`:
```css
/* Link suggestions after [[ */
.link-suggestions { position: fixed; z-index: 30; min-width: 220px; max-width: 360px; max-height: 260px; overflow: auto; margin: 0; padding: 4px; list-style: none; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); font-size: 14px; }
.link-suggestions li { display: flex; flex-direction: column; padding: 4px 8px; border-radius: 6px; cursor: pointer; }
.link-suggestions li.active { background: var(--panel); }
.link-suggestions .label { font-family: var(--font-read); }
.link-suggestions .source { font-size: 12px; color: var(--muted); }
```

- [ ] **Step 4: Run the unit test, then the end-to-end tests on both browsers plus regressions**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client && pnpm typecheck && pnpm lint'`
Expected: every client test passes (1 new one), with no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e suggest memo links`
Expected: suggest passes 4 on each browser; memo and links are unchanged.

If the TypeScript names used above differ in the installed `@tiptap/suggestion` (check `node_modules/@tiptap/suggestion/dist/index.d.ts`):
- use the installed names, for example a default export instead of the named `Suggestion`, or a different name for the props type;
- keep the behaviour the same;
- record a ruling.

- [ ] **Step 5: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "feat(client): link a highlight or side note into a memo by typing [[ or 【【"
```

---

### Task 7: Spec, README, desktop check and the full verification

**Files:**
- Modify: `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` (§6.3, §6.4, §6.5), `README.md`
- Test: the complete verification below, plus a desktop screenshot

**Interfaces:**
- Consumes: everything above.
- Produces: an up-to-date spec and README, and a verified desktop build.

- [ ] **Step 1: Record what was built in the spec**

In `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`:

1. At the end of §6.3 (after the "**Not in v1:**" line), add:
```markdown

**Search UI (plan 4):**
- There is a search box at the top of the sidebar.
- While it holds a query or tag filters, the library list is replaced by:
  - item-type filters;
  - tag filters, which are ANDed;
  - the inherit toggle, shown once a tag is chosen;
  - results with snippets and highlights.
- Text that an input method is still composing is shown but not searched.
- Clicking a result:
  - an article opens it;
  - a markup or side note jumps to it, the same way a memo link does;
  - a memo opens it in the memo column.
```
2. In §6.4, replace the "**Display:**" bullet with:
```markdown
- **Display (plan 4):** a tree in the sidebar, in which a tag with several parents appears under each parent.
  - Dragging a tag onto another moves it there. Alt-drag adds that tag as a further parent. Dropping a tag on the "Tags" heading takes it out of its parent.
  - Each row's menu offers the same changes without dragging: rename, add parent…, take out of the parent, and delete.
  - Clicking a tag lists everything that carries it or one of its subtags.
  - Every taggable item shows its tags as chips, with a search-as-you-type picker. A name that differs from an existing tag only by case, width or spacing picks that existing tag.
```
3. In §6.5, in the "**Anchor links:**" bullet, replace the sentence ``[[` search-to-link arrives with the search UI (plan 4).`` with:
```markdown
Typing `[[`, or `【【` (what the `[` key types with a Chinese input method), then part of a passage offers matching highlights and side notes; choosing one inserts a chip (plan 4).
```

- [ ] **Step 2: Update the README**

In `README.md`, replace the first paragraph under `# Jot` with:
```markdown
A library for writers who study model articles. Import an article (paste, `.txt`, `.md`) and read it in a
calm two-column layout. Underline, bold or highlight passages of any length, and keep side notes beside them.
Write analysis memos that quote passages and jump back to them. Tag everything with tiered tags, and find it
again by keyword, tag and type. The interface is in 简体中文 and English. Jot runs on desktop (Windows, macOS)
and the web.
```

- [ ] **Step 3: Check the desktop app through WSLg**

Run `docker compose up -d desktop`.

Wait until `docker compose logs desktop` shows `Running`, followed by the `jot-desktop` binary. The log contains colour codes, so match the two words separately.

Then run: `docker compose exec -T -u node desktop node apps/desktop/scripts/screenshot.mjs Jot .screenshots/desktop-tags.png`
Expected: the sidebar shows the search box and the "标签 / Tags" heading. Open the PNG to check it.

Before this task is complete, ask the user to try it by hand on desktop:
- tag something;
- drag one tag onto another, then Alt-drag one;
- search with the Chinese input method;
- type `【【` in a memo.

Then run `docker compose stop desktop`.

- [ ] **Step 4: Run the complete verification on freshly started services**

Run:
```bash
docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test'
docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'
docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright
docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e
```
Expected: every command exits 0. The e2e run has no failures, and its only skips are:
- the known WebKit ones (no OPFS, synthetic paste);
- the Chromium-only composition test;
- any drag tests ruled out on WebKit in Task 5.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-27-jot-core-app-design.md README.md
git commit -m "docs: tags, search and [[ links in the spec and README"
```

---

## Done when

- In the browser and in the desktop window, a writer can:
  - create tags, nest them by dragging or from the menu, give a tag a second parent, rename it and delete it;
  - tag an article, a highlight, a side note and a memo;
  - search the library by a 1- or 2-character Chinese query, by item type and by tags (subtags included), with the inherit toggle;
  - open a result: an article, a passage (with the flash), or a memo;
  - type `[[` or `【【` in a memo to link a highlight or side note.
- Spec §10 step 4 passes as an end-to-end test: tags `技巧 > 修辞 > 比喻`, `比喻` with a second parent, the side note found by tag `技巧` with the query `比喻`, and the inherit toggle.
- `pnpm typecheck && pnpm lint && pnpm test` and `cargo test` pass, and the e2e suite passes on Chromium and WebKit.
