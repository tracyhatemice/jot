# Jot Plan 7: Trash, Erasing and the Memo List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer can:
- find deleted articles, memos and tags in a Trash, and restore them with everything deleted with them;
- delete an item forever, or empty the Trash, which erases its content from the device;
- reach every memo from a Memos list in the sidebar, including memos whose article is gone.

**Architecture:**
- **Deletion states:** the `deleted` field becomes three states: `0` live, `1` deleted, `2` erased. Every change is an ordinary edit through `Library.commit`, so the newest one wins and sync carries it later.
- **"Deleted with it"** is read from the clocks, with no schema change: a child belongs to a Trash entry when the clock of its own `deleted` field is not older than the entry's.
- **Restore** reuses plan 6's `restoreRows` path, plus the client's memo refresh.
- **Erase:**
  - blanks the text with a fresh edit;
  - removes on this device the rows that can't be edited (revisions, memo updates and caches, anchor positions);
  - runs the same removal after every import, so a file can't bring erased content back.

**Tech Stack:** unchanged from plans 1–6. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`. Relevant sections:
- §5.1 deletion states
- §6.4 tag repairs
- §6.5 memos outlive their article
- §6.7 import restore
- §6.8 UI shell
- §6.9 Trash, erasing and the memo list
- §9 milestone M10
- §10 step 7

**Branch:** `plan-7-trash-memos` (the spec commit 092fd64 is already on it).

## Global Constraints

- **Plan 1–6 constraints still apply.** In particular:
  - Docker only.
  - Node ≥ 24 and pnpm 10.
  - `SqlDriver` has only `query` and `batch`.
  - Local edits go only through `Library.commit`.
  - Every user-facing string goes through i18next, with identical keys in `zh-CN` and `en`.
  - No `dangerouslySetInnerHTML`.
  - Conventional commits with **no attribution lines**.
- **Commands:**
  - Run: `docker compose run --rm -T -e NO_COLOR=1 dev <cmd>`.
  - End-to-end: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e [spec]`.
  - Rust: `docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'`.
- **Before any e2e run after editing `packages/`,** restart the dev server and the browser server. The running Vite doesn't pick up edits outside `apps/client` (plan 6):
  `docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright`, then wait for both:
  - `until docker compose exec -T web node -e "require('net').connect(3000,'localhost').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; do sleep 2; done`
  - `until docker compose exec -T web node -e "fetch('http://localhost:5173/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; do sleep 2; done`
- **Deletion states** (spec §5.1):
  - **`0` live.**
  - **`1` deleted.** Articles, memos and tags are then in the Trash. A markup or side note deleted on its own is just removed and never listed.
  - **`2` erased.** Every query that lists live items keeps using `deleted = 0`.
- **"Deleted with it"** (§6.9):
  - An article's markups, anchors and side notes, and a tag's `tag_edge` and `tagging` rows, belong to a Trash entry when their `deleted` field's clock is **not older** than the entry's.
  - A row's `deleted` clock is `coalesce(json_extract(fhlc, '$.deleted'), hlc)`.
- **Erasing** (§6.9) is a fresh edit setting `deleted: 2` and blanking the text:
  - article: `title: ''`, `author: null`, `source: null`;
  - anchor: `exact`, `prefix` and `suffix` all `''`;
  - side note: `body: ''`;
  - memo: `title: ''`;
  - tag: `name: ''`.
- **Removed on this device** after every erase and import, and never otherwise:
  - `article_revision` rows of erased articles;
  - `memo_update`, `memo_cache` and `memo_link` rows of erased memos;
  - `anchor_res` rows of erased anchors.
- **Tag merges** (§6.4): a tag merged into another becomes erased (`deleted: 2`), not deleted, so it never shows in the Trash. Its name and taggings live on in the kept tag.

## Review Focus

These five inputs aren't covered by the happy paths and are most likely to cause problems. Each one has a test in the task that owns the code.

1. **A markup removed on its own before its article was deleted.**
   - Expected: restoring the article does not bring that markup back.
   - Test: Task 1.
2. **Erasing an article, then importing a backup made before the erase.**
   - Expected: its content doesn't come back, and it isn't offered for restoring.
   - Test: Task 2.
3. **Restoring a tag whose name another tag has taken since.**
   - Expected: one tag with that name, and nothing left in the Trash.
   - Test: Task 1.
4. **A memo whose home article is deleted.**
   - Expected: the memo stays in the Memos list, marked "No article", and still opens with its text.
   - Test: Task 5.
5. **Following a memo link into a deleted article.**
   - Expected: it says the passage is in the Trash. Once the article is erased, it says the passage is gone.
   - Tests: Task 3 (database) and Task 5 (end-to-end).

---

## File map

```
packages/db/src/trash.ts, trash.test.ts                                  Tasks 1–2
packages/db/src/tags.ts, tags.test.ts (merged tags erased)                Task 1
packages/db/src/exchange.ts (removal after import)                        Task 2
packages/db/src/memos.ts, memoList.test.ts                                Task 3
packages/db/src/index.ts                                                  Task 1
apps/client/src/router.ts, router.test.ts                                 Task 4
apps/client/src/components/Trash.tsx, Shell.tsx, Sidebar.tsx              Task 4 (+ MemoList in Task 5)
apps/client/src/components/MemoList.tsx                                   Task 5
apps/client/src/i18n/en.ts, zh-CN.ts, styles/app.css                      Tasks 4–5
apps/client/e2e/trash.spec.ts, memolist.spec.ts                           Tasks 4–5
README.md, spec §6.4                                                      Tasks 1, 5
```

---

### Task 1: The Trash's contents and restoring an entry

**Files:**
- Create: `packages/db/src/trash.ts`, `packages/db/src/trash.test.ts`
- Modify:
  - `packages/db/src/tags.ts` (a merged-away tag is erased)
  - `packages/db/src/tags.test.ts`
  - `packages/db/src/index.ts`
  - `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` (§6.4)
- Test: `packages/db/src/trash.test.ts`, `packages/db/src/tags.test.ts`

**Interfaces:**
- Consumes:
  - from plan 6: `RowRef` and `restoreRows(lib, rows)` in `exchange.ts`;
  - from core: `parseHlc`.
- Produces:
  - `type TrashKind = 'article' | 'memo' | 'tag'`
  - `interface TrashEntry { kind: TrashKind; id: string; title: string; deletedAt: number; markups: number; sideNotes: number; taggings: number }`
  - `listTrash(lib): Promise<TrashEntry[]>`, newest deletion first.
  - `countTrash(lib): Promise<number>`
  - `trashEntryRows(lib, kind, id): Promise<RowRef[]>` returns the entry and everything deleted with it, or `[]` when it isn't in the Trash.
  - Internal helpers reused by Task 2: `TABLE`, `DELETED_CLOCK`, `deletedClock(lib, kind, id)`.

- [ ] **Step 1: Write the failing tests**

