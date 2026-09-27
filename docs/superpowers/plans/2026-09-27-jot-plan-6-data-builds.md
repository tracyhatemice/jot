# Jot Plan 6: Export, Import, Backup and Desktop Builds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer can:
- export the whole library to a JSON file;
- import it into another library, or back into the same one;
- on desktop, save a backup copy of the database file.

Windows and macOS desktop builds come out of CI.

**Architecture:**
- **Export:** every row of every synced table, tombstones included, together with its per-field clocks.
- **Import:** the rows are merged with the same per-field latest-edit-wins rule that sync will use (spec §4.3). They keep their own clocks and skip the outbox. After the merge:
  - the local derived tables (search index, anchor positions, memo links and text) are rebuilt;
  - the tag graph is repaired (§6.4).
- **Desktop:** two small Rust commands write only into the Downloads folder, with names they validate:
  - the JSON export;
  - an online SQLite backup.
- **CI:** a GitHub Actions workflow builds unsigned installers with `tauri-action`.

**Tech Stack:**
- The same as plans 1–5.
- `rusqlite`'s `backup` feature.
- `tauri-apps/tauri-action@v1`, `pnpm/action-setup`, `actions/setup-node` and `dtolnay/rust-toolchain`.
- `rhysd/actionlint`, run through Docker to check the workflow.

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`. Relevant sections:
- §4.3 write path
- §5.3 local derived data
- §6.4 tag repairs after import
- §6.7 export and backup
- §7 CI
- §9 milestone M9
- §10 step 6

**Series:** This is plan 6 of 6 for sub-project 1. After it come sub-project 2 (accounts and sync) and sub-project 3 (release hardening).

**Branch:** `plan-6-data-builds`

## Global Constraints

- **Plan 1–5 constraints still apply.** In particular:
  - Docker only.
  - Node ≥ 24 and pnpm 10.
  - `SqlDriver` has only `query` and `batch`.
  - Local edits are written only through `Library.commit`.
  - Every user-facing string goes through i18next, with identical keys in `zh-CN` and `en`.
  - No `dangerouslySetInnerHTML`.
  - Conventional commits with **no attribution lines**.
- **Commands:**
  - Run: `docker compose run --rm -T -e NO_COLOR=1 dev <cmd>`.
  - End-to-end: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e [spec]`.
  - Rust: `docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'`.
  - After adding dependencies or recreating Playwright, wait until its server answers:
    `until docker compose exec -T web node -e "require('net').connect(3000,'localhost').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; do sleep 2; done`
- **Merging rows made elsewhere:**
  - It goes through `Library.applyRows`, the only path besides `commit` that writes synced tables.
  - A missing row is inserted whole. An existing row takes an incoming field only when that field's own clock is newer.
  - A field with no clock was never set by an edit and holds its default (for example `deleted` on a new item). It stays without a clock: it's inserted with a new row but never overrides a value. Otherwise a later deletion made on another device could lose.
  - The library clock *receives* every incoming stamp, so later local edits sort after them.
  - Imported rows are **not** written to the outbox. Sync (sub-project 2) will upload a library's existing rows in its own first sync.
- **Derived tables are rebuilt after every import:**
  - The search index and `anchor_res` are rebuilt from the synced rows (`rebuildDerived`).
  - `memo_link` and `memo_cache.text` are rebuilt from each memo's Yjs document (`refreshMemoDerived`, called by the client).
  - Then `repairTagGraph` runs.
- **Export file format**, `format: 'jot-library'`, `version: 1`:
  - Rows carry `{ table, id, hlc, fhlc, fields }`. BLOBs are written as `{ "$blob": base64 }`, as in encoded ops.
  - Import accepts only:
    - synced tables;
    - known columns, all of them present;
    - valid HLCs;
    - string, number or null values (a BLOB only in `memo_update.data`).
  - A higher `version` is refused as "made by a newer Jot".
- **Desktop file writes:**
  - Only into the user's Downloads folder, under a name the page supplies. The Rust side accepts only `[A-Za-z0-9._-]` with the expected extension.
  - An existing file is never overwritten; a `-1`, `-2`… suffix is added instead.
  - The backup uses SQLite's online backup API, so the copy is consistent even while the app writes.
- **CI desktop builds:**
  - Triggered manually (`workflow_dispatch`) and by `v*` tags.
  - Targets: Windows, macOS arm64 and macOS x64.
  - Builds are unsigned (signing is sub-project 3) and uploaded as workflow artifacts. No release is created.
  - The `preinstall` guard is satisfied on CI runners with `IN_JOT_CONTAINER=1`: the guard protects developers' machines, and CI runners are throwaway VMs.

## Review Focus

These five inputs aren't covered by the happy paths and are most likely to cause problems. Each one has a test in the task that owns the code.

1. **Importing into a library that already holds some of the same items, or importing the same file twice.**
   - Expected: no duplicates. Every field keeps its newest edit, and a newer deletion wins.
   - Tests: Task 1, Task 3.
2. **Edits made after an import.**
   - Expected: they win over imported data, even if the file came from a device whose clock ran ahead.
   - Tests: Task 1.
3. **Files that aren't Jot exports.** This covers other JSON, a newer format, and damaged or crafted rows: unknown tables or columns (including SQL in a column name), bad clocks, and wrong value types.
   - Expected: refused with a clear message, and nothing is written.
   - Tests: Task 3, Task 4.
4. **Derived data after an import.**
   - Expected: all of it is rebuilt:
     - search, including memo text and Chinese;
     - markup positions on the current revision;
     - memo backlinks;
     - the tag graph, with duplicate tag names merged.
   - Tests: Tasks 2–4.
5. **Desktop file writes.**
   - Expected: names from the page can't escape the Downloads folder or overwrite a file, and the backup opens and is consistent even while the app is writing.
   - Tests: Task 5 (Rust).

---

## File Map

```
packages/db/src/ops.ts                 RowImage, rowStatements (opStatements delegates)               Task 1
packages/db/src/library.ts             applyRows, announce                                             Task 1
packages/db/src/revisions.ts           resolveAnchors, placementStatements, liveMarkups (refactor)     Task 2
packages/db/src/rebuild.ts             rebuildDerived                                                   Task 2
packages/db/src/memos.ts               refreshMemoDerived, liveMemoIds (memoDerivedStatements shared)  Task 2
packages/db/src/exchange.ts            exportLibrary, encode/decodeExport, importLibrary                Task 3
apps/client/src/data/libraryFile.ts, notices.ts, platform/files.ts                                     Task 4
apps/client/src/components/LibraryData.tsx, NoticeBanner.tsx, Sidebar.tsx, Shell.tsx                  Task 4 (+ backup in Task 5)
apps/desktop/src-tauri/src/files.rs, lib.rs, Cargo.toml                                               Task 5
.github/workflows/desktop.yml, README.md, spec                                                         Task 6
apps/client/e2e/data.spec.ts                                                                            Task 4
```

---

### Task 1: Merging rows made elsewhere, with their own clocks

**Files:**
- Create: `packages/db/src/rows.test.ts`
- Modify: `packages/db/src/ops.ts`, `packages/db/src/library.ts`
- Test: `packages/db/src/rows.test.ts` (and the existing `ops.test.ts` must stay green)

**Interfaces:**
- Consumes: `Clock.receive` and `Clock.last` (core); `SYNCED_COLUMNS`, `IMMUTABLE_TABLES` and `OP_VERSION`.
- Produces:
  - `interface RowImage { table: SyncedTable; id: string; hlc: string; fhlc: Record<string, string>; fields: Record<string, SqlValue> }`
  - `rowStatements(row: RowImage): Stmt[]` merges per field. Fields missing from `fhlc` are unstamped. `opStatements(op)` now delegates to it, stamping every field with the op's clock.
  - `Library.applyRows(rows: RowImage[]): Promise<void>` receives every stamp, applies the rows in one batch without the outbox, then notifies subscribers.
  - `Library.announce(tables?)` tells subscribers that data changed without a commit (for example, derived tables were rebuilt). By default it covers every synced table.

- [ ] **Step 1: Write the failing tests**

`packages/db/src/rows.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { Library } from './library';
import type { RowImage } from './ops';
import { createTag, renameTag } from './tags';

const stamp = (ms: number) => `${String(ms).padStart(15, '0')}-0000-00000000000000aa`;
const TAG_FIELDS = { name: 'x', color: null, sort_key: 'a0', created_at: 1, deleted: 0 };
/** A tag row whose every field was edited at `ms`, unless `over` says otherwise. */
const tagRow = (id: string, ms = 2000, over: Partial<RowImage> = {}): RowImage => ({
  table: 'tag',
  id,
  hlc: stamp(ms),
  fhlc: Object.fromEntries(Object.keys(TAG_FIELDS).map((k) => [k, stamp(ms)])),
  fields: { ...TAG_FIELDS },
  ...over,
});
const tagState = async (lib: Library, id: string) =>
  (await lib.driver.query<{ name: string; color: string | null; fhlc: string }>('SELECT name, color, fhlc FROM tag WHERE id = ?', [id]))[0];

describe('Library.applyRows', () => {
  it('inserts a missing row whole, keeping each field’s own clock and leaving unedited fields unstamped', async () => {
    const lib = await Library.open(createNodeDriver(), { now: () => 1000 });
    const fhlc = { name: stamp(3000), color: stamp(2500), sort_key: stamp(3000), created_at: stamp(3000) };
    await lib.applyRows([tagRow('t1', 3000, { fhlc })]);
    const row = await tagState(lib, 't1');
    expect(row.name).toBe('x');
    expect(JSON.parse(row.fhlc)).toEqual(fhlc);
  });

  it('never lets an unstamped field override a value', async () => {
    const lib = await Library.open(createNodeDriver(), { now: () => 5000 });
    const id = await createTag(lib, { name: 'local' });
    await lib.driver.batch([{ sql: 'UPDATE tag SET deleted = 1 WHERE id = ?', params: [id] }]);
    await lib.applyRows([tagRow(id, 9000, { fhlc: { name: stamp(9000) }, fields: { ...TAG_FIELDS, name: 'newer', deleted: 0 } })]);
    const [row] = await lib.driver.query<{ name: string; deleted: number }>('SELECT name, deleted FROM tag WHERE id = ?', [id]);
    expect(row).toEqual({ name: 'newer', deleted: 1 });
  });

  it('merges field by field: each field keeps whichever side edited it last (Review Focus 1)', async () => {
    const lib = await Library.open(createNodeDriver(), { now: () => 5000 });
    const id = await createTag(lib, { name: 'local' });
    await lib.applyRows([
      tagRow(id, 9000, {
        fhlc: { name: stamp(4000), color: stamp(9000), sort_key: stamp(4000), created_at: stamp(4000), deleted: stamp(4000) },
        fields: { name: 'older', color: '#c00', sort_key: 'zz', created_at: 1, deleted: 0 },
      }),
    ]);
    const row = await tagState(lib, id);
    expect([row.name, row.color]).toEqual(['local', '#c00']);
  });

  it('changes nothing when the same rows arrive twice', async () => {
    const lib = await Library.open(createNodeDriver());
    const rows = [tagRow('t1'), tagRow('t2', 2000, { fields: { ...TAG_FIELDS, name: 'y', sort_key: 'a1' } })];
    await lib.applyRows(rows);
    const once = await lib.driver.query('SELECT * FROM tag ORDER BY id');
    await lib.applyRows(rows);
    expect(await lib.driver.query('SELECT * FROM tag ORDER BY id')).toEqual(once);
  });

  it('lets later local edits win, even over rows stamped by a clock that ran ahead (Review Focus 2)', async () => {
    const lib = await Library.open(createNodeDriver(), { now: () => 1000 });
    await lib.applyRows([tagRow('t1', 9_000_000)]);
    await renameTag(lib, 't1', 'mine');
    expect((await tagState(lib, 't1')).name).toBe('mine');
  });

  it('writes nothing to the outbox, and tells subscribers', async () => {
    const lib = await Library.open(createNodeDriver());
    const seen: string[] = [];
    lib.subscribe((ops) => seen.push(...ops.map((o) => o.table)));
    await lib.applyRows([tagRow('t1')]);
    expect(await lib.driver.query('SELECT seq FROM outbox')).toEqual([]);
    expect(seen).toEqual(['tag']);
    lib.announce(['memo']);
    expect(seen).toEqual(['tag', 'memo']);
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/rows.test.ts`
Expected: FAIL with `lib.applyRows is not a function`.

- [ ] **Step 2: Implement**

In `packages/db/src/ops.ts`:
1. Change the first import to `import { assertValidOp, encodeOp, IMMUTABLE_TABLES, OP_VERSION, type Op, type SqlValue, type SyncedTable } from '@jot/core';`.
2. Replace the whole `opStatements` function, with its doc comment, by:
```ts
/** A whole row with its per-field clocks, as exported (and, later, as a sync snapshot). */
export interface RowImage {
  table: SyncedTable;
  id: string;
  /** The row's newest clock. */
  hlc: string;
  /**
   * Each field's clock. A field missing here was never set by an edit (it holds its default): it is
   * inserted with a new row but never overrides a value. Empty for immutable tables.
   */
  fhlc: Record<string, string>;
  fields: Record<string, SqlValue>;
}

/**
 * SQL that merges a row: inserted whole when absent; otherwise each field takes the incoming value only
 * if its own clock is newer than the one recorded in `fhlc` (per-field latest-edit-wins, spec §4.3).
 * Immutable tables insert once.
 *
 * Not an `INSERT … ON CONFLICT DO UPDATE`: SQLite checks NOT NULL before resolving the conflict, so a
 * partial op (e.g. `{ deleted: 1 }`) would fail. Instead: UPDATE the row if present, then INSERT it only
 * if absent — both in the caller's transaction.
 */
export function rowStatements(row: RowImage): Stmt[] {
  assertValidOp({ v: OP_VERSION, table: row.table, id: row.id, hlc: row.hlc, fields: row.fields });
  const cols = Object.keys(row.fields);
  if (cols.length === 0) return [];
  const table = ident(row.table);
  const colList = cols.map(ident).join(', ');

  if (IMMUTABLE_TABLES.has(row.table)) {
    const ins = paramList();
    const values = [ins.bind(row.id), ...cols.map((c) => ins.bind(row.fields[c] ?? null)), ins.bind(row.hlc)].join(', ');
    return [{ sql: `INSERT INTO ${table} (id, ${colList}, hlc) VALUES (${values}) ON CONFLICT (id) DO NOTHING`, params: ins.params }];
  }

  const stamped = cols.filter((c) => row.fhlc[c] !== undefined);
  const statements: Stmt[] = [];
  if (stamped.length > 0) {
    // Each fragment is built left to right so binds happen in textual order.
    const up = paramList();
    const fieldClock = (c: string) => `coalesce(json_extract(fhlc, ${up.bind(`$."${c}"`)}), '')`;
    const assignments = stamped.map(
      (c) => `${ident(c)} = CASE WHEN ${up.bind(row.fhlc[c])} > ${fieldClock(c)} THEN ${up.bind(row.fields[c] ?? null)} ELSE ${ident(c)} END`,
    );
    const clockUpdates = stamped.map(
      (c) => `${up.bind(`$."${c}"`)}, CASE WHEN ${up.bind(row.fhlc[c])} > ${fieldClock(c)} THEN ${up.bind(row.fhlc[c])} ELSE ${fieldClock(c)} END`,
    );
    statements.push({
      sql:
        `UPDATE ${table} SET ${assignments.join(', ')}, ` +
        `fhlc = json_set(fhlc, ${clockUpdates.join(', ')}), ` +
        `hlc = max(hlc, ${up.bind(row.hlc)}) WHERE id = ${up.bind(row.id)}`,
      params: up.params,
    });
  }

  const ins = paramList();
  const values = [
    ins.bind(row.id),
    ...cols.map((c) => ins.bind(row.fields[c] ?? null)),
    ins.bind(row.hlc),
    `json_object(${stamped.map((c) => `${ins.bind(c)}, ${ins.bind(row.fhlc[c])}`).join(', ')})`,
  ].join(', ');
  statements.push({
    sql: `INSERT INTO ${table} (id, ${colList}, hlc, fhlc) SELECT ${values} WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ${ins.bind(row.id)})`,
    params: ins.params,
  });
  return statements;
}

/** SQL that applies one op: a row image whose fields were all edited at the op's clock. */
export function opStatements(op: Op): Stmt[] {
  const fhlc = Object.fromEntries(Object.keys(op.fields).map((c) => [c, op.hlc]));
  return rowStatements({ table: op.table, id: op.id, hlc: op.hlc, fhlc, fields: op.fields });
}
```

In `packages/db/src/library.ts`:
1. Change the imports to:
```ts
import { Clock, createLock, newDeviceId, OP_VERSION, SYNCED_COLUMNS, type Lock, type Op, type SqlValue, type SyncedTable } from '@jot/core';
import type { SqlDriver, Stmt } from './driver';
import { migrate } from './migrate';
import { hlcLastStatement, kvSetStatement, opStatements, outboxStatement, rowStatements, type RowImage } from './ops';
```
2. In `commit`, replace the `for (const listener of this.listeners) { … }` loop with `this.emit(ops);`.
3. Add these methods after `commit`:
```ts
  /**
   * Merges rows made elsewhere (an imported library now; sync later) with their own clocks: the same
   * per-field latest-edit-wins as local edits, but no new stamps and no outbox (spec §4.3). The clock
   * receives every incoming stamp, so later local edits sort after them.
   */
  async applyRows(rows: RowImage[]): Promise<void> {
    if (rows.length === 0) return;
    for (const row of rows) {
      this.clock.receive(row.hlc);
      for (const stamp of Object.values(row.fhlc)) this.clock.receive(stamp);
    }
    await this.driver.batch([...rows.flatMap((row) => rowStatements(row)), hlcLastStatement(this.clock.last())]);
    this.emit(rows.map((row): Op => ({ v: OP_VERSION, table: row.table, id: row.id, hlc: row.hlc, fields: row.fields })));
  }

  /** Tells subscribers that data of these tables changed without a commit (for example, derived tables were rebuilt). */
  announce(tables: readonly SyncedTable[] = Object.keys(SYNCED_COLUMNS) as SyncedTable[]): void {
    this.emit(tables.map((table): Op => ({ v: OP_VERSION, table, id: '', hlc: '', fields: {} })));
  }

  private emit(ops: Op[]): void {
    for (const listener of this.listeners) {
      try {
        listener(ops);
      } catch (err) {
        console.error('Library change listener failed', err);
      }
    }
  }
```