`packages/db/src/trash.test.ts`:
```ts
import { captureAnchor, type Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, getArticle, listArticles } from './articles';
import { restoreRows } from './exchange';
import { Library } from './library';
import { createMarkup, createSideNote, deleteMarkup, listMarkups } from './markups';
import { createMemo, deleteMemo } from './memos';
import { search } from './search';
import { addParent, createTag, deleteTag, listEdges, listTags, tagEntity, tagsOf } from './tags';
import { countTrash, listTrash, trashEntryRows } from './trash';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));
let tick = 1000;
const open = () => Library.open(createNodeDriver(), { now: () => tick++ });

/** An article with a highlight (with a tagged side note) and an underline, and a two-level tag. */
async function sample() {
  const lib = await open();
  const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('他用比喻写春天。明月何时照我还。') });
  const text = (await getArticle(lib, articleId))!.text;
  const kept = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
  const noteId = await createSideNote(lib, { markupId: kept.markupId, articleId, body: '以景起兴' });
  const early = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 8, 10), style: 'underline' });
  const parent = await createTag(lib, { name: '技巧' });
  const child = await createTag(lib, { name: '修辞' });
  await addParent(lib, child, parent);
  await tagEntity(lib, { tagId: child, entityType: 'side_note', entityId: noteId, articleId });
  return { lib, articleId, revisionId, text, noteId, kept: kept.markupId, early: early.markupId, parent, child };
}

describe('the Trash', () => {
  it('lists a deleted article with what comes back with it; a markup removed before it is not part of it', async () => {
    const { lib, articleId, early } = await sample();
    await deleteMarkup(lib, early);
    await deleteArticle(lib, articleId);
    expect(await listTrash(lib)).toEqual([
      expect.objectContaining({ kind: 'article', id: articleId, title: '春', markups: 1, sideNotes: 1, taggings: 0 }),
    ]);
    expect(await countTrash(lib)).toBe(1);
  });

  it('restoring an article brings back what was deleted with it, not a markup removed before (Review Focus 1)', async () => {
    const { lib, articleId, kept, early } = await sample();
    await deleteMarkup(lib, early);
    await deleteArticle(lib, articleId);
    await restoreRows(lib, await trashEntryRows(lib, 'article', articleId));
    expect((await listArticles(lib)).map((a) => a.id)).toEqual([articleId]);
    expect((await listMarkups(lib, articleId)).map((m) => m.id)).toEqual([kept]);
    expect((await search(lib.driver, { text: '起兴' })).map((h) => h.entityType)).toEqual(['side_note']);
    expect(await listTrash(lib)).toEqual([]);
  });

  it('restoring a tag brings back its place in the tree and its taggings', async () => {
    const { lib, noteId, parent, child } = await sample();
    await deleteTag(lib, child);
    expect(await listTrash(lib)).toEqual([expect.objectContaining({ kind: 'tag', id: child, title: '修辞', taggings: 1 })]);
    await restoreRows(lib, await trashEntryRows(lib, 'tag', child));
    expect((await listEdges(lib)).map((e) => [e.parent_id, e.child_id])).toEqual([[parent, child]]);
    expect(await tagsOf(lib, 'side_note', noteId)).toEqual([child]);
  });

  it('lists deleted memos too, newest deletion first', async () => {
    const { lib, articleId } = await sample();
    const first = await createMemo(lib, { title: '甲', homeArticleId: articleId });
    const last = await createMemo(lib, { title: '乙', homeArticleId: null });
    await deleteMemo(lib, first);
    await deleteArticle(lib, articleId);
    await deleteMemo(lib, last);
    expect((await listTrash(lib)).map((e) => [e.kind, e.id])).toEqual([
      ['memo', last],
      ['article', articleId],
      ['memo', first],
    ]);
    expect(await trashEntryRows(lib, 'memo', 'no-such-memo')).toEqual([]);
  });

  it('a restored tag whose name is taken merges into the other one and leaves nothing in the Trash (Review Focus 3)', async () => {
    const { lib, child } = await sample();
    await deleteTag(lib, child);
    await createTag(lib, { name: '修辞' });
    await restoreRows(lib, await trashEntryRows(lib, 'tag', child));
    expect((await listTags(lib)).filter((t) => t.name === '修辞')).toHaveLength(1);
    expect(await listTrash(lib)).toEqual([]);
  });
});
```

In `packages/db/src/tags.test.ts`, in 'repairs cycles and duplicate names that arrive from other devices', add at the end:
```ts
    // The merged-away tag lives on in the kept one: erased, so it never shows in the Trash.
    expect(await lib.driver.query('SELECT deleted FROM tag WHERE id = ?', ['zzz-dup'])).toEqual([{ deleted: 2 }]);
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/trash.test.ts packages/db/src/tags.test.ts`
Expected:
- `trash.test.ts` fails with `Cannot find module './trash'`;
- `tags.test.ts` fails with `expected [ { deleted: 1 } ] to deeply equal [ { deleted: 2 } ]`.

- [ ] **Step 2: Implement**