- [ ] **Step 3: Run the tests, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db/src/rows.test.ts packages/db/src/ops.test.ts packages/db/src/library.test.ts && pnpm test && pnpm typecheck && pnpm lint'`
Expected: the 6 new tests pass; the existing op and library tests still pass, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "feat(db): merge rows made elsewhere by per-field clocks, without the outbox"
```

---

### Task 2: Rebuilding the derived data

**Files:**
- Create: `packages/db/src/rebuild.ts`, `packages/db/src/rebuild.test.ts`
- Modify: `packages/db/src/revisions.ts` (replace), `packages/db/src/memos.ts`, `packages/db/src/index.ts`
- Test: `packages/db/src/rebuild.test.ts` (the plan-5 `revisions.test.ts` must stay green)

**Interfaces:**
- Consumes: `createReanchorer`; `anchorResStatement`; `indexStatements`.
- Produces:
  - `resolveAnchors(lib, articleId, text, knownTexts): Promise<Map<anchorId, Resolution>>`. Each live anchor is placed in `text` by re-attaching it from the revision it was captured on.
  - `liveMarkups(lib, articleId): Promise<{ id; anchorId; exact }[]>`.
  - `placementStatements(articleId, revisionId, text, resolved, markups): Stmt[]`. It writes the `anchor_res` rows, plus search entries for markups by the words they cover now (their original quote if orphaned).
  - `rebuildDerived(lib)` rebuilds `anchor_res` and the whole search index from the synced rows. Memo text comes from `memo_cache`.
  - `refreshMemoDerived(lib, memoId, derived)` rewrites a memo's links, text and search entry. It does nothing for a deleted memo.
  - `liveMemoIds(lib): Promise<string[]>`.

- [ ] **Step 1: Write the failing tests**

`packages/db/src/rebuild.test.ts`:
```ts
import { captureAnchor, type Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, getArticle } from './articles';
import { Library } from './library';
import { createMarkup, createSideNote, listMarkups } from './markups';
import { appendMemoUpdate, createMemo, createQuote, deleteMemo, listBacklinks, liveMemoIds, refreshMemoDerived } from './memos';
import { rebuildDerived } from './rebuild';
import { saveRevision } from './revisions';
import { search } from './search';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));
const kindsFound = async (lib: Library, text: string) => (await search(lib.driver, { text })).map((h) => h.entityType).sort();
const wipeDerived = (lib: Library) =>
  lib.driver.batch([
    { sql: 'DELETE FROM anchor_res' },
    { sql: 'DELETE FROM search_doc' },
    { sql: "INSERT INTO search_fts (search_fts) VALUES ('delete-all')" },
  ]);

async function article(lib: Library) {
  const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('他用比喻写春天。') });
  const text = (await getArticle(lib, articleId))!.text;
  return { articleId, revisionId, text };
}