`packages/db/src/trash.ts`:
```ts
import { parseHlc, type SyncedTable } from '@jot/core';
import type { RowRef } from './exchange';
import type { Library } from './library';

export type TrashKind = 'article' | 'memo' | 'tag';

/** A deleted article, memo or tag, as the Trash lists it (spec §6.9). */
export interface TrashEntry {
  kind: TrashKind;
  id: string;
  /** The article's or memo's title, or the tag's name. */
  title: string;
  /** When it was deleted: the millisecond part of its `deleted` field's clock. */
  deletedAt: number;
  /** What comes back with it: an article's markups and side notes, a tag's taggings. */
  markups: number;
  sideNotes: number;
  taggings: number;
}

export const TABLE: Record<TrashKind, SyncedTable> = { article: 'article', memo: 'memo', tag: 'tag' };
const TITLE: Record<TrashKind, string> = { article: 'title', memo: 'title', tag: 'name' };

/** The clock of a row's `deleted` field (every deletion stamps it; `hlc` is a fallback). */
export const DELETED_CLOCK = `coalesce(json_extract(fhlc, '$.deleted'), hlc)`;

/** Where an entry's children live; they belong to it when deleted with it (spec §6.9). */
const CHILDREN: Record<TrashKind, { table: SyncedTable; where: string; params: (id: string) => string[] }[]> = {
  article: [
    { table: 'markup', where: 'article_id = ?', params: (id) => [id] },
    { table: 'anchor', where: 'article_id = ?', params: (id) => [id] },
    { table: 'side_note', where: 'article_id = ?', params: (id) => [id] },
  ],
  tag: [
    { table: 'tag_edge', where: '(parent_id = ? OR child_id = ?)', params: (id) => [id, id] },
    { table: 'tagging', where: 'tag_id = ?', params: (id) => [id] },
  ],
  memo: [],
};

/** The entry's `deleted` clock, or null when it isn't in the Trash. */
export async function deletedClock(lib: Library, kind: TrashKind, id: string): Promise<string | null> {
  const [row] = await lib.driver.query<{ clock: string }>(
    `SELECT ${DELETED_CLOCK} AS clock FROM "${TABLE[kind]}" WHERE id = ? AND deleted = 1`,
    [id],
  );
  return row?.clock ?? null;
}

/**
 * The children deleted together with an entry: deleting commits the entry first and its children after it,
 * so their `deleted` clocks are not older than the entry's. A child removed earlier on its own is older.
 */
async function deletedWith(lib: Library, kind: TrashKind, id: string, clock: string): Promise<RowRef[]> {
  const out: RowRef[] = [];
  for (const child of CHILDREN[kind]) {
    const rows = await lib.driver.query<{ id: string }>(
      `SELECT id FROM "${child.table}" WHERE ${child.where} AND deleted = 1 AND ${DELETED_CLOCK} >= ? ORDER BY id`,
      [...child.params(id), clock],
    );
    out.push(...rows.map((r) => ({ table: child.table, id: r.id })));
  }
  return out;
}

/** The Trash (spec §6.9): deleted articles, memos and tags, newest deletion first. */
export async function listTrash(lib: Library): Promise<TrashEntry[]> {
  const entries: (TrashEntry & { clock: string })[] = [];
  for (const kind of ['article', 'memo', 'tag'] as const) {
    const rows = await lib.driver.query<{ id: string; title: string; clock: string }>(
      `SELECT id, "${TITLE[kind]}" AS title, ${DELETED_CLOCK} AS clock FROM "${TABLE[kind]}" WHERE deleted = 1`,
    );
    for (const r of rows) {
      const children = await deletedWith(lib, kind, r.id, r.clock);
      const count = (table: SyncedTable) => children.filter((c) => c.table === table).length;
      entries.push({
        kind,
        id: r.id,
        title: r.title,
        deletedAt: parseHlc(r.clock).ms,
        markups: count('markup'),
        sideNotes: count('side_note'),
        taggings: count('tagging'),
        clock: r.clock,
      });
    }
  }
  entries.sort((a, b) => (a.clock < b.clock ? 1 : a.clock > b.clock ? -1 : 0));
  return entries.map(({ clock: _clock, ...entry }) => entry);
}

export async function countTrash(lib: Library): Promise<number> {
  const [row] = await lib.driver.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM article WHERE deleted = 1) + (SELECT count(*) FROM memo WHERE deleted = 1)
          + (SELECT count(*) FROM tag WHERE deleted = 1) AS n`,
  );
  return Number(row?.n ?? 0);
}

/** An entry and everything deleted with it — what `restoreRows` brings back. Empty when it isn't in the Trash. */
export async function trashEntryRows(lib: Library, kind: TrashKind, id: string): Promise<RowRef[]> {
  const clock = await deletedClock(lib, kind, id);
  if (clock === null) return [];
  return [{ table: TABLE[kind], id }, ...(await deletedWith(lib, kind, id, clock))];
}
```

If lint rejects the unused `_clock` binding, replace the last two lines of `listTrash` with:
```ts
  entries.sort((a, b) => (a.clock < b.clock ? 1 : a.clock > b.clock ? -1 : 0));
  return entries.map((e): TrashEntry => ({ kind: e.kind, id: e.id, title: e.title, deletedAt: e.deletedAt, markups: e.markups, sideNotes: e.sideNotes, taggings: e.taggings }));
```

In `packages/db/src/tags.ts`, in `repairTagGraph`, replace
```ts
      for (const id of dropped) inputs.push({ table: 'tag', id, fields: { deleted: 1 } });
```
with
```ts
      // A merged-away tag lives on in the kept one: erased, not deleted, so it never shows in the Trash (§6.9).
      for (const id of dropped) inputs.push({ table: 'tag', id, fields: { deleted: 2 } });
```

Append to `packages/db/src/index.ts`:
```ts
export * from './trash';
```

In `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` §6.4, find the sentence about two tags sharing a name (it says they're merged into the one with the smaller ID). Add this sentence after it: `The merged-away tag is erased (§6.9), not deleted, so it never shows in the Trash.`

- [ ] **Step 3: Run the tests, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db && pnpm test && pnpm typecheck && pnpm lint'`
Expected: the 5 new Trash tests and the changed tag test pass, everything else stays green, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db docs/superpowers/specs/2026-09-27-jot-core-app-design.md
git commit -m "feat(db): the Trash lists deleted articles, memos and tags, and restores each with what was deleted with it"
```

---

### Task 2: Delete forever, Empty Trash, and no erased content from imports

**Files:**
- Modify:
  - `packages/db/src/trash.ts`
  - `packages/db/src/trash.test.ts`
  - `packages/db/src/exchange.ts`
- Test: `packages/db/src/trash.test.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `TrashKind`, `TABLE`, `deletedClock` and `listTrash`;
  - `OpInput` from `library.ts`.
- Produces:
  - `eraseTrashEntries(lib, entries: readonly { kind: TrashKind; id: string }[]): Promise<void>`. It erases only entries still in the Trash, all in one commit.
  - `removeErasedContent(lib): Promise<void>`. It's local only; `importLibrary` now calls it right after the merge.

- [ ] **Step 1: Write the failing tests**

In `packages/db/src/trash.test.ts`:
1. Change the imports:
   - `./trash` → `import { countTrash, eraseTrashEntries, listTrash, trashEntryRows } from './trash';`
   - `./exchange` → `import { decodeExport, encodeExport, exportLibrary, importLibrary, restoreRows } from './exchange';`
   - `./memos` → `import { appendMemoUpdate, createMemo, deleteMemo } from './memos';`