describe('rebuildDerived', () => {
  it('rebuilds search and markup positions from the synced rows alone (Review Focus 4)', async () => {
    const lib = await Library.open(createNodeDriver());
    const { articleId, revisionId, text } = await article(lib);
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
    await createSideNote(lib, { markupId, articleId, body: '比喻的妙处' });
    const memoId = await createMemo(lib, { title: '论比喻', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, Uint8Array.from([1]), { text: '', links: [] });
    await saveRevision(lib, articleId, paras('【注】他用比喻写春天。'));
    const before = await listMarkups(lib, articleId);
    await wipeDerived(lib);
    expect(await kindsFound(lib, '比喻')).toEqual([]);
    await rebuildDerived(lib);
    expect(await kindsFound(lib, '比喻')).toEqual(['article', 'markup', 'memo', 'side_note']);
    expect(await listMarkups(lib, articleId)).toEqual(before);
  });
});

describe('refreshMemoDerived', () => {
  it('rewrites a memo’s links and searchable text; a deleted memo is left alone', async () => {
    const lib = await Library.open(createNodeDriver());
    const { articleId, revisionId, text } = await article(lib);
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4) });
    const memoId = await createMemo(lib, { title: '札记', homeArticleId: articleId });
    await refreshMemoDerived(lib, memoId, { text: '新写的札记', links: [{ nodeId: 'n1', targetType: 'anchor', targetId: quoteId, articleId }] });
    expect((await search(lib.driver, { text: '新写' })).map((h) => h.entityId)).toEqual([memoId]);
    expect((await listBacklinks(lib, articleId)).map((b) => b.memoId)).toEqual([memoId]);

    const gone = await createMemo(lib, { title: '删', homeArticleId: articleId });
    await deleteMemo(lib, gone);
    await refreshMemoDerived(lib, gone, { text: '不该出现', links: [] });
    expect(await search(lib.driver, { text: '不该出现' })).toEqual([]);
    expect(await liveMemoIds(lib)).toEqual([memoId]);
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/rebuild.test.ts`
Expected: FAIL with `Cannot find module './rebuild'`.

- [ ] **Step 2: Share anchor placement between fix-ups and rebuilds**

Replace `packages/db/src/revisions.ts` with:
```ts
import {
  canonicalText, createReanchorer, detectLang, newId, normalizeBlocks, type Block, type Resolution, type ResolutionStatus,
  type StoredAnchor,
} from '@jot/core';
import { EmptyArticleError, getArticle } from './articles';
import type { Stmt } from './driver';
import type { Library } from './library';
import { anchorResStatement } from './markups';
import { indexStatements } from './search';

export interface RevisionResult {
  revisionId: string;
  /** How the article's markups were found in the new text. */
  markups: Record<ResolutionStatus, number>;
  /** Markups whose words can't be found in the new text (listed in the orphaned-markups panel). */
  orphanedMarkupIds: string[];
}

type AnchorRow = StoredAnchor & { id: string; revisionId: string };

/**
 * Where each live anchor of an article sits in `text`: re-attached from the revision it was captured on,
 * so every device gets the same answer whatever edits came in between (spec §5.3). `knownTexts` spares
 * reading revisions the caller already has.
 */
export async function resolveAnchors(
  lib: Library,
  articleId: string,
  text: string,
  knownTexts: ReadonlyMap<string, string>,
): Promise<Map<string, Resolution>> {
  const anchors = await lib.driver.query<AnchorRow>(
    'SELECT id, revision_id AS revisionId, start, "end", exact, prefix, suffix FROM anchor WHERE article_id = ? AND deleted = 0',
    [articleId],
  );
  const oldTexts = new Map(knownTexts);
  for (const id of new Set(anchors.map((a) => a.revisionId))) {
    if (oldTexts.has(id)) continue;
    const [row] = await lib.driver.query<{ text: string }>('SELECT text FROM article_revision WHERE id = ?', [id]);
    oldTexts.set(id, row?.text ?? '');
  }
  const reanchorers = new Map<string, (anchor: StoredAnchor) => Resolution>();
  const resolved = new Map<string, Resolution>();
  for (const a of anchors) {
    let reanchor = reanchorers.get(a.revisionId);
    if (!reanchor) {
      reanchor = createReanchorer(oldTexts.get(a.revisionId) ?? '', text);
      reanchorers.set(a.revisionId, reanchor);
    }
    resolved.set(a.id, reanchor(a));
  }
  return resolved;
}

export interface LiveMarkup {
  id: string;
  anchorId: string;
  /** The words the markup was made on. */
  exact: string;
}

export function liveMarkups(lib: Library, articleId: string): Promise<LiveMarkup[]> {
  return lib.driver.query<LiveMarkup>(
    `SELECT m.id, m.anchor_id AS anchorId, a.exact FROM markup m JOIN anchor a ON a.id = m.anchor_id
     WHERE m.article_id = ? AND m.deleted = 0`,
    [articleId],
  );
}

/**
 * Local statements placing an article's anchors on `revisionId`, and indexing its markups by the words
 * they now cover (a typo fixed inside one included; an orphan keeps its original words).
 */
export function placementStatements(
  articleId: string,
  revisionId: string,
  text: string,
  resolved: ReadonlyMap<string, Resolution>,
  markups: readonly LiveMarkup[],
): Stmt[] {
  return [
    ...[...resolved].map(([anchorId, r]) => anchorResStatement(anchorId, revisionId, r.start, r.end, r.status, r.score)),
    ...markups.flatMap((m) => {
      const r = resolved.get(m.anchorId);
      const body = r && r.status !== 'orphan' ? text.slice(r.start, r.end) : m.exact;
      return indexStatements({ entityType: 'markup', entityId: m.id, articleId, title: '', body });
    }),
  ];
}

/**
 * A fix-up edit (spec §6.6): the edited blocks become a new revision that the article points at, and
 * every live anchor of the article is re-attached to it (§6.2). Returns null, writing nothing, when the
 * text and formatting are unchanged.
 */
export async function saveRevision(lib: Library, articleId: string, blocks: Block[]): Promise<RevisionResult | null> {
  const current = await getArticle(lib, articleId);
  if (!current) throw new Error(`Article ${articleId} does not exist`);
  const normalized = normalizeBlocks(blocks);
  if (normalized.length === 0) throw new EmptyArticleError();
  if (JSON.stringify(normalized) === JSON.stringify(current.blocks)) return null;
  const text = canonicalText(normalized);
  const revisionId = newId();
  const resolved = await resolveAnchors(lib, articleId, text, new Map([[current.revisionId, current.text]]));
  const markups = await liveMarkups(lib, articleId);

  const counts: Record<ResolutionStatus, number> = { exact: 0, mapped: 0, fuzzy: 0, orphan: 0 };
  const orphanedMarkupIds: string[] = [];
  for (const m of markups) {
    const status = resolved.get(m.anchorId)?.status ?? 'orphan';
    counts[status] += 1;
    if (status === 'orphan') orphanedMarkupIds.push(m.id);
  }

  await lib.commit(
    [
      {
        table: 'article_revision',
        id: revisionId,
        fields: { article_id: articleId, parent_id: current.revisionId, blocks: JSON.stringify(normalized), text, created_at: lib.now() },
      },
      { table: 'article', id: articleId, fields: { current_revision_id: revisionId, lang: detectLang(text) } },
    ],
    [
      ...placementStatements(articleId, revisionId, text, resolved, markups),
      ...indexStatements({ entityType: 'article', entityId: articleId, articleId, title: current.title, body: text }),
    ],
  );
  return { revisionId, markups: counts, orphanedMarkupIds };
}
```

- [ ] **Step 3: Implement the rebuild and the memo refresh**

`packages/db/src/rebuild.ts`:
```ts
import type { Library } from './library';
import { liveMarkups, placementStatements, resolveAnchors } from './revisions';
import { indexStatements } from './search';

/**
 * Rebuilds the local derived tables that come from synced rows alone — the search index and the anchor
 * positions — for the whole library (spec §5.3). Memo links and text come from the memo documents; the
 * caller refreshes them (`refreshMemoDerived`). Used after an import; safe to run any time.
 */
export async function rebuildDerived(lib: Library): Promise<void> {
  await lib.driver.batch([
    { sql: 'DELETE FROM anchor_res' },
    { sql: 'DELETE FROM search_doc' },
    { sql: "INSERT INTO search_fts (search_fts) VALUES ('delete-all')" },
  ]);
  const articles = await lib.driver.query<{ id: string; title: string; revisionId: string; text: string }>(
    `SELECT a.id, a.title, r.id AS revisionId, r.text FROM article a
     JOIN article_revision r ON r.id = a.current_revision_id WHERE a.deleted = 0`,
  );
  for (const a of articles) {
    const resolved = await resolveAnchors(lib, a.id, a.text, new Map([[a.revisionId, a.text]]));
    const markups = await liveMarkups(lib, a.id);
    const notes = await lib.driver.query<{ id: string; body: string }>(
      'SELECT id, body FROM side_note WHERE article_id = ? AND deleted = 0',
      [a.id],
    );
    await lib.driver.batch([
      ...placementStatements(a.id, a.revisionId, a.text, resolved, markups),
      ...indexStatements({ entityType: 'article', entityId: a.id, articleId: a.id, title: a.title, body: a.text }),
      ...notes.flatMap((n) => indexStatements({ entityType: 'side_note', entityId: n.id, articleId: a.id, title: '', body: n.body })),
    ]);
  }
  const memos = await lib.driver.query<{ id: string; title: string; text: string }>(
    `SELECT m.id, m.title, coalesce(c.text, '') AS text FROM memo m LEFT JOIN memo_cache c ON c.memo_id = m.id
     WHERE m.deleted = 0`,
  );
  if (memos.length > 0) {
    await lib.driver.batch(
      memos.flatMap((m) => indexStatements({ entityType: 'memo', entityId: m.id, articleId: null, title: m.title, body: m.text })),
    );
  }
}
```

In `packages/db/src/memos.ts`:
1. Directly above `appendMemoUpdate`, add:
```ts
/** A memo's local derived data — links, plain text, search entry — rewritten from its document. */
function memoDerivedStatements(memoId: string, title: string, derived: MemoDerived): Stmt[] {
  return [
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
    ...indexStatements({ entityType: 'memo', entityId: memoId, articleId: null, title, body: derived.text }),
  ];
}
```
2. In `appendMemoUpdate`, replace the second argument of the final `lib.commit([update], [ … ])` (the whole statement array) with `memoDerivedStatements(memoId, memo.title, derived)`.
3. Directly below `appendMemoUpdate`, add:
```ts
/** Rewrites a memo's links, text and search entry from its document (after an import). A deleted memo is left alone. */
export async function refreshMemoDerived(lib: Library, memoId: string, derived: MemoDerived): Promise<void> {
  const [memo] = await lib.driver.query<{ title: string; deleted: number }>('SELECT title, deleted FROM memo WHERE id = ?', [memoId]);
  if (!memo || memo.deleted) return;
  await lib.driver.batch(memoDerivedStatements(memoId, memo.title, derived));
}

export async function liveMemoIds(lib: Library): Promise<string[]> {
  return (await lib.driver.query<{ id: string }>('SELECT id FROM memo WHERE deleted = 0 ORDER BY id')).map((r) => r.id);
}
```

Append to `packages/db/src/index.ts`:
```ts
export * from './rebuild';
```

- [ ] **Step 4: Run the tests, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db && pnpm test && pnpm typecheck && pnpm lint'`
Expected:
- the 2 new tests pass;
- `revisions.test.ts` and `memos.test.ts` still pass, now running through the shared helpers;
- no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): rebuild search and anchor positions from synced rows, and refresh memo derived data"
```

---

### Task 3: The library file: export, validation and import

**Files:**
- Create: `packages/db/src/exchange.ts`, `packages/db/src/exchange.test.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/exchange.test.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `RowImage` and `Library.applyRows`/`announce`;
  - from Task 2: `rebuildDerived`;
  - from plan 1: `repairTagGraph`;
  - from core: `parseHlc`, `bytesToBase64` and `base64ToBytes`.
- Produces:
  - `interface LibraryExport { format: 'jot-library'; version: number; exportedAt: number; rows: RowImage[] }`
  - `exportLibrary(lib)` returns every row of every synced table, tombstones included.
  - `encodeExport(data): string`.
  - `decodeExport(text): LibraryExport` parses and checks everything. It throws `InvalidExportError`, or `NewerExportError` for a higher version.
  - `interface ImportSummary { articles; markups; sideNotes; memos; tags }` counts the live items in the file.
  - `importLibrary(lib, data): Promise<ImportSummary>`: it applies the rows, rebuilds the derived tables, repairs the tag graph and announces the change.

- [ ] **Step 1: Write the failing tests**

`packages/db/src/exchange.test.ts`:
```ts
import { captureAnchor, SYNCED_COLUMNS, type Block, type SyncedTable } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, getArticle } from './articles';
import { decodeExport, encodeExport, exportLibrary, importLibrary, InvalidExportError, NewerExportError } from './exchange';
import { Library } from './library';
import { createMarkup, createSideNote, listMarkups } from './markups';
import { appendMemoUpdate, createMemo, createQuote, getMemoState } from './memos';
import { saveRevision } from './revisions';
import { search } from './search';
import { addParent, createTag, deleteTag, listTags, renameTag, tagEntity } from './tags';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));
let tick = 1000;
const open = () => Library.open(createNodeDriver(), { now: () => tick++ });

/** Every synced row as the database holds it (derived tables left out; field clocks as objects, since key order may differ). */
async function syncedRows(lib: Library) {
  const out: Record<string, unknown[]> = {};
  for (const table of Object.keys(SYNCED_COLUMNS) as SyncedTable[]) {
    const rows = await lib.driver.query<Record<string, unknown>>(`SELECT * FROM "${table}" ORDER BY id`);
    out[table] = rows.map((r) => (typeof r.fhlc === 'string' ? { ...r, fhlc: JSON.parse(r.fhlc) as unknown } : r));
  }
  return out;
}

const roundTrip = async (from: Library, to: Library) => importLibrary(to, decodeExport(encodeExport(await exportLibrary(from))));

async function sampleLibrary() {
  const lib = await open();
  const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('他用比喻写春天。明月何时照我还。') });
  const text = (await getArticle(lib, articleId))!.text;
  const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
  const noteId = await createSideNote(lib, { markupId, articleId, body: '以景起兴' });
  await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 8, 10) });
  const memoId = await createMemo(lib, { title: '札记', homeArticleId: articleId });
  await appendMemoUpdate(lib, memoId, Uint8Array.from([1, 2, 255]), { text: '论比喻', links: [] });
  const parent = await createTag(lib, { name: '技巧' });
  const child = await createTag(lib, { name: '修辞' });
  await addParent(lib, child, parent);
  await tagEntity(lib, { tagId: child, entityType: 'side_note', entityId: noteId, articleId });
  await saveRevision(lib, articleId, paras('【注】他用比喻写春天。明月何时照我还。'));
  return { lib, articleId, memoId, parent, child };
}

describe('library export and import', () => {
  it('copies a whole library into a fresh one: every row with its clocks, and the derived data (spec §10 step 6)', async () => {
    const { lib: a, articleId, memoId } = await sampleLibrary();
    const b = await open();
    expect(await roundTrip(a, b)).toEqual({ articles: 1, markups: 1, sideNotes: 1, memos: 1, tags: 2 });
    expect(await syncedRows(b)).toEqual(await syncedRows(a));
    expect(await listMarkups(b, articleId)).toEqual(await listMarkups(a, articleId));
    expect((await search(b.driver, { text: '起兴' })).map((h) => h.entityType)).toEqual(['side_note']);
    expect((await getMemoState(b, memoId)).updates.map((u) => [...u.data])).toEqual([[1, 2, 255]]);
  });

  it('keeps the newest edit of every field when imported twice or into a library with newer edits (Review Focus 1)', async () => {
    const { lib: a, child } = await sampleLibrary();
    const b = await open();
    await roundTrip(a, b);
    await renameTag(b, child, '修辞手法');
    const before = await syncedRows(b);
    await roundTrip(a, b);
    expect(await syncedRows(b)).toEqual(before);
    expect((await listTags(b)).map((t) => t.name)).toContain('修辞手法');
  });

  it('removes what the export deleted, where the deletion is the newer edit (Review Focus 1)', async () => {
    const { lib: a, parent } = await sampleLibrary();
    const b = await open();
    await roundTrip(a, b);
    await deleteTag(a, parent);
    await roundTrip(a, b);
    expect((await listTags(b)).map((t) => t.name)).toEqual(['修辞']);
  });

  it('merges tags that share a name after the import (spec §6.4, Review Focus 4)', async () => {
    const { lib: a } = await sampleLibrary();
    const b = await open();
    await createTag(b, { name: '修辞' });
    await roundTrip(a, b);
    expect((await listTags(b)).filter((t) => t.name === '修辞')).toHaveLength(1);
  });

  it('refuses files that are not Jot exports, before writing anything (Review Focus 3)', async () => {
    const { lib: a } = await sampleLibrary();
    const good = JSON.parse(encodeExport(await exportLibrary(a))) as { rows: Record<string, unknown>[] };
    const withFirstRow = (change: (row: Record<string, unknown>, fields: Record<string, unknown>) => void) => {
      const copy = structuredClone(good);
      change(copy.rows[0], copy.rows[0].fields as Record<string, unknown>);
      return JSON.stringify(copy);
    };
    const invalid = [
      'not json',
      '{"hello":"world"}',
      JSON.stringify({ ...good, format: 'other' }),
      JSON.stringify({ ...good, rows: 'nope' }),
      withFirstRow((row) => {
        row.table = 'outbox';
      }),
      withFirstRow((_row, fields) => {
        fields['title" = 1; DROP TABLE article; --'] = 'x';
      }),
      withFirstRow((row) => {
        row.hlc = 'yesterday';
      }),
      withFirstRow((_row, fields) => {
        fields.title = true;
      }),
      withFirstRow((_row, fields) => {
        fields.title = { $blob: 'AAAA' };
      }),
      withFirstRow((_row, fields) => {
        delete fields.title;
      }),
    ];
    for (const text of invalid) expect(() => decodeExport(text), text.slice(0, 80)).toThrow(InvalidExportError);
    expect(() => decodeExport(JSON.stringify({ ...good, version: 99 }))).toThrow(NewerExportError);
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/exchange.test.ts`
Expected: FAIL with `Cannot find module './exchange'`.

- [ ] **Step 2: Implement**

`packages/db/src/exchange.ts`:
```ts
import { base64ToBytes, bytesToBase64, IMMUTABLE_TABLES, parseHlc, SYNCED_COLUMNS, type SqlValue, type SyncedTable } from '@jot/core';
import type { Library } from './library';
import type { RowImage } from './ops';
import { rebuildDerived } from './rebuild';
import { repairTagGraph } from './tags';

export const EXPORT_FORMAT = 'jot-library';
export const EXPORT_VERSION = 1;

/** A whole library as a file (spec §6.7): every synced row, tombstones included, with its clocks. */
export interface LibraryExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  rows: RowImage[];
}

/** What an import brought in (live items in the file). */
export interface ImportSummary {
  articles: number;
  markups: number;
  sideNotes: number;
  memos: number;
  tags: number;
}

export class InvalidExportError extends Error {
  constructor(reason: string) {
    super(`Not a Jot library export: ${reason}`);
    this.name = 'InvalidExportError';
  }
}

export class NewerExportError extends Error {
  constructor(version: number) {
    super(`This export was made by a newer version of Jot (format version ${version})`);
    this.name = 'NewerExportError';
  }
}

export async function exportLibrary(lib: Library): Promise<LibraryExport> {
  const rows: RowImage[] = [];
  for (const table of Object.keys(SYNCED_COLUMNS) as SyncedTable[]) {
    const cols = SYNCED_COLUMNS[table] as readonly string[];
    const immutable = IMMUTABLE_TABLES.has(table);
    const select = ['id', 'hlc', ...(immutable ? [] : ['fhlc']), ...cols].map((c) => `"${c}"`).join(', ');
    for (const r of await lib.driver.query<Record<string, SqlValue>>(`SELECT ${select} FROM "${table}" ORDER BY id`)) {
      rows.push({
        table,
        id: String(r.id),
        hlc: String(r.hlc),
        fhlc: immutable ? {} : (JSON.parse(String(r.fhlc)) as Record<string, string>),
        fields: Object.fromEntries(cols.map((c) => [c, r[c] ?? null])),
      });
    }
  }
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: lib.now(), rows };
}

/** The export as JSON text; BLOBs (memo updates) as `{ "$blob": base64 }`, as in encoded ops. */
export function encodeExport(data: LibraryExport): string {
  return JSON.stringify(data, (_key, value: unknown) => (value instanceof Uint8Array ? { $blob: bytesToBase64(value) } : value));
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array);

const isHlc = (v: unknown): v is string => {
  if (typeof v !== 'string') return false;
  try {
    parseHlc(v);
    return true;
  } catch {
    return false;
  }
};

function checkRow(row: unknown, i: number): RowImage {
  const bad = (why: string) => new InvalidExportError(`row ${i}: ${why}`);
  if (!isRecord(row)) throw bad('not an object');
  const { table, id, hlc, fhlc, fields } = row;
  if (typeof table !== 'string' || !Object.hasOwn(SYNCED_COLUMNS, table)) throw bad('unknown table');
  if (typeof id !== 'string' || id === '') throw bad('no id');
  if (!isHlc(hlc)) throw bad('bad clock');
  if (!isRecord(fields)) throw bad('no fields');
  const allowed = SYNCED_COLUMNS[table as SyncedTable] as readonly string[];
  if (!isRecord(fhlc) || !Object.entries(fhlc).every(([col, stamp]) => allowed.includes(col) && isHlc(stamp))) {
    throw bad('bad field clocks');
  }
  for (const [col, value] of Object.entries(fields)) {
    if (!allowed.includes(col)) throw bad(`unknown column ${JSON.stringify(col)}`);
    const blobAllowed = table === 'memo_update' && col === 'data';
    const ok = value === null || typeof value === 'string' || typeof value === 'number' || (blobAllowed && value instanceof Uint8Array);
    if (!ok) throw bad(`bad value in ${col}`);
  }
  // A row that is new here is inserted whole, so every column must be present.
  for (const col of allowed) if (!Object.hasOwn(fields, col)) throw bad(`missing column ${col}`);
  return { table: table as SyncedTable, id, hlc, fhlc: fhlc as Record<string, string>, fields: fields as Record<string, SqlValue> };
}

/** Parses an export and checks its format, version, tables, columns, clocks and values; nothing is written. */
export function decodeExport(text: string): LibraryExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, (_key, value: unknown) => {
      if (isRecord(value) && Object.keys(value).length === 1 && typeof value.$blob === 'string') return base64ToBytes(value.$blob);
      return value;
    });
  } catch {
    throw new InvalidExportError('not JSON');
  }
  if (!isRecord(parsed) || parsed.format !== EXPORT_FORMAT) throw new InvalidExportError('unknown format');
  if (typeof parsed.version !== 'number') throw new InvalidExportError('no version');
  if (parsed.version > EXPORT_VERSION) throw new NewerExportError(parsed.version);
  if (!Array.isArray(parsed.rows)) throw new InvalidExportError('no rows');
  const rows = parsed.rows.map((row, i) => checkRow(row, i));
  return { format: EXPORT_FORMAT, version: parsed.version, exportedAt: Number(parsed.exportedAt) || 0, rows };
}

/**
 * Merges an exported library into this one (spec §6.7): every row by per-field latest-edit-wins, so a
 * second import, or one into a library with newer edits, changes nothing it shouldn't. Then the derived
 * tables are rebuilt and the tag graph repaired (§6.4). Memo links and text are refreshed by the caller,
 * which can read memo documents (`refreshMemoDerived`).
 */
export async function importLibrary(lib: Library, data: LibraryExport): Promise<ImportSummary> {
  await lib.applyRows(data.rows);
  await rebuildDerived(lib);
  await repairTagGraph(lib);
  lib.announce();
  const live = (table: SyncedTable) => data.rows.filter((r) => r.table === table && r.fields.deleted !== 1).length;
  return { articles: live('article'), markups: live('markup'), sideNotes: live('side_note'), memos: live('memo'), tags: live('tag') };
}
```

Append to `packages/db/src/index.ts`:
```ts
export * from './exchange';
```

- [ ] **Step 3: Run the tests, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db/src/exchange.test.ts && pnpm test && pnpm typecheck && pnpm lint'`
Expected: the 5 new tests pass, every other test passes, and there are no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "feat(db): export the library as a file, and import it by per-field clocks with validation"
```

---

### Task 4: Export and import in the app

**Files:**
- Create:
  - `apps/client/src/data/libraryFile.ts` and `libraryFile.test.ts`
  - `apps/client/src/data/notices.ts`
  - `apps/client/src/platform/files.ts` and `files.test.ts`
  - `apps/client/src/components/LibraryData.tsx`
  - `apps/client/src/components/NoticeBanner.tsx`
  - `apps/client/e2e/data.spec.ts`
- Modify:
  - `apps/client/src/components/Sidebar.tsx`
  - `apps/client/src/components/Shell.tsx`
  - `apps/client/src/i18n/en.ts` and `zh-CN.ts` (a `data` block)
  - `apps/client/src/styles/app.css`
- Test: `apps/client/src/data/libraryFile.test.ts`, `apps/client/src/platform/files.test.ts`, `apps/client/e2e/data.spec.ts`

**Interfaces:**
- Consumes:
  - from Tasks 2–3: `exportLibrary`, `encodeExport`, `decodeExport`, `importLibrary`, `refreshMemoDerived`, `liveMemoIds`, `InvalidExportError` and `NewerExportError`;
  - from plan 3: `openMemoDoc` and `memoDerived`;
  - from plan 1: `InvokeFn` and `isTauri`.
- Produces:
  - `exportFileName(kind: 'library' | 'backup', date?)`, for example `jot-library-20260927-0905.json` and `jot-backup-20260927-0905.sqlite`.
  - `exportLibraryText(lib)`.
  - `importLibraryText(lib, text): Promise<ImportSummary>`. It decodes the file, imports it, rebuilds every memo's derived data from its Yjs document, and announces the change.
  - `showNotice(text)` / `onNotice(listener)`, and `<NoticeBanner />` with test ID `notice`.
  - `saveTextFile(name, text, call?)`:
    - desktop: `invoke('save_text_file', { name, text })`, which returns the saved path (the command itself arrives in Task 5);
    - web: a browser download, which returns `null`.
  - `<LibraryData />` in the sidebar footer, with test IDs `library-export`, `library-import` and `library-import-file`. Task 5 adds `library-backup`.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/data/libraryFile.test.ts`:
```ts
// @vitest-environment happy-dom
import { captureAnchor } from '@jot/core';
import { appendMemoUpdate, createArticle, createMemo, createQuote, getArticle, Library, listBacklinks, search } from '@jot/db';
import { createNodeDriver } from '@jot/db/testing/node';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { AnchorLink } from '../memo/anchorLink';
import { exportFileName, exportLibraryText, importLibraryText } from './libraryFile';

describe('library file', () => {
  it('names files by kind and local time', () => {
    const d = new Date(2026, 8, 27, 9, 5);
    expect(exportFileName('library', d)).toBe('jot-library-20260927-0905.json');
    expect(exportFileName('backup', d)).toBe('jot-backup-20260927-0905.sqlite');
  });

  it('carries memos across, rebuilding their links and searchable text from their documents (Review Focus 4)', async () => {
    const a = await Library.open(createNodeDriver());
    const { articleId, revisionId } = await createArticle(a, { title: '春', importKind: 'paste', blocks: [{ k: 'p', runs: [{ t: '他用比喻写春天。' }] }] });
    const text = (await getArticle(a, articleId))!.text;
    const quoteId = await createQuote(a, { articleId, revisionId, anchor: captureAnchor(text, 2, 4) });
    const memoId = await createMemo(a, { title: '札记', homeArticleId: articleId });
    const doc = new Y.Doc();
    prosemirrorJSONToYXmlFragment(
      getSchema([StarterKit, AnchorLink]),
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '论' },
              { type: 'anchorLink', attrs: { linkId: 'l1', targetType: 'anchor', targetId: quoteId, articleId, label: '比喻' } },
            ],
          },
        ],
      },
      doc.getXmlFragment('default'),
    );
    // The derived data is left empty on purpose: the import must rebuild it from the document.
    await appendMemoUpdate(a, memoId, Y.encodeStateAsUpdate(doc), { text: '', links: [] });

    const b = await Library.open(createNodeDriver());
    expect(await importLibraryText(b, await exportLibraryText(a))).toMatchObject({ articles: 1, memos: 1 });
    expect((await search(b.driver, { text: '论比喻', types: ['memo'] })).map((h) => h.entityId)).toEqual([memoId]);
    expect((await listBacklinks(b, articleId)).map((l) => l.memoId)).toEqual([memoId]);
  });
});
```

`apps/client/src/platform/files.test.ts`:
```ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveTextFile } from './files';
import type { InvokeFn } from './tauri';

describe('saveTextFile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads the file in the browser', async () => {
    const clicked: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    expect(await saveTextFile('jot-library-20260927-0905.json', '{}', null)).toBeNull();
    expect(clicked).toEqual(['jot-library-20260927-0905.json']);
  });

  it('on the desktop, hands the file to the app, which says where it went', async () => {
    const calls: unknown[] = [];
    const call = (async (cmd: string, args: Record<string, unknown>) => {
      calls.push([cmd, args]);
      return '/home/u/Downloads/jot-library-20260927-0905.json';
    }) as InvokeFn;
    expect(await saveTextFile('jot-library-20260927-0905.json', '{}', call)).toBe('/home/u/Downloads/jot-library-20260927-0905.json');
    expect(calls).toEqual([['save_text_file', { name: 'jot-library-20260927-0905.json', text: '{}' }]]);
  });
});
```

`apps/client/e2e/data.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { addTag, importText, openApp, selectText } from './helpers';

test('exports the library and imports it into a fresh one (spec §10 step 6)', async ({ page }) => {
  await openApp(page);
  await importText(page, '春', '春风又绿江南岸。他用比喻写春天。');
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('以景起兴');
  await addTag(page, 'note-tags', '修辞');
  await expect(page.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
  await selectText(page, '春风');
  await page.getByTestId('toolbar-quote').click();
  await expect(page.getByTestId('memo-editor').locator('.anchor-chip')).toHaveText(['春风']);
  await page.keyboard.insertText('写景起笔');
  await page.waitForTimeout(1_000);

  const downloading = page.waitForEvent('download');
  await page.getByTestId('library-export').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^jot-library-\d{8}-\d{4}\.json$/);
  const file = test.info().outputPath('library.json');
  await download.saveAs(file);

  const fresh = await page.context().newPage();
  await openApp(fresh);
  await expect(fresh.getByTestId('library-empty')).toBeVisible();
  fresh.once('dialog', (dialog) => void dialog.accept());
  await fresh.getByTestId('library-import-file').setInputFiles(file);
  await expect(fresh.getByTestId('notice')).toContainText('articles: 1');
  await fresh.getByRole('link', { name: '春' }).click();
  await expect(fresh.locator('.mk-highlight')).toHaveText(['比喻']);
  await expect(fresh.getByTestId('side-note').locator('textarea')).toHaveValue('以景起兴');
  await expect(fresh.getByTestId('note-tags').getByTestId('tag-chip')).toHaveText(['修辞']);
  await expect(fresh.getByTestId('memo-editor')).toContainText('写景起笔');
  await expect(fresh.locator('.cited')).toHaveText('春风');
  await fresh.getByTestId('search-input').fill('起兴');
  await expect(fresh.getByTestId('search-result')).toHaveCount(1);
});

test('refuses a file that is not a Jot export, and changes nothing (Review Focus 3)', async ({ page }) => {
  await openApp(page);
  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .getByTestId('library-import-file')
    .setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') });
  await expect(page.getByTestId('error-banner')).toContainText('isn’t a Jot library export');
  await expect(page.getByTestId('library-empty')).toBeVisible();
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/data/libraryFile.test.ts apps/client/src/platform/files.test.ts`
Expected: FAIL with `Cannot find module './libraryFile'` and `'./files'`.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e data --project chromium --timeout 20000`
Expected: FAIL: there is no `library-export`.

If `URL.createObjectURL` doesn't exist in happy-dom (the spy throws "does not exist"), define both functions with `vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined }))` in that test, and record a ruling.

- [ ] **Step 2: Implement the file helpers and notices**

`apps/client/src/data/libraryFile.ts`:
```ts
import { decodeExport, encodeExport, exportLibrary, importLibrary, liveMemoIds, refreshMemoDerived, type ImportSummary, type Library } from '@jot/db';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { memoDerived } from '../memo/memoDerived';
import { openMemoDoc } from '../memo/openMemoDoc';