2. Append:
```ts
describe('Delete forever', () => {
  it('erases an article with everything that belongs to it, leaving bare markers', async () => {
    const { lib, articleId, early } = await sample();
    await deleteMarkup(lib, early);
    await deleteArticle(lib, articleId);
    await eraseTrashEntries(lib, [{ kind: 'article', id: articleId }]);
    expect(await listTrash(lib)).toEqual([]);
    expect(await lib.driver.query('SELECT title, author, source, deleted FROM article WHERE id = ?', [articleId])).toEqual([
      { title: '', author: null, source: null, deleted: 2 },
    ]);
    const left = (sql: string) => lib.driver.query(sql, [articleId]);
    expect(await left('SELECT id FROM article_revision WHERE article_id = ?')).toEqual([]);
    expect(await left("SELECT id FROM anchor WHERE article_id = ? AND (exact <> '' OR prefix <> '' OR suffix <> '' OR deleted <> 2)")).toEqual([]);
    expect(await left('SELECT id FROM markup WHERE article_id = ? AND deleted <> 2')).toEqual([]);
    expect(await left("SELECT id FROM side_note WHERE article_id = ? AND (body <> '' OR deleted <> 2)")).toEqual([]);
    expect(await left('SELECT id FROM tagging WHERE article_id = ? AND deleted <> 2')).toEqual([]);
  });

  it('only erases entries that are in the Trash', async () => {
    const { lib, articleId } = await sample();
    await eraseTrashEntries(lib, [{ kind: 'article', id: articleId }]);
    expect((await listArticles(lib)).map((a) => a.id)).toEqual([articleId]);
  });

  it('Empty Trash erases every entry: a memo loses its writing, a tag its name', async () => {
    const { lib, articleId, child } = await sample();
    const memoId = await createMemo(lib, { title: '札记', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, Uint8Array.from([1, 2]), { text: '论比喻', links: [] });
    await deleteMemo(lib, memoId);
    await deleteTag(lib, child);
    await deleteArticle(lib, articleId);
    await eraseTrashEntries(lib, await listTrash(lib));
    expect(await countTrash(lib)).toBe(0);
    expect(await lib.driver.query('SELECT title, deleted FROM memo WHERE id = ?', [memoId])).toEqual([{ title: '', deleted: 2 }]);
    expect(await lib.driver.query('SELECT id FROM memo_update WHERE memo_id = ?', [memoId])).toEqual([]);
    expect(await lib.driver.query('SELECT memo_id FROM memo_cache WHERE memo_id = ?', [memoId])).toEqual([]);
    expect(await lib.driver.query('SELECT name, deleted FROM tag WHERE id = ?', [child])).toEqual([{ name: '', deleted: 2 }]);
    expect(await search(lib.driver, { text: '比喻' })).toEqual([]);
  });

  it('an older backup brings no erased content back, and offers nothing to restore (Review Focus 2)', async () => {
    const { lib, articleId } = await sample();
    const file = decodeExport(encodeExport(await exportLibrary(lib)));
    await deleteArticle(lib, articleId);
    await eraseTrashEntries(lib, [{ kind: 'article', id: articleId }]);
    const result = await importLibrary(lib, file);
    expect(result.deletedHereRows).toEqual([]);
    expect(result.changed).toEqual({ articles: 0, markups: 0, sideNotes: 0, memos: 0, tags: 0 });
    expect(await lib.driver.query('SELECT id FROM article_revision WHERE article_id = ?', [articleId])).toEqual([]);
    expect(await search(lib.driver, { text: '比喻' })).toEqual([]);
    expect(await listTrash(lib)).toEqual([]);
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/trash.test.ts`
Expected: FAIL with `eraseTrashEntries is not a function`; Task 1's tests still pass.

- [ ] **Step 2: Implement**

In `packages/db/src/trash.ts`:
1. Change the imports to:
```ts
import { parseHlc, type SqlValue, type SyncedTable } from '@jot/core';
import type { RowRef } from './exchange';
import type { Library, OpInput } from './library';
```
2. Append:
```ts
/** Every row that belongs to an entry, whatever its deletion state (already erased rows left out). */
async function belongingRows(lib: Library, kind: TrashKind, id: string): Promise<RowRef[]> {
  const rows = async (table: SyncedTable, where: string, params: string[]) =>
    (await lib.driver.query<{ id: string }>(`SELECT id FROM "${table}" WHERE (${where}) AND deleted <> 2 ORDER BY id`, params)).map(
      (r): RowRef => ({ table, id: r.id }),
    );
  switch (kind) {
    case 'article':
      return [
        ...(await rows('markup', 'article_id = ?', [id])),
        ...(await rows('anchor', 'article_id = ?', [id])),
        ...(await rows('side_note', 'article_id = ?', [id])),
        ...(await rows('tagging', "article_id = ? OR (entity_type = 'article' AND entity_id = ?)", [id, id])),
      ];
    case 'tag':
      return [...(await rows('tag_edge', 'parent_id = ? OR child_id = ?', [id, id])), ...(await rows('tagging', 'tag_id = ?', [id]))];
    case 'memo':
      return [];
  }
}

/** The text an erase blanks (spec §6.9); rows without text are only marked erased. */
const BLANK: Partial<Record<SyncedTable, Record<string, SqlValue>>> = {
  article: { title: '', author: null, source: null },
  anchor: { exact: '', prefix: '', suffix: '' },
  side_note: { body: '' },
  memo: { title: '' },
  tag: { name: '' },
};

/**
 * Delete forever (spec §6.9): erases each entry still in the Trash with everything that belongs to it, in
 * one commit — `deleted: 2` and blank text, as a fresh edit that sync will carry — then removes the rows
 * that can't be edited.
 */
export async function eraseTrashEntries(lib: Library, entries: readonly { kind: TrashKind; id: string }[]): Promise<void> {
  const ops = new Map<string, OpInput>();
  for (const entry of entries) {
    if ((await deletedClock(lib, entry.kind, entry.id)) === null) continue;
    for (const row of [{ table: TABLE[entry.kind], id: entry.id }, ...(await belongingRows(lib, entry.kind, entry.id))]) {
      ops.set(`${row.table}:${row.id}`, { table: row.table, id: row.id, fields: { ...BLANK[row.table], deleted: 2 } });
    }
  }
  if (ops.size === 0) return;
  await lib.commit([...ops.values()]);
  await removeErasedContent(lib);
  lib.announce();
}

/**
 * Removes on this device what an erase can't blank (spec §6.9): erased articles' revisions, erased memos'
 * updates, cache and links, and erased anchors' positions. Runs after every erase and every import, so a
 * file can't bring erased content back.
 */
export async function removeErasedContent(lib: Library): Promise<void> {
  await lib.driver.batch([
    { sql: 'DELETE FROM article_revision WHERE article_id IN (SELECT id FROM article WHERE deleted = 2)' },
    { sql: 'DELETE FROM memo_update WHERE memo_id IN (SELECT id FROM memo WHERE deleted = 2)' },
    { sql: 'DELETE FROM memo_cache WHERE memo_id IN (SELECT id FROM memo WHERE deleted = 2)' },
    { sql: 'DELETE FROM memo_link WHERE memo_id IN (SELECT id FROM memo WHERE deleted = 2)' },
    { sql: 'DELETE FROM anchor_res WHERE anchor_id IN (SELECT id FROM anchor WHERE deleted = 2)' },
  ]);
}
```

In `packages/db/src/exchange.ts`:
1. Add `import { removeErasedContent } from './trash';` after the `./tags` import.
2. In `importLibrary`, replace
```ts
  await lib.applyRows(data.rows);
  const after = await rowClocks(lib);
```
with
```ts
  await lib.applyRows(data.rows);
  // Erased here, or erased in the file: its content rows are removed again before anything is counted.
  await removeErasedContent(lib);
  const after = await rowClocks(lib);
```

`trash.ts` imports only the type from `exchange.ts`, so the modules don't import each other at runtime.

- [ ] **Step 3: Run the tests, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db && pnpm test && pnpm typecheck && pnpm lint'`
Expected: the 4 new tests pass, `exchange.test.ts` stays green, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "feat(db): delete forever and empty the Trash, erasing content; imports never bring erased content back"
```

---

### Task 3: The memo list and links into the Trash (database)

**Files:**
- Create: `packages/db/src/memoList.test.ts`
- Modify: `packages/db/src/memos.ts`
- Test: `packages/db/src/memoList.test.ts`

**Interfaces:**
- Consumes: `eraseTrashEntries` from Task 2 (in the test).
- Produces:
  - `interface MemoListItem { id: string; title: string; homeArticleId: string | null; homeTitle: string | null }`
  - `listAllMemos(lib): Promise<MemoListItem[]>` lists every live memo, most recently edited first. `homeTitle` is null when the home article is unset, deleted or erased.
  - `linkTargetStatus(lib, targetType: LinkTargetType, targetId: string): Promise<'trash' | 'gone'>`

- [ ] **Step 1: Write the failing tests**

`packages/db/src/memoList.test.ts`:
```ts
import { captureAnchor, type Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, getArticle } from './articles';
import { Library } from './library';
import { createMarkup, deleteMarkup } from './markups';
import { appendMemoUpdate, createMemo, createQuote, deleteMemo, linkTargetStatus, listAllMemos } from './memos';
import { eraseTrashEntries } from './trash';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));
let tick = 1000;
const open = () => Library.open(createNodeDriver(), { now: () => tick++ });

describe('listAllMemos', () => {
  it('lists every live memo, most recently edited first, with its home article or none (Review Focus 4)', async () => {
    const lib = await open();
    const spring = (await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('春风') })).articleId;
    const autumn = (await createArticle(lib, { title: '秋', importKind: 'paste', blocks: paras('秋水') })).articleId;
    const a = await createMemo(lib, { title: '甲', homeArticleId: spring });
    const b = await createMemo(lib, { title: '乙', homeArticleId: autumn });
    const c = await createMemo(lib, { title: '丙', homeArticleId: null });
    const gone = await createMemo(lib, { title: '丁', homeArticleId: spring });
    await deleteMemo(lib, gone);
    await appendMemoUpdate(lib, a, Uint8Array.from([1]), { text: '', links: [] });
    await deleteArticle(lib, autumn);
    expect(await listAllMemos(lib)).toEqual([
      { id: a, title: '甲', homeArticleId: spring, homeTitle: '春' },
      { id: c, title: '丙', homeArticleId: null, homeTitle: null },
      { id: b, title: '乙', homeArticleId: autumn, homeTitle: null },
    ]);
  });
});

describe('linkTargetStatus', () => {
  it('tells a target in the Trash from one that is gone (Review Focus 5)', async () => {
    const lib = await open();
    const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('他用比喻写春天。') });
    const text = (await getArticle(lib, articleId))!.text;
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 0, 2) });
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
    const { markupId: removed } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 5, 7), style: 'bold' });
    await deleteMarkup(lib, removed);
    expect(await linkTargetStatus(lib, 'markup', removed)).toBe('gone');

    await deleteArticle(lib, articleId);
    expect(await linkTargetStatus(lib, 'anchor', quoteId)).toBe('trash');
    expect(await linkTargetStatus(lib, 'markup', markupId)).toBe('trash');

    await eraseTrashEntries(lib, [{ kind: 'article', id: articleId }]);
    expect(await linkTargetStatus(lib, 'anchor', quoteId)).toBe('gone');
    expect(await linkTargetStatus(lib, 'anchor', 'no-such-anchor')).toBe('gone');
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/memoList.test.ts`
Expected: FAIL: `listAllMemos` and `linkTargetStatus` are not exported (`is not a function`).

- [ ] **Step 2: Implement**

In `packages/db/src/memos.ts`:
1. After the `MemoSummary` interface, add:
```ts
/** A memo in the sidebar's memo list (spec §6.9). */
export interface MemoListItem {
  id: string;
  title: string;
  homeArticleId: string | null;
  /** The home article's title, or null when it is unset, deleted or erased. */
  homeTitle: string | null;
}
```
2. After `getMemo`, add:
```ts
/** Every live memo, most recently edited first: the newest of the memo row's clock and its updates' clocks. */
export function listAllMemos(lib: Library): Promise<MemoListItem[]> {
  return lib.driver.query<MemoListItem>(
    `SELECT m.id, m.title, m.home_article_id AS homeArticleId, CASE WHEN a.deleted = 0 THEN a.title END AS homeTitle
     FROM memo m LEFT JOIN article a ON a.id = m.home_article_id
     WHERE m.deleted = 0
     ORDER BY max(m.hlc, coalesce((SELECT max(u.hlc) FROM memo_update u WHERE u.memo_id = m.id), '')) DESC, m.id DESC`,
  );
}
```
3. After `TARGET_ANCHOR_BY_TYPE`, add:
```ts
/** The anchor a link points at, whatever its deletion state. */
const ANY_ANCHOR_BY_TYPE: Record<LinkTargetType, string> = {
  anchor: 'SELECT ?',
  markup: 'SELECT anchor_id FROM markup WHERE id = ?',
  side_note: 'SELECT k.anchor_id FROM side_note n JOIN markup k ON k.id = n.markup_id WHERE n.id = ?',
};

/**
 * Why a link's target can't be shown (spec §6.9): 'trash' when its article is in the Trash, otherwise
 * 'gone' (erased, removed on its own, or never here).
 */
export async function linkTargetStatus(lib: Library, targetType: LinkTargetType, targetId: string): Promise<'trash' | 'gone'> {
  const [row] = await lib.driver.query<{ deleted: number }>(
    `SELECT ar.deleted FROM anchor a JOIN article ar ON ar.id = a.article_id WHERE a.id = (${ANY_ANCHOR_BY_TYPE[targetType]})`,
    [targetId],
  );
  return row?.deleted === 1 ? 'trash' : 'gone';
}
```

- [ ] **Step 3: Run the tests, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db/src/memoList.test.ts && pnpm test && pnpm typecheck && pnpm lint'`
Expected: 2 passed; everything else green.

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "feat(db): list every memo for the sidebar, and tell links into the Trash from gone ones"
```

---

### Task 4: The Trash view and button

**Files:**
- Create: `apps/client/src/components/Trash.tsx`, `apps/client/e2e/trash.spec.ts`
- Modify:
  - `apps/client/src/router.ts`, `apps/client/src/router.test.ts`
  - `apps/client/src/components/Shell.tsx`
  - `apps/client/src/components/Sidebar.tsx`
  - `apps/client/src/i18n/en.ts`, `apps/client/src/i18n/zh-CN.ts`
  - `apps/client/src/styles/app.css`
- Test: `apps/client/src/router.test.ts`, `apps/client/e2e/trash.spec.ts`

**Interfaces:**
- Consumes:
  - from Tasks 1–2: `listTrash`, `countTrash`, `trashEntryRows`, `eraseTrashEntries` and `TrashEntry`;
  - from plan 6: `restoreLibraryItems(lib, rows)` in `data/libraryFile.ts`, and `showNotice`.
- Produces:
  - Route `{ name: 'trash' }` ⇄ `#/trash`.
  - `<TrashView />`, with test IDs `trash-view`, `trash-entry`, `trash-restore`, `trash-erase`, `trash-empty` and `trash-none`.
  - `<TrashButton />` in the sidebar footer, with test IDs `trash-open` and `trash-count` (the count shows only when there are entries).
  - New i18n `trash` block. `library.confirmDelete`, `memo.confirmDelete` and `tags.confirmDelete` now say "Move … to the Trash".