const pad = (n: number) => String(n).padStart(2, '0');

/** For example `jot-library-20260927-0905.json`, in local time. */
export function exportFileName(kind: 'library' | 'backup', date = new Date()): string {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return kind === 'library' ? `jot-library-${stamp}.json` : `jot-backup-${stamp}.sqlite`;
}

export async function exportLibraryText(lib: Library): Promise<string> {
  return encodeExport(await exportLibrary(lib));
}

/**
 * Imports an exported library (spec §6.7), then rebuilds every memo's links and text from its document —
 * the database can't read Yjs documents, so this part lives here.
 */
export async function importLibraryText(lib: Library, text: string): Promise<ImportSummary> {
  const summary = await importLibrary(lib, decodeExport(text));
  for (const id of await liveMemoIds(lib)) {
    const doc = await openMemoDoc(lib, id);
    await refreshMemoDerived(lib, id, memoDerived(yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default'))));
  }
  lib.announce();
  return summary;
}
```

`apps/client/src/data/notices.ts`:
```ts
type NoticeListener = (text: string) => void;

const listeners = new Set<NoticeListener>();

/** Tells the user something finished (an export saved, an import done), via <NoticeBanner>. */
export function showNotice(text: string): void {
  for (const listener of listeners) listener(text);
}

export function onNotice(listener: NoticeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

`apps/client/src/platform/files.ts`:
```ts
import { invoke } from '@tauri-apps/api/core';
import { isTauri, type InvokeFn } from './tauri';

/**
 * Saves text as a file the user keeps. On the desktop the app writes it into the Downloads folder and
 * returns its path; in the browser it becomes a download (and the path isn't known: null).
 */
export async function saveTextFile(name: string, text: string, call: InvokeFn | null = isTauri() ? invoke : null): Promise<string | null> {
  if (call) return call<string>('save_text_file', { name, text });
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null;
}
```

- [ ] **Step 3: Implement the sidebar controls and the notice banner**

`apps/client/src/components/NoticeBanner.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { onNotice } from '../data/notices';

/** Shows what a finished action did (an export saved, an import done) until dismissed. */
export function NoticeBanner() {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => onNotice(setText), []);

  if (!text) return null;
  return (
    <div className="notice-banner" role="status" data-testid="notice">
      <span>{text}</span>
      <button type="button" onClick={() => setText(null)}>
        {t('app.dismiss')}
      </button>
    </div>
  );
}
```

`apps/client/src/components/LibraryData.tsx`:
```tsx
import { InvalidExportError, NewerExportError } from '@jot/db';
import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary } from '../data/LibraryContext';
import { exportFileName, exportLibraryText, importLibraryText } from '../data/libraryFile';
import { showNotice } from '../data/notices';
import { saveTextFile } from '../platform/files';

/** Exporting and importing the whole library (spec §6.7). */
export function LibraryData() {
  const { t } = useTranslation();
  const lib = useLibrary();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      if (error instanceof NewerExportError) reportError(new Error(t('data.newer')));
      else if (error instanceof InvalidExportError) reportError(new Error(t('data.invalid')));
      else reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const exportNow = () =>
    run(async () => {
      const name = exportFileName('library');
      const where = await saveTextFile(name, await exportLibraryText(lib));
      showNotice(where ? t('data.savedTo', { path: where }) : t('data.exported', { name }));
    });

  const onImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !window.confirm(t('data.confirmImport', { name: file.name }))) return;
    void run(async () => {
      const summary = await importLibraryText(lib, await file.text());
      showNotice(t('data.imported', { ...summary }));
    });
  };

  return (
    <div className="library-data">
      <button type="button" className="quiet" disabled={busy} onClick={() => void exportNow()} data-testid="library-export">
        {t('data.export')}
      </button>
      <button type="button" className="quiet" disabled={busy} onClick={() => fileRef.current?.click()} data-testid="library-import">
        {t('data.import')}
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImportFile} data-testid="library-import-file" />
      {busy && <span className="muted">{t('data.busy')}</span>}
    </div>
  );
}
```

In `apps/client/src/components/Sidebar.tsx`:
- add `import { LibraryData } from './LibraryData';` after the `./SearchPanel` import
- make `<LibraryData />` the first child of `<footer>`

In `apps/client/src/components/Shell.tsx`:
- add `import { NoticeBanner } from './NoticeBanner';` after the `./MemoPane` import
- add `<NoticeBanner />` directly after `<ErrorBanner />`

In `apps/client/src/i18n/en.ts`, add after the `orphans` block:
```ts
  data: {
    export: 'Export library',
    import: 'Import…',
    backup: 'Back up database',
    exported: 'Exported the library as {{name}} (see your downloads).',
    savedTo: 'Saved to {{path}}',
    confirmImport: 'Import “{{name}}”? Its items are merged into this library; where both have the same item, the newer edit wins.',
    imported: 'Imported — articles: {{articles}}, markups: {{markups}}, side notes: {{sideNotes}}, memos: {{memos}}, tags: {{tags}}.',
    invalid: 'This file isn’t a Jot library export.',
    newer: 'This export was made by a newer version of Jot. Update Jot to import it.',
    busy: 'Working…',
  },
```

In `apps/client/src/i18n/zh-CN.ts`, add after the `orphans` block:
```ts
  data: {
    export: '导出文库',
    import: '导入…',
    backup: '备份数据库',
    exported: '已导出文库：{{name}}（见浏览器下载）。',
    savedTo: '已保存到 {{path}}',
    confirmImport: '导入“{{name}}”？其中的条目会并入当前文库；同一条目以较新的修改为准。',
    imported: '已导入——文章：{{articles}}，标注：{{markups}}，旁注：{{sideNotes}}，札记：{{memos}}，标签：{{tags}}。',
    invalid: '这不是 Jot 导出的文库文件。',
    newer: '这个文件由更新版本的 Jot 导出，请先更新 Jot。',
    busy: '处理中…',
  },
```

Append to `apps/client/src/styles/app.css`:
```css
/* Library data and notices */
.library-data { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-bottom: 8px; }
.library-data .quiet { padding: 0; }
.notice-banner { position: fixed; right: 16px; bottom: 16px; z-index: 30; display: flex; align-items: center; gap: 8px; max-width: min(520px, calc(100vw - 32px)); padding: 8px 12px; font-size: 13px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); }
.notice-banner span { overflow-wrap: anywhere; }
```

- [ ] **Step 4: Run the unit tests, then the data end-to-end tests on both browsers plus regressions**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes (4 new ones), with no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e data shell import`
Expected: data passes 2 on each browser; shell and import are unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client): export the library to a file and import it, rebuilding memo links"
```

---

### Task 5: Desktop: save exports and back up the database

**Files:**
- Create: `apps/desktop/src-tauri/src/files.rs`
- Modify:
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/src-tauri/Cargo.toml` (`rusqlite` feature `backup`)
  - `apps/client/src/platform/files.ts` and `files.test.ts` (`backupDatabase`)
  - `apps/client/src/components/LibraryData.tsx` (a backup button on desktop)
- Test: the Rust tests in `files.rs`, and `apps/client/src/platform/files.test.ts`

**Interfaces:**
- Consumes: `db::Db`, `db::configure`, Tauri's `PathResolver::download_dir`, and `rusqlite::MAIN_DB` with `Connection::backup`.
- Produces:
  - Rust helpers:
    - `safe_file_name(name, extensions)`
    - `unique_path(dir, name)`
    - `backup_to(conn, target)`
  - Commands:
    - `save_text_file(name, text) -> path`, which accepts `.json` only;
    - `db_backup(name) -> path`, which accepts `.sqlite` only.

    Both write only into Downloads and never overwrite an existing file.
  - `backupDatabase(name, call = invoke): Promise<string>`.
  - A `library-backup` button, shown on desktop only.

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/src-tauri/src/files.rs` with only its tests for now:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("jot-files-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn accepts_plain_names_and_refuses_paths_or_other_types() {
        assert!(safe_file_name("jot-library-20260927-0905.json", &[".json"]).is_ok());
        for bad in ["../evil.json", "a/b.json", "a\\b.json", "C:evil.json", ".json", "x.exe", "x.sqlite", "", "空.json"] {
            assert!(safe_file_name(bad, &[".json"]).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn never_overwrites_an_existing_file() {
        let dir = temp_dir("unique");
        std::fs::write(dir.join("a.json"), "x").unwrap();
        std::fs::write(dir.join("a-1.json"), "x").unwrap();
        assert_eq!(unique_path(&dir, "a.json"), dir.join("a-2.json"));
        assert_eq!(unique_path(&dir, "b.json"), dir.join("b.json"));
    }

    #[test]
    fn backs_up_to_a_consistent_copy_that_opens() {
        let dir = temp_dir("backup");
        let conn = Connection::open(dir.join("live.sqlite3")).unwrap();
        crate::db::configure(&conn).unwrap();
        conn.execute_batch("CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('春风');").unwrap();
        let target = dir.join("copy.sqlite");
        backup_to(&conn, &target).unwrap();
        let copy = Connection::open(&target).unwrap();
        let x: String = copy.query_row("SELECT x FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(x, "春风");
    }
}
```
In `apps/desktop/src-tauri/src/lib.rs`, add `mod files;` after `mod db;`.

In `apps/client/src/platform/files.test.ts`, add `backupDatabase` to the `./files` import, and add this test inside the `describe` block:
```ts
  it('asks the desktop app for a database backup under the given name', async () => {
    const calls: unknown[] = [];
    const call = (async (cmd: string, args: Record<string, unknown>) => {
      calls.push([cmd, args]);
      return '/home/u/Downloads/jot-backup-20260927-0905.sqlite';
    }) as InvokeFn;
    expect(await backupDatabase('jot-backup-20260927-0905.sqlite', call)).toBe('/home/u/Downloads/jot-backup-20260927-0905.sqlite');
    expect(calls).toEqual([['db_backup', { name: 'jot-backup-20260927-0905.sqlite' }]]);
  });
```

Run: `docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test files'`
Expected: FAIL to compile. `safe_file_name`, `unique_path` and `backup_to` are not found.

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/platform/files.test.ts`
Expected: FAIL: `backupDatabase` is not exported.

- [ ] **Step 2: Implement**

In `apps/desktop/src-tauri/Cargo.toml`, change the rusqlite line to:
```toml
rusqlite = { version = "0.37", features = ["bundled", "limits", "backup"] }
```

Put this above the `#[cfg(test)]` module in `apps/desktop/src-tauri/src/files.rs`:
```rust
//! Files the app writes for the user: library exports and database backups. The page only supplies a
//! plain file name; everything goes into the Downloads folder and nothing is ever overwritten.

use crate::db::Db;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// A name the page may ask for: letters, digits, `.`, `-` and `_` only, not hidden, with an allowed extension.
pub fn safe_file_name(name: &str, extensions: &[&str]) -> Result<String, String> {
    let plain = !name.is_empty()
        && name.len() <= 100
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    if plain && extensions.iter().any(|ext| name.ends_with(ext) && name.len() > ext.len()) {
        Ok(name.to_string())
    } else {
        Err(format!("unsupported file name: {name}"))
    }
}

/// `dir/name`, or `dir/stem-1.ext`, `dir/stem-2.ext`, … when that exists: never an existing file.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = name.rfind('.').map_or((name, ""), |i| (&name[..i], &name[i..]));
    (1..)
        .map(|n| dir.join(format!("{stem}-{n}{ext}")))
        .find(|path| !path.exists())
        .expect("a free file name")
}

/// Copies the open database with SQLite's online backup, so the copy is consistent even mid-write.
pub fn backup_to(conn: &Connection, target: &Path) -> rusqlite::Result<()> {
    conn.backup(rusqlite::MAIN_DB, target, None)
}

fn downloads(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Saves a library export (JSON) into Downloads; returns the path it went to.
#[tauri::command]
pub async fn save_text_file(app: tauri::AppHandle, name: String, text: String) -> Result<String, String> {
    let name = safe_file_name(&name, &[".json"])?;
    let path = unique_path(&downloads(&app)?, &name);
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Writes a backup copy of the library database into Downloads; returns its path.
#[tauri::command]
pub async fn db_backup(app: tauri::AppHandle, db: tauri::State<'_, Db>, name: String) -> Result<String, String> {
    let name = safe_file_name(&name, &[".sqlite"])?;
    let path = unique_path(&downloads(&app)?, &name);
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    backup_to(&conn, &path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
```

In `apps/desktop/src-tauri/src/lib.rs`, change the handler list to `tauri::generate_handler![db::db_query, db::db_batch, files::save_text_file, files::db_backup]`.

If `crate::db::configure` isn't `pub`, make it `pub` (it is already used by `open`).

Append to `apps/client/src/platform/files.ts`:
```ts
/** Desktop only: a consistent copy of the library database in the Downloads folder; returns its path. */
export function backupDatabase(name: string, call: InvokeFn = invoke): Promise<string> {
  return call<string>('db_backup', { name });
}
```

In `apps/client/src/components/LibraryData.tsx`:
1. Change the files import to `import { backupDatabase, saveTextFile } from '../platform/files';` and add `import { isTauri } from '../platform/tauri';`.
2. After `exportNow`, add:
```tsx
  const backupNow = () =>
    run(async () => {
      showNotice(t('data.savedTo', { path: await backupDatabase(exportFileName('backup')) }));
    });
```
3. After the import button, add:
```tsx
      {isTauri() && (
        <button type="button" className="quiet" disabled={busy} onClick={() => void backupNow()} data-testid="library-backup">
          {t('data.backup')}
        </button>
      )}
```

- [ ] **Step 3: Run the Rust and client tests**

Run: `docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'`
Expected: every Rust test passes (3 new ones in `files`).

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

- [ ] **Step 4: Check the desktop window**

1. Run `docker compose up -d desktop`.
2. Take a screenshot, retrying until it succeeds: `until docker compose exec -T -u node desktop node apps/desktop/scripts/screenshot.mjs Jot .screenshots/desktop-data.png; do sleep 5; done`
3. Open the PNG. The sidebar footer should show **导出文库 / 导入… / 备份数据库**.
4. Run `docker compose stop desktop`.

Files saved from the container's window land in the container's own Downloads folder. So before this task counts as complete, ask the user to try export, import and backup in a real Windows or macOS build (from Task 6's workflow, once the repository is on GitHub).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop apps/client
git commit -m "feat(desktop): save exports and database backups into Downloads, never overwriting"
```

---

### Task 6: Desktop builds in CI, docs, and the full verification

**Files:**
- Create: `.github/workflows/desktop.yml`
- Modify: `README.md`, `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` (§6.7, §7)
- Test: actionlint on the workflow, a local release compile, and the complete verification

**Interfaces:**
- Consumes: everything above.
- Produces:
  - A `desktop` workflow that builds unsigned Windows and macOS (arm64 and x64) bundles as workflow artifacts. It runs manually or on `v*` tags.
  - Updated docs.

- [ ] **Step 1: Write the workflow**

`.github/workflows/desktop.yml`:
```yaml
name: desktop

on:
  workflow_dispatch:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            args: ''
          - platform: macos-latest
            args: '--target aarch64-apple-darwin'
          - platform: macos-latest
            args: '--target x86_64-apple-darwin'
    runs-on: ${{ matrix.platform }}
    timeout-minutes: 60
    env:
      # The preinstall guard keeps installs off developers' machines; CI runners are throwaway VMs.
      IN_JOT_CONTAINER: '1'
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: apps/desktop/src-tauri -> target

      - run: pnpm install --frozen-lockfile

      # Unsigned builds (signing and notarization come with sub-project 3), kept as workflow artifacts.
      - uses: tauri-apps/tauri-action@v1
        with:
          projectPath: apps/desktop
          tauriScript: pnpm tauri
          args: ${{ matrix.args }}
          uploadWorkflowArtifacts: true
```

- [ ] **Step 2: Check the workflow and the release build locally**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color`
Expected: no findings. If the image pull is refused, record a ruling and rely on the review.

Run: `docker compose run --rm -T dev sh -c 'cd apps/desktop && pnpm tauri build --no-bundle'`
Expected: the release build of the frontend and the Rust app succeeds. This is the same `tauri build` the workflow runs, minus bundling and signing.

- [ ] **Step 3: Update the spec and README**

In `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`:
1. Replace the two bullets of §6.7 with:
```markdown
- **JSON export and import:** every synced table, versioned (`format: 'jot-library'`, `version: 1`).
  - An export holds every row, tombstones included, with its per-field clocks.
  - An import merges rows by per-field latest-edit-wins without the outbox, so importing twice, or into a library with newer edits, changes nothing it shouldn't.
  - After an import, the derived tables are rebuilt (memo links from the memo documents) and the tag graph is repaired (§6.4).
  - Files that aren't valid exports are refused before anything is written.
- **Desktop `.sqlite` backup:** SQLite's online backup of the open database into the Downloads folder.
- **Desktop file writes** go only into Downloads, under names the app validates, and never overwrite a file.
```
2. At the end of §7, add:
```markdown
**Desktop builds (plan 6):** `.github/workflows/desktop.yml` builds unsigned Windows and macOS (arm64 and x64) bundles with `tauri-apps/tauri-action@v1`. It runs manually or on `v*` tags, and keeps the bundles as workflow artifacts.
```

In `README.md`, add after the "Development (Docker only)" section:
```markdown
## Your data

- **Export library** (sidebar footer) saves everything as one JSON file. **Import…** merges such a file into
  any library; where both have the same item, the newer edit wins.
- On desktop, **Back up database** saves a copy of the database file into your Downloads folder.
- Until sync arrives, the web version keeps the library only in this browser: export it now and then.

## Desktop builds

The `desktop` GitHub Actions workflow (run it by hand, or push a `v*` tag) builds Windows and macOS (Apple
silicon and Intel) installers and attaches them to the run as artifacts. They are unsigned for now:
- on macOS, right-click the app and choose **Open** the first time;
- on Windows, choose **More info → Run anyway**.
```

- [ ] **Step 4: Run the complete verification on freshly started services**

Run:
```bash
docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test'
docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'
docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright
until docker compose exec -T web node -e "require('net').connect(3000,'localhost').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; do sleep 2; done
docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e
```
Expected: every command exits 0. The e2e run has no failures, and the only skips are the known WebKit ones and the Chromium-only input-method tests.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/desktop.yml README.md docs/superpowers/specs/2026-09-27-jot-core-app-design.md
git commit -m "ci: build unsigned Windows and macOS desktop bundles; docs for export, import and backup"
```

---

## Done when

- A writer can:
  - export the whole library to a JSON file;
  - import it into a fresh library (web or desktop) and find everything there: articles, markups, side notes, tags and their tree, memos with working links and cited marks, and search;
  - import the same file again without duplicates.
- Files that aren't Jot exports are refused with a clear message.
- On desktop, **Back up database** writes a consistent copy into Downloads.
- Spec §10 step 6 passes as an end-to-end test.
- `desktop.yml` passes actionlint, and the release build compiles locally.
- `pnpm typecheck && pnpm lint && pnpm test` and `cargo test` pass, and the e2e suite passes on Chromium and WebKit.