- [ ] **Step 1: Write the failing tests**

In `apps/client/src/router.test.ts`:
- in 'parses the known routes and falls back to home', add `expect(parseHash('#/trash')).toEqual({ name: 'trash' });`
- in 'round-trips every route', add `{ name: 'trash' }` to `routes`.

`apps/client/e2e/trash.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

/** Accepts every confirmation (moving to the Trash, erasing) and keeps their texts. */
function acceptDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on('dialog', (dialog) => {
    seen.push(dialog.message());
    void dialog.accept();
  });
  return seen;
}

async function deleteArticle(page: Page, title: string): Promise<void> {
  const row = page.locator('.library li').filter({ hasText: title });
  await row.hover();
  await row.getByRole('button', { name: 'Delete' }).click();
}

async function deleteTag(page: Page, name: string): Promise<void> {
  await page.locator(`[data-testid="tag-row"][data-tag="${name}"]`).first().getByTestId('tag-menu').click();
  await page.getByTestId('tag-delete').click();
}

/** 春, with a highlight on 比喻 carrying the side note 以景起兴 tagged 修辞. */
async function articleWithNote(page: Page): Promise<void> {
  await importText(page, '春', '春风又绿江南岸。他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await addTag(page, 'note-tags', '修辞');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
}

test('a deleted article waits in the Trash, and restoring brings back its markups and side notes (spec §10 step 7)', async ({ page }) => {
  await openApp(page);
  const prompts = acceptDialogs(page);
  await articleWithNote(page);
  await deleteArticle(page, '春');
  expect(prompts.at(-1)).toContain('to the Trash');
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('trash-count')).toHaveText('1');

  await page.getByTestId('trash-open').click();
  const entry = page.getByTestId('trash-entry');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('春');
  await expect(entry).toContainText('markups: 1, side notes: 1');
  await entry.getByTestId('trash-restore').click();
  await expect(page.getByTestId('trash-none')).toBeVisible();
  await expect(page.getByTestId('trash-count')).toHaveCount(0);

  await page.getByRole('link', { name: '春' }).click();
  await expect(page.locator('.mk-highlight')).toHaveText(['比喻']);
  await expect(page.getByTestId('side-note').locator('textarea')).toHaveValue('以景起兴');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
});

test('restoring a tag puts it back on the side note', async ({ page }) => {
  await openApp(page);
  acceptDialogs(page);
  await articleWithNote(page);
  await deleteTag(page, '修辞');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveCount(0);
  await page.getByTestId('trash-open').click();
  await expect(page.getByTestId('trash-entry')).toContainText('taggings: 1');
  await page.getByTestId('trash-entry').getByTestId('trash-restore').click();
  await expect(page.getByTestId('trash-none')).toBeVisible();
  await page.getByRole('link', { name: '春' }).click();
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
});

test('Delete forever and Empty Trash leave the Trash empty, and search finds nothing of it (spec §10 step 7)', async ({ page }) => {
  await openApp(page);
  const prompts = acceptDialogs(page);
  await articleWithNote(page);
  await deleteArticle(page, '春');
  await deleteTag(page, '修辞');
  await expect(page.getByTestId('trash-count')).toHaveText('2');
  await page.getByTestId('trash-open').click();
  await expect(page.getByTestId('trash-entry')).toHaveCount(2);
  await page.getByTestId('trash-entry').filter({ hasText: '修辞' }).getByTestId('trash-erase').click();
  expect(prompts.at(-1)).toContain('forever');
  await expect(page.getByTestId('trash-entry')).toHaveCount(1);
  await page.getByTestId('trash-empty').click();
  await expect(page.getByTestId('trash-none')).toBeVisible();
  await expect(page.getByTestId('trash-count')).toHaveCount(0);
  await page.getByTestId('search-input').fill('春风');
  await expect(page.getByTestId('search-empty')).toBeVisible();
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/router.test.ts`
Expected: FAIL: `#/trash` parses to `{ name: 'home' }`.

Restart the services as the Global Constraints say, then run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e trash --project chromium --timeout 20000`
Expected: FAIL: there is no `trash-count`.

- [ ] **Step 2: Implement the route and the view**

In `apps/client/src/router.ts`:
- `export type Route = { name: 'home' } | { name: 'article'; id: string } | { name: 'diagnostics' } | { name: 'trash' };`
- in `parseHash`, after the diagnostics line: `if (path === 'trash') return { name: 'trash' };`
- in `routeHash`, add the case:
```ts
    case 'trash':
      return '#/trash';
```

`apps/client/src/components/Trash.tsx`:
```tsx
import { countTrash, eraseTrashEntries, listTrash, trashEntryRows, type TrashEntry, type TrashKind } from '@jot/db';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { restoreLibraryItems } from '../data/libraryFile';
import { showNotice } from '../data/notices';
import { routeHash } from '../router';

const TRASH_TABLES = ['article', 'memo', 'tag', 'markup', 'side_note', 'anchor', 'tagging', 'tag_edge'] as const;
const KIND_LABEL = { article: 'trash.kindArticle', memo: 'trash.kindMemo', tag: 'trash.kindTag' } as const satisfies Record<TrashKind, string>;

/** The Trash (spec §6.9): deleted articles, memos and tags, newest first, to restore or erase. */
export function TrashView() {
  const { t, i18n } = useTranslation();
  const lib = useLibrary();
  const { data: entries, error } = useLibraryQuery(listTrash, [], TRASH_TABLES);
  const [busy, setBusy] = useState(false);

  const run = (work: () => Promise<void>) => {
    setBusy(true);
    work()
      .catch(reportError)
      .finally(() => setBusy(false));
  };
  const name = (e: TrashEntry) => e.title || t('trash.untitled');
  const restore = (e: TrashEntry) =>
    run(async () => {
      await restoreLibraryItems(lib, await trashEntryRows(lib, e.kind, e.id));
      showNotice(t('trash.restored', { title: name(e) }));
    });
  const erase = (e: TrashEntry) => {
    if (window.confirm(t('trash.confirmErase', { title: name(e) }))) run(() => eraseTrashEntries(lib, [e]));
  };
  const empty = () => {
    if (entries?.length && window.confirm(t('trash.confirmEmpty', { count: entries.length }))) run(() => eraseTrashEntries(lib, entries));
  };
  const comesBack = (e: TrashEntry) => {
    if (e.kind === 'article' && e.markups + e.sideNotes > 0) return t('trash.withArticle', { markups: e.markups, sideNotes: e.sideNotes });
    if (e.kind === 'tag' && e.taggings > 0) return t('trash.withTag', { taggings: e.taggings });
    return null;
  };

  return (
    <section className="trash" data-testid="trash-view">
      <header className="trash-header">
        <h1>{t('trash.heading')}</h1>
        <button type="button" disabled={busy || !entries?.length} onClick={empty} data-testid="trash-empty">
          {t('trash.empty')}
        </button>
      </header>
      <p className="muted">{t('trash.hint')}</p>
      {error && (
        <p className="error" role="alert">
          {t('app.error')} {error.message}
        </p>
      )}
      {entries?.length === 0 && (
        <p className="muted" data-testid="trash-none">
          {t('trash.none')}
        </p>
      )}
      <ul className="trash-list">
        {entries?.map((e) => (
          <li key={`${e.kind}:${e.id}`} data-testid="trash-entry">
            <div className="trash-entry">
              <span className="trash-kind">{t(KIND_LABEL[e.kind])}</span>
              <strong>{name(e)}</strong>
              {comesBack(e) && <span className="muted">{comesBack(e)}</span>}
              <span className="muted">{t('trash.deletedAt', { when: new Date(e.deletedAt).toLocaleString(i18n.language) })}</span>
            </div>
            <div className="trash-actions">
              <button type="button" disabled={busy} onClick={() => restore(e)} data-testid="trash-restore">
                {t('trash.restore')}
              </button>
              <button type="button" className="quiet" disabled={busy} onClick={() => erase(e)} data-testid="trash-erase">
                {t('trash.erase')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The Trash button at the bottom of the sidebar, with the number of entries. */
export function TrashButton() {
  const { t } = useTranslation();
  const { data: count } = useLibraryQuery(countTrash, [], ['article', 'memo', 'tag']);
  return (
    <a className="icon trash-open" href={routeHash({ name: 'trash' })} aria-label={t('trash.open')} title={t('trash.open')} data-testid="trash-open">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />
      </svg>
      {count ? (
        <span className="trash-count" data-testid="trash-count">
          {count}
        </span>
      ) : null}
    </a>
  );
}
```

In `apps/client/src/components/Shell.tsx`:
- add `import { TrashView } from './Trash';` after the `./Splitter` import;
- replace the `<main className="reader">…</main>` contents with:
```tsx
            {route.name === 'trash' ? (
              <TrashView />
            ) : activeId ? (
              <ArticlePane key={activeId} articleId={activeId} />
            ) : (
              <p className="empty">{t('article.none')}</p>
            )}
```

In `apps/client/src/components/Sidebar.tsx`:
- add `import { TrashButton } from './Trash';` after the `./TagTree` import;
- in the footer, add `<TrashButton />` after `<SettingsMenu />`.

In `apps/client/src/i18n/en.ts`:
- `library.confirmDelete`: `'Move “{{title}}” to the Trash? Its markups and side notes go with it; its memos stay in the library.'`
- `memo.confirmDelete`: `'Move “{{title}}” to the Trash?'`
- `tags.confirmDelete`: `'Move the tag “{{name}}” to the Trash? Until it is restored it is removed from every item; its subtags stay.'`
- after the `settings` block, add:
```ts
  trash: {
    open: 'Trash',
    heading: 'Trash',
    hint: 'Deleted articles, memos and tags stay here until you restore them or delete them forever.',
    none: 'The Trash is empty.',
    empty: 'Empty Trash',
    restore: 'Restore',
    erase: 'Delete forever',
    untitled: '(untitled)',
    kindArticle: 'Article',
    kindMemo: 'Memo',
    kindTag: 'Tag',
    withArticle: 'With markups: {{markups}}, side notes: {{sideNotes}}',
    withTag: 'With taggings: {{taggings}}',
    deletedAt: 'Deleted {{when}}',
    restored: 'Restored “{{title}}”.',
    confirmErase: 'Delete “{{title}}” forever? Its content is erased from this device and can’t be restored.',
    confirmEmpty: 'Delete all {{count}} items in the Trash forever? Their content is erased from this device and can’t be restored.',
  },
```

In `apps/client/src/i18n/zh-CN.ts`:
- `library.confirmDelete`: `'把《{{title}}》移到回收站？其中的标注和旁注一并移入，札记保留在文库中。'`
- `memo.confirmDelete`: `'把《{{title}}》移到回收站？'`
- `tags.confirmDelete`: `'把标签“{{name}}”移到回收站？恢复之前，所有条目上的这个标签都会移除；下级标签保留。'`
- after the `settings` block, add:
```ts
  trash: {
    open: '回收站',
    heading: '回收站',
    hint: '删除的文章、札记和标签会留在这里，直到你恢复或永久删除它们。',
    none: '回收站是空的。',
    empty: '清空回收站',
    restore: '恢复',
    erase: '永久删除',
    untitled: '（无标题）',
    kindArticle: '文章',
    kindMemo: '札记',
    kindTag: '标签',
    withArticle: '连同标注 {{markups}} 条、旁注 {{sideNotes}} 条',
    withTag: '连同 {{taggings}} 处标签',
    deletedAt: '删除于 {{when}}',
    restored: '已恢复《{{title}}》。',
    confirmErase: '永久删除《{{title}}》？其内容会从本机抹去，无法恢复。',
    confirmEmpty: '永久删除回收站中的全部 {{count}} 项？其内容会从本机抹去，无法恢复。',
  },
```

In `apps/client/src/styles/app.css`:
- change `.sidebar footer { margin-top: auto; font-size: 13px; color: var(--muted); }` to `.sidebar footer { margin-top: auto; display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--muted); }`
- append:
```css
/* Trash */
.trash-open { position: relative; display: inline-flex; align-items: center; gap: 2px; text-decoration: none; }
.trash-count { min-width: 16px; padding: 0 4px; font-size: 11px; line-height: 16px; text-align: center; color: var(--bg); background: var(--muted); border-radius: 8px; }
.trash { max-width: 720px; padding: 32px 48px; }
.trash-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.trash-header h1 { margin: 0; font-size: 22px; }
.trash-list { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.trash-list > li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; }
.trash-entry { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.trash-entry strong { overflow-wrap: anywhere; }
.trash-kind { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.trash-actions { display: flex; gap: 8px; flex: none; }
```

- [ ] **Step 3: Run the unit tests, then the Trash end-to-end tests on both browsers plus regressions**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e trash data tags tagtree memo shell`
Expected:
- `trash` passes 3 on each browser;
- the other specs are unchanged; they don't read the delete confirmation texts.

- [ ] **Step 4: Commit**

```bash
git add apps/client
git commit -m "feat(client): the Trash view and button: restore, delete forever, empty"
```

---

### Task 5: The sidebar memo list, links into the Trash, and docs

**Files:**
- Create: `apps/client/src/components/MemoList.tsx`, `apps/client/e2e/memolist.spec.ts`
- Modify:
  - `apps/client/src/components/Sidebar.tsx`
  - `apps/client/src/components/Shell.tsx` (link following)
  - `apps/client/src/i18n/en.ts`, `apps/client/src/i18n/zh-CN.ts`
  - `apps/client/src/styles/app.css`
  - `README.md`
- Test: `apps/client/e2e/memolist.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 3: `listAllMemos`, `MemoListItem` and `linkTargetStatus`;
  - `MemoBridge.showMemo(id)` (plan 3).
- Produces:
  - `<MemoList />` between the Library list and the tag tree, with test IDs `memo-list`, `memo-list-item` and `memo-list-empty`.
  - i18n `memoList` block and `memo.targetInTrash`.

- [ ] **Step 1: Write the failing test**

`apps/client/e2e/memolist.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

test('a memo outlives its article: the memo list keeps it, it still opens, and its link says the passage is in the Trash (Review Focus 4, 5)', async ({ page }) => {
  await openApp(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await importText(page, '春', '春风又绿江南岸。');
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.insertText('写景起笔');
  await page.waitForTimeout(1_000);

  const item = page.getByTestId('memo-list-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Memo 1');
  await expect(item).toContainText('春');

  const row = page.locator('.library li').filter({ hasText: '春' });
  await row.hover();
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(item).toContainText('No article');

  await page.getByTestId('memo-tab').filter({ hasText: 'Memo 1' }).locator('..').getByRole('button', { name: 'Close memo' }).click();
  await expect(page.getByTestId('memo-editor')).toHaveCount(0);
  await item.click();
  await expect(page.getByTestId('memo-editor')).toContainText('写景起笔');
  await page.getByTestId('memo-editor').locator('.anchor-chip').click();
  await expect(page.getByTestId('error-banner')).toContainText('in the Trash');
});
```

Restart the services as the Global Constraints say, then run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e memolist --project chromium --timeout 20000`
Expected: FAIL: there is no `memo-list-item`.

- [ ] **Step 2: Implement**

`apps/client/src/components/MemoList.tsx`:
```tsx
import { listAllMemos } from '@jot/db';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';

/** Every memo, most recently edited first (spec §6.9): memos outlive their article, so they stay reachable here. */
export function MemoList() {
  const { t } = useTranslation();
  const { bridge } = useMemoContext();
  const { data: memos } = useLibraryQuery(listAllMemos, [], ['memo', 'memo_update', 'article']);

  return (
    <>
      <h2>{t('memoList.heading')}</h2>
      {memos?.length === 0 && (
        <p className="muted" data-testid="memo-list-empty">
          {t('memoList.empty')}
        </p>
      )}
      <ul className="library memo-list" data-testid="memo-list">
        {memos?.map((m) => (
          <li key={m.id}>
            <button type="button" className="memo-list-item" onClick={() => bridge.showMemo(m.id)} data-testid="memo-list-item">
              <span className="memo-list-title">{m.title}</span>
              <span className="memo-list-home">{m.homeTitle ?? t('memoList.noArticle')}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
```

In `apps/client/src/components/Sidebar.tsx`:
- add `import { MemoList } from './MemoList';` after the `../router` import;
- insert `<MemoList />` directly before `<TagTree onSelect=… />`.

In `apps/client/src/components/Shell.tsx`:
1. Change the `@jot/db` import to `import { linkTargetStatus, targetRange } from '@jot/db';`.
2. In `follow`, replace
```ts
        if (!range || range.status === 'orphan') {
          reportError(new Error(t(range ? 'memo.lostTarget' : 'memo.missingTarget')));
          return;
        }
```
with
```ts
        if (range?.status === 'orphan') {
          reportError(new Error(t('memo.lostTarget')));
          return;
        }
        if (!range) {
          // In the Trash, the passage can come back; say so rather than that it is gone (spec §6.9).
          linkTargetStatus(lib, link.targetType, link.targetId).then((status) => {
            if (mine === token.current) reportError(new Error(t(status === 'trash' ? 'memo.targetInTrash' : 'memo.missingTarget')));
          }, reportError);
          return;
        }
```

In `apps/client/src/i18n/en.ts`:
- in `memo`, after `missingTarget`: `targetInTrash: 'The linked passage is in the Trash. Restore its article to follow the link.',`
- after the `trash` block, add:
```ts
  memoList: {
    heading: 'Memos',
    empty: 'No memos yet.',
    noArticle: 'No article',
  },
```

In `apps/client/src/i18n/zh-CN.ts`:
- in `memo`, after `missingTarget`: `targetInTrash: '链接的原文在回收站里。恢复那篇文章后才能跳转。',`
- after the `trash` block, add:
```ts
  memoList: {
    heading: '札记',
    empty: '还没有札记。',
    noArticle: '无所属文章',
  },
```

Append to `apps/client/src/styles/app.css`:
```css
/* Memo list */
.memo-list-item { display: flex; flex-direction: column; align-items: flex-start; width: 100%; min-width: 0; padding: 6px 8px; text-align: left; color: inherit; background: none; border: none; border-radius: 6px; cursor: pointer; }
.memo-list-item:hover { background: var(--bg); }
.memo-list-title, .memo-list-home { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.memo-list-home { font-size: 12px; color: var(--muted); }
```

In `README.md`, in "Your data", add after the Import bullet:
```markdown
- Deleting an article, memo or tag moves it to the **Trash** (the bin at the bottom of the sidebar). From there you can
  restore it, with everything deleted with it, or delete it forever, which erases its content from this device.
  Memos outlive their article: the sidebar's **Memos** list keeps every memo within reach.
```

- [ ] **Step 3: Run the tests**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: everything passes.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e memolist trash follow links memo backlinks`
Expected:
- `memolist` passes 1 on each browser;
- the other specs are unchanged. `follow` and `links` still show `missingTarget` for a target that is gone.

- [ ] **Step 4: Commit**

```bash
git add apps/client README.md
git commit -m "feat(client): the sidebar memo list, and links into the Trash say so"
```

---

### Task 6: The full verification

**Files:** none new.
**Test:** the complete suite on freshly started services.

**Interfaces:** consumes everything above; produces nothing new.

- [ ] **Step 1: Run the complete verification**

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

- [ ] **Step 2: Commit any leftover changes** (normally there are none)

```bash
git status --short
```
Expected: clean.

---

## Done when

- Deleting an article, memo or tag moves it to the Trash, and the sidebar's Trash button shows the count.
- Restoring an entry brings it back with what was deleted with it, and nothing removed earlier.
- **Delete forever** and **Empty Trash** erase content from the device. An older backup can't bring it back, and erased items aren't offered for restoring.
- A tag merged into another is erased, so it never shows in the Trash.
- Every memo is reachable from the sidebar's Memos list, including one whose article is gone.
- A link into the Trash says so.
- Spec §10 step 7 passes as end-to-end tests. `pnpm typecheck && pnpm lint && pnpm test` and `cargo test` pass, and the e2e suite passes on Chromium and WebKit.
