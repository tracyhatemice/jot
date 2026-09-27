# Jot Plan 5: Fix-up Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer can correct typos and import errors in an article's text. Everything that points into the text follows the correction:
- markups
- side notes
- memo links
- the "cited" marks
- search

Markups whose words disappeared are listed so the writer can re-attach or delete them.

**Architecture:**
- A new database function `saveRevision` stores the edited blocks as a new, never-changed revision. It points the article at that revision and re-attaches every anchor of the article to it with core's existing `createReanchorer`. Each anchor is re-attached from the revision it was captured on, so the result is deterministic. The results go only into the device-local `anchor_res` table.
- The client gets:
  - a fix-up mode that swaps the read-only article view for an editable ProseMirror view with the same flat schema;
  - a panel listing orphaned markups, with a "select new text to re-attach" flow.

**Tech Stack:** The same as plans 1–4, plus `prosemirror-commands`, `prosemirror-keymap` and `prosemirror-history` (MIT).

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`. The relevant sections are:
- §5.3 (positions are resolved locally)
- §6.2 (anchoring and reattaching)
- §6.6 (fix-up edit mode)
- §10 acceptance step 5

**Series:** This is plan 5 of 6. Plan 6 covers:
- JSON export and import
- a desktop `.sqlite` backup
- CI desktop builds for Windows and macOS

`.docx` import is deferred at the user's request (decided when this plan was reviewed). Task 4 records that in the spec.

**Branch:** `plan-5-fixup`

## Global Constraints

- **Plan 1–4 constraints all still apply:**
  - Docker only.
  - Node ≥ 24, pnpm 10, TypeScript ~5.9, `verbatimModuleSyntax`.
  - `SqlDriver` has only `query` and `batch`.
  - Synced tables are written only through `Library.commit`.
  - Dependencies must be MIT, BSD or Apache licensed.
  - Every user-facing string goes through i18next, with identical keys in `zh-CN` and `en`.
  - No `dangerouslySetInnerHTML`.
  - Unicode escapes are written as `\u{XXXX}`.
  - Conventional commits with **no attribution lines**.
- **Commands:**
  - Run: `docker compose run --rm -T -e NO_COLOR=1 dev <cmd>`.
  - End-to-end: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e [spec]`.
  - After adding dependencies, run `docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright`. Then wait until the Playwright server accepts connections:
    `until docker compose exec -T web node -e "require('net').connect(3000,'localhost').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; do sleep 2; done`
- **Revisions are never changed after they are written (spec §5.2):**
  - Saving a fix-up creates a new `article_revision` whose `parent_id` is the previous current revision, and moves `article.current_revision_id` to it.
  - The title is not edited here.
- **Anchors are never changed either (spec §5.3):**
  - Re-attachment writes only the local `anchor_res` table.
  - Each anchor is re-attached from its own `revision_id` text to the new current text. A series of edits therefore ends where a single edit would, and every device gets the same answer.
  - Re-attaching a markup by hand creates a new anchor on the current revision, points the markup at it, and tombstones the old anchor.
- **Statuses (spec §6.2):** `exact`, `mapped`, `fuzzy` and `orphan`. Orphans are:
  - not drawn in the article;
  - hidden from the margin;
  - listed in the orphaned-markups panel.

  A memo link or search result that leads to an orphan explains that the passage can't be found. It never flashes stale offsets.
- **Refresh rule for queries:** any query that reads `anchor_res` also lists `'article'` in its tables, because a fix-up commit writes `article` and `article_revision` and rewrites `anchor_res` in the same transaction. This was a plan-4 deferred minor.

## Review Focus

These five inputs aren't covered by the happy paths and are most likely to bite. Each one has a test in the task that owns the code.

1. **Edits that touch marked words**, where the marked phrase also appears elsewhere in the text.
   - Expected: a markup whose words were deleted becomes an orphan and is never moved onto another copy of the same words. A slightly changed passage is found again by its surroundings.
   - Tests: Task 1 (unit).
2. **Everything that points into the text after an edit.**
   - Expected: memo chips jump to the moved words. The "cited" underline, side notes and search all follow the new text.
   - Tests: Task 1 (search, quotes), Task 2 (end-to-end: chip, cited mark, side note).
3. **Chinese typed with an input method in fix-up mode.**
   - Expected: the composed characters are saved, and no stray pinyin is. This is risk check M0.3.
   - Tests: Task 2 (end-to-end, composition driven through Chromium's DevTools protocol).
4. **Saving with nothing changed, or with the text emptied.**
   - Expected: nothing changed means no new revision and a "no changes" note. Empty text is refused with a message, and the editor stays open.
   - Tests: Task 1 (unit), Task 2 (end-to-end).
5. **Joining or splitting paragraphs while fixing the text** (Backspace at a paragraph start, Enter in the middle of one).
   - Expected: markups after the join or split move by exactly the paragraph break and keep their words.
   - Tests: Task 1 (unit).

---

## File Map

```
packages/db/src/revisions.ts                 saveRevision, RevisionResult                      Task 1
packages/db/src/markups.ts                   anchorResStatement(status, score), reattachMarkup  Task 1
apps/client/src/article/schema.ts            + docToBlocks                                     Task 2
apps/client/src/components/ArticleEditor.tsx the editable view                                 Task 2
apps/client/src/components/ArticlePane.tsx   fix-up mode (Task 2), orphans + re-attach (Task 3)
apps/client/src/components/OrphanPanel.tsx, SelectionToolbar.tsx, Shell.tsx                    Task 3
docs/superpowers/specs/…design.md, README.md                                                   Task 4
apps/client/e2e/edit.spec.ts, orphans.spec.ts                                                  Tasks 2–3
```

---

### Task 1: Save a fix-up as a new revision and re-attach every anchor

**Files:**
- Create: `packages/db/src/revisions.ts`, `packages/db/src/revisions.test.ts`
- Modify: `packages/db/src/markups.ts`, `packages/db/src/index.ts`
- Test: `packages/db/src/revisions.test.ts`

**Interfaces:**
- Consumes:
  - `createReanchorer`, `StoredAnchor`, `Resolution`, `ResolutionStatus`, `canonicalText`, `normalizeBlocks`, `detectLang` and `newId` (core);
  - `getArticle`, `EmptyArticleError`, `indexStatements`, `anchorInput` and `EmptySelectionError`.
- Produces:
  - `interface RevisionResult { revisionId: string; markups: Record<ResolutionStatus, number>; orphanedMarkupIds: string[] }`
  - `saveRevision(lib, articleId, blocks): Promise<RevisionResult | null>`
    - Returns `null` and writes nothing when the normalized blocks are unchanged.
    - Throws `EmptyArticleError` when no text is left.
  - `anchorResStatement(anchorId, revisionId, start, end, status = 'exact', score = 1)`
  - `reattachMarkup(lib, markupId, { revisionId, anchor })`
    - Creates a new anchor on the given revision and points the markup at it.
    - Tombstones the old anchor and re-indexes the markup with its new words.
    - Throws `EmptySelectionError` for a whitespace-only selection.

- [ ] **Step 1: Write the failing tests**

`packages/db/src/revisions.test.ts`:
```ts
import { captureAnchor, type Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, EmptyArticleError, getArticle } from './articles';
import { Library } from './library';
import { createMarkup, createSideNote, listMarkups, listSideNotes, reattachMarkup } from './markups';
import { createQuote, targetRange } from './memos';
import { saveRevision } from './revisions';
import { search } from './search';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));

// Canonical text: '春风又绿江南岸。\n\n他用比喻写春天。明月何时照我还。'
//   江南 [4, 6)   他用比喻写春天。 [10, 18)   比喻 [12, 14)   明月 [18, 20)
const ORIGINAL = paras('春风又绿江南岸。', '他用比喻写春天。明月何时照我还。');
const NOTE_ADDED = paras('春风又绿江南岸。', '【注】他用比喻写春天。明月何时照我还。');

async function open() {
  let t = 1000;
  return Library.open(createNodeDriver(), { now: () => t++ });
}

async function setup(lib: Library, blocks = ORIGINAL) {
  const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks });
  const text = (await getArticle(lib, articleId))!.text;
  const mark = async (start: number, end: number) =>
    (await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, start, end), style: 'highlight' })).markupId;
  return { articleId, revisionId, text, mark };
}

/** Each markup's quoted words → where it is now, and how it was found. */
const placed = async (lib: Library, articleId: string) =>
  Object.fromEntries((await listMarkups(lib, articleId)).map((m) => [m.exact, { start: m.start, end: m.end, status: m.status }]));

describe('saveRevision', () => {
  it('stores the edit as the current text and moves every markup with it', async () => {
    const lib = await open();
    const { articleId, mark } = await setup(lib);
    await mark(4, 6);
    await mark(12, 14);
    await mark(18, 20);
    const result = await saveRevision(lib, articleId, NOTE_ADDED);
    expect(result?.markups).toEqual({ exact: 0, mapped: 3, fuzzy: 0, orphan: 0 });
    expect(await placed(lib, articleId)).toEqual({
      江南: { start: 4, end: 6, status: 'mapped' },
      比喻: { start: 15, end: 17, status: 'mapped' },
      明月: { start: 21, end: 23, status: 'mapped' },
    });
    expect((await getArticle(lib, articleId))!.text).toBe('春风又绿江南岸。\n\n【注】他用比喻写春天。明月何时照我还。');
  });

  it('orphans a markup whose words were deleted, rather than moving it to another copy of them (Review Focus 1)', async () => {
    const lib = await open();
    const { articleId, mark } = await setup(lib, paras('他用比喻写春天。', '比喻很妙。'));
    const markupId = await mark(2, 4);
    const result = await saveRevision(lib, articleId, paras('比喻很妙。'));
    expect(result).toMatchObject({ markups: { exact: 0, mapped: 0, fuzzy: 0, orphan: 1 }, orphanedMarkupIds: [markupId] });
    expect((await listMarkups(lib, articleId))[0].status).toBe('orphan');
  });

  it('finds a slightly changed passage again by its surroundings (fuzzy)', async () => {
    const lib = await open();
    const { articleId, mark } = await setup(lib);
    await mark(10, 18);
    const result = await saveRevision(lib, articleId, paras('春风又绿江南岸。', '他用比喻描写春天。明月何时照我还。'));
    expect(result?.markups.fuzzy).toBe(1);
    const [m] = await listMarkups(lib, articleId);
    expect((await getArticle(lib, articleId))!.text.slice(m.start, m.end)).toContain('比喻描写春天');
  });

  it('follows markups when paragraphs are joined or split (Review Focus 5)', async () => {
    const lib = await open();
    const { articleId, mark } = await setup(lib);
    await mark(12, 14);
    await mark(18, 20);
    await saveRevision(lib, articleId, paras('春风又绿江南岸。他用比喻写春天。明月何时照我还。'));
    expect(await placed(lib, articleId)).toMatchObject({ 比喻: { start: 10, end: 12 }, 明月: { start: 16, end: 18 } });
    await saveRevision(lib, articleId, paras('春风又绿江南岸。他用比喻写春天。', '明月何时照我还。'));
    expect(await placed(lib, articleId)).toMatchObject({ 比喻: { start: 10, end: 12 }, 明月: { start: 18, end: 20 } });
  });

  it('re-attaches from the revision each markup was made on, so two edits end where one would (spec §5.3)', async () => {
    const final = paras('春风又绿江南岸。', '【注】他用比喻描写春天。明月何时照我还。');
    const a = await open();
    const one = await setup(a);
    await one.mark(12, 14);
    await saveRevision(a, one.articleId, NOTE_ADDED);
    await saveRevision(a, one.articleId, final);
    const b = await open();
    const two = await setup(b);
    await two.mark(12, 14);
    await saveRevision(b, two.articleId, final);
    expect(await placed(a, one.articleId)).toEqual(await placed(b, two.articleId));
  });

  it('makes the edited text searchable and forgets the old words (Review Focus 2)', async () => {
    const lib = await open();
    const { articleId } = await setup(lib);
    await saveRevision(lib, articleId, paras('春风又绿塞北岸。', '他用比喻写春天。明月何时照我还。'));
    expect((await search(lib.driver, { text: '塞北', types: ['article'] })).map((h) => h.entityId)).toEqual([articleId]);
    expect(await search(lib.driver, { text: '江南', types: ['article'] })).toEqual([]);
  });

  it('moves quotes too, so memo links follow the text (Review Focus 2)', async () => {
    const lib = await open();
    const { articleId, revisionId, text } = await setup(lib);
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 18, 20) });
    await saveRevision(lib, articleId, NOTE_ADDED);
    expect(await targetRange(lib, 'anchor', quoteId)).toMatchObject({ start: 21, end: 23, status: 'mapped' });
  });

  it('writes nothing when the text and formatting are unchanged (Review Focus 4)', async () => {
    const lib = await open();
    const { articleId, revisionId } = await setup(lib);
    expect(await saveRevision(lib, articleId, paras('春风又绿江南岸。  ', '他用比喻写春天。明月何时照我还。'))).toBeNull();
    expect((await getArticle(lib, articleId))!.revisionId).toBe(revisionId);
  });

  it('refuses to save an article with no text left (Review Focus 4)', async () => {
    const lib = await open();
    const { articleId } = await setup(lib);
    await expect(saveRevision(lib, articleId, paras('  ', '\u{3000}'))).rejects.toBeInstanceOf(EmptyArticleError);
  });
});

describe('reattachMarkup', () => {
  it('points a markup at new words; its notes follow, the old anchor retires, search uses the new words', async () => {
    const lib = await open();
    const { articleId, mark } = await setup(lib, paras('他用比喻写春天。', '明月何时照我还。'));
    const markupId = await mark(2, 4);
    await createSideNote(lib, { markupId, articleId, body: '修辞' });
    const [{ anchorId: oldAnchorId }] = await listMarkups(lib, articleId);
    await saveRevision(lib, articleId, paras('明月何时照我还。'));
    const current = (await getArticle(lib, articleId))!;
    await reattachMarkup(lib, markupId, { revisionId: current.revisionId, anchor: captureAnchor(current.text, 0, 2) });
    expect(await listMarkups(lib, articleId)).toMatchObject([{ id: markupId, exact: '明月', start: 0, end: 2, status: 'exact' }]);
    expect((await listSideNotes(lib, articleId)).map((n) => n.markupId)).toEqual([markupId]);
    expect(await lib.driver.query('SELECT deleted FROM anchor WHERE id = ?', [oldAnchorId])).toEqual([{ deleted: 1 }]);
    expect((await search(lib.driver, { text: '明月', types: ['markup'] })).map((h) => h.entityId)).toEqual([markupId]);
    expect(await search(lib.driver, { text: '比喻', types: ['markup'] })).toEqual([]);
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/revisions.test.ts`
Expected: FAIL with `Cannot find module './revisions'`.

- [ ] **Step 2: Implement**

In `packages/db/src/markups.ts`, replace the `anchorResStatement` function (and its doc comment) with:
```ts
/** Local-only resolved position (spec §5.3). A new anchor sits exactly where it was captured. */
export function anchorResStatement(
  anchorId: string,
  revisionId: string,
  start: number,
  end: number,
  status: ResolutionStatus = 'exact',
  score = 1,
): Stmt {
  return {
    sql: `INSERT INTO anchor_res (anchor_id, revision_id, start, "end", status, score) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (anchor_id) DO UPDATE SET revision_id = excluded.revision_id, start = excluded.start,
            "end" = excluded."end", status = excluded.status, score = excluded.score`,
    params: [anchorId, revisionId, start, end, status, score],
  };
}
```

Append to `packages/db/src/markups.ts`:
```ts
/**
 * Points a markup at a new selection (the orphaned-markups panel, spec §6.2). Anchors never change, so
 * this creates a new anchor on the given revision, moves the markup to it and retires the old one.
 * Side notes and memo links refer to the markup, so they follow.
 */
export async function reattachMarkup(
  lib: Library,
  markupId: string,
  input: { revisionId: string; anchor: TextAnchor },
): Promise<void> {
  const a = input.anchor;
  if (a.exact.trim() === '') throw new EmptySelectionError();
  const [row] = await lib.driver.query<{ anchorId: string; articleId: string }>(
    'SELECT anchor_id AS anchorId, article_id AS articleId FROM markup WHERE id = ? AND deleted = 0',
    [markupId],
  );
  if (!row) return;
  const anchorId = newId();
  await lib.commit(
    [
      anchorInput(anchorId, row.articleId, input.revisionId, a, lib.now()),
      { table: 'markup', id: markupId, fields: { anchor_id: anchorId } },
      { table: 'anchor', id: row.anchorId, fields: { deleted: 1 } },
    ],
    [
      anchorResStatement(anchorId, input.revisionId, a.start, a.end),
      ...indexStatements({ entityType: 'markup', entityId: markupId, articleId: row.articleId, title: '', body: a.exact }),
    ],
  );
}
```

`packages/db/src/revisions.ts`:
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
 * A fix-up edit (spec §6.6): the edited blocks become a new revision that the article points at, and
 * every live anchor of the article is re-attached to it (§6.2). Each anchor is re-attached from the
 * revision it was captured on, so the result doesn't depend on the edits in between (§5.3). Returns
 * null, writing nothing, when the text and formatting are unchanged.
 */
export async function saveRevision(lib: Library, articleId: string, blocks: Block[]): Promise<RevisionResult | null> {
  const current = await getArticle(lib, articleId);
  if (!current) throw new Error(`Article ${articleId} does not exist`);
  const normalized = normalizeBlocks(blocks);
  if (normalized.length === 0) throw new EmptyArticleError();
  if (JSON.stringify(normalized) === JSON.stringify(current.blocks)) return null;
  const text = canonicalText(normalized);
  const revisionId = newId();

  const anchors = await lib.driver.query<AnchorRow>(
    'SELECT id, revision_id AS revisionId, start, "end", exact, prefix, suffix FROM anchor WHERE article_id = ? AND deleted = 0',
    [articleId],
  );
  const oldTexts = new Map([[current.revisionId, current.text]]);
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

  const markups = await lib.driver.query<{ id: string; anchorId: string }>(
    'SELECT id, anchor_id AS anchorId FROM markup WHERE article_id = ? AND deleted = 0',
    [articleId],
  );
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
      ...[...resolved].map(([anchorId, r]): Stmt => anchorResStatement(anchorId, revisionId, r.start, r.end, r.status, r.score)),
      ...indexStatements({ entityType: 'article', entityId: articleId, articleId, title: current.title, body: text }),
    ],
  );
  return { revisionId, markups: counts, orphanedMarkupIds };
}
```

Append to `packages/db/src/index.ts`:
```ts
export * from './revisions';
```

- [ ] **Step 3: Run the tests, then the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db/src/revisions.test.ts && pnpm test && pnpm typecheck && pnpm lint'`
Expected: the 10 new tests pass, every other test passes, and there are no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "feat(db): save fix-ups as new revisions and re-attach every anchor to them"
```

---

### Task 2: Fix-up edit mode in the article column

**Files:**
- Create:
  - `apps/client/src/article/docToBlocks.test.ts`
  - `apps/client/src/components/ArticleEditor.tsx`
  - `apps/client/e2e/edit.spec.ts`
- Modify:
  - `apps/client/src/article/schema.ts` (`docToBlocks`)
  - `apps/client/src/components/ArticlePane.tsx`
  - `apps/client/src/i18n/en.ts` and `zh-CN.ts` (an `edit` block)
  - `apps/client/src/styles/app.css`
  - `apps/client/package.json` (dependencies)
- Test: `apps/client/src/article/docToBlocks.test.ts`, `apps/client/e2e/edit.spec.ts`

**Interfaces:**
- Consumes: `saveRevision`, `RevisionResult` and `EmptyArticleError` (Task 1); `articleSchema` and `blocksToDoc` (plan 2).
- Produces:
  - `docToBlocks(doc): Block[]`, the inverse of `blocksToDoc`.
  - `interface ArticleEditorHandle { blocks(): Block[] }` and `<ArticleEditor blocks onReady />`:
    - test ID `article-editor`;
    - undo and redo;
    - `Mod-b` and `Mod-i` for bold and italic.
  - Fix-up mode in `ArticlePane`, with test IDs `edit-start`, `edit-bar`, `edit-save`, `edit-cancel` and `edit-notice`. While editing:
    - markups, the margin, the toolbar and the popover are hidden;
    - Save reports how the markups were found, or "no changes";
    - an empty text is refused and the editor stays open.
  - The markup and backlink queries also refresh on `'article'` commits.

- [ ] **Step 1: Add the dependencies**

Run: `docker compose run --rm -T dev pnpm --filter @jot/client add prosemirror-commands prosemirror-keymap prosemirror-history`

Then restart `web` and recreate Playwright, as described in Global Constraints (Commands).

- [ ] **Step 2: Write the failing tests**

`apps/client/src/article/docToBlocks.test.ts`:
```ts
import type { Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { articleSchema, blocksToDoc, docToBlocks } from './schema';

describe('docToBlocks', () => {
  it('turns an edited document back into the blocks it was made from', () => {
    const blocks: Block[] = [
      { k: 'h2', runs: [{ t: '其一' }] },
      { k: 'p', runs: [{ t: '春风' }, { t: '又绿', b: true }, { t: '江南岸', i: true }, { t: '。' }] },
      { k: 'quote', runs: [{ t: '明月何时照我还' }] },
      { k: 'li', runs: [{ t: '一条' }] },
    ];
    expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks);
  });

  it('keeps an emptied paragraph as an empty block (normalizing drops it later)', () => {
    const doc = articleSchema.nodes.doc.create(null, [articleSchema.nodes.paragraph.create()]);
    expect(docToBlocks(doc)).toEqual([{ k: 'p', runs: [] }]);
  });
});
```

`apps/client/e2e/edit.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

async function setup(page: Page) {
  await openApp(page);
  await importText(page, '修订', '春风又绿江南岸。他用比喻写春天。明月何时照我还。');
}

async function startEditingAtTop(page: Page) {
  await page.getByTestId('edit-start').click();
  await page.getByTestId('article-editor').click();
  await page.keyboard.press('Control+Home');
}

test('fixes the text; markups and side notes stay on their words (spec §10 step 5)', async ({ page }) => {
  await setup(page);
  await selectText(page, '明月');
  await page.getByTestId('toolbar-highlight').click();
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('修辞');
  await startEditingAtTop(page);
  await expect(page.locator('.mk-highlight')).toHaveCount(0);
  await page.keyboard.insertText('【注】');
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('article-view')).toContainText('【注】春风又绿江南岸。');
  await expect(page.locator('.mk-highlight')).toHaveText(['比喻', '明月']);
  await expect(page.getByTestId('edit-notice')).toContainText('found in place: 2');
  await expect(page.getByTestId('side-note')).toBeVisible();
});

test('discarding the changes leaves the text as it was', async ({ page }) => {
  await setup(page);
  await startEditingAtTop(page);
  await page.keyboard.insertText('多余的字');
  await page.getByTestId('edit-cancel').click();
  await expect(page.getByTestId('article-view')).not.toContainText('多余的字');
  await expect(page.getByTestId('edit-start')).toBeVisible();
});

test('saving without changes says so (Review Focus 4)', async ({ page }) => {
  await setup(page);
  await page.getByTestId('edit-start').click();
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('edit-notice')).toContainText('No changes to save.');
});

test('refuses to save an empty article and keeps editing (Review Focus 4)', async ({ page }) => {
  await setup(page);
  await page.getByTestId('edit-start').click();
  await page.getByTestId('article-editor').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('error-banner')).toContainText('The article can’t be empty.');
  await expect(page.getByTestId('article-editor')).toBeVisible();
});

test('memo links and cited marks follow the edited text (Review Focus 2)', async ({ page }) => {
  await setup(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-quote').click();
  const chip = page.getByTestId('memo-editor').locator('.anchor-chip');
  await expect(chip).toHaveText(['比喻']);
  await expect(page.locator('.cited')).toHaveText('比喻');
  await startEditingAtTop(page);
  await page.keyboard.insertText('【注】');
  await page.getByTestId('edit-save').click();
  await expect(page.locator('.cited')).toHaveText('比喻');
  await chip.click();
  await expect(page.locator('.flash')).toHaveText('比喻');
});

test('types Chinese with an input method while fixing the text (risk check M0.3, Review Focus 3)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'input-method composition is driven through the Chrome DevTools Protocol');
  await setup(page);
  await startEditingAtTop(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'xin', selectionStart: 3, selectionEnd: 3 });
  await cdp.send('Input.insertText', { text: '新' });
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('article-view')).toContainText('新春风又绿江南岸。');
  await expect(page.getByTestId('article-view')).not.toContainText('xin');
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/article/docToBlocks.test.ts`
Expected: FAIL with `docToBlocks is not a function` (or "does not provide an export named 'docToBlocks'").

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e edit --project chromium --timeout 15000`
Expected: FAIL: there is no `edit-start`.

- [ ] **Step 3: Implement `docToBlocks` and the editor**

In `apps/client/src/article/schema.ts`:
- change the first import to `import type { Block, BlockKind, Run } from '@jot/core';`
- append:
```ts
/** The inverse of `blocksToDoc`: the edited document as blocks (run through `normalizeBlocks` before saving). */
export function docToBlocks(doc: PMNode): Block[] {
  const { nodes, marks } = articleSchema;
  const blocks: Block[] = [];
  doc.forEach((node) => {
    const k: BlockKind =
      node.type === nodes.heading
        ? (`h${Math.min(3, Math.max(1, Number(node.attrs.level)))}` as BlockKind)
        : node.type === nodes.quote
          ? 'quote'
          : node.type === nodes.list_item
            ? 'li'
            : 'p';
    const runs: Run[] = [];
    node.forEach((child) => {
      if (!child.isText || !child.text) return;
      const bold = child.marks.some((m) => m.type === marks.strong);
      const italic = child.marks.some((m) => m.type === marks.em);
      runs.push({ t: child.text, ...(bold ? { b: true } : {}), ...(italic ? { i: true } : {}) });
    });
    blocks.push({ k, runs });
  });
  return blocks;
}
```

`apps/client/src/components/ArticleEditor.tsx`:
```tsx
import type { Block } from '@jot/core';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { articleSchema, blocksToDoc, docToBlocks } from '../article/schema';

export interface ArticleEditorHandle {
  /** The edited text as blocks. */
  blocks(): Block[];
}

interface Props {
  blocks: Block[];
  onReady(handle: ArticleEditorHandle | null): void;
}

/**
 * The article text, editable for fix-ups (spec §6.6): the same flat schema as the reading view, with
 * undo/redo and the bold and italic keys. Changes stay here until the pane saves them.
 */
export function ArticleEditor({ blocks, onReady }: Props) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const initial = useRef(blocks);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  // Read once: rebuilding the view (for example on a language switch) would lose the edits.
  const label = useRef(t('edit.label'));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView(host, {
      state: EditorState.create({
        doc: blocksToDoc(initial.current),
        plugins: [
          history(),
          keymap({
            'Mod-z': undo,
            'Shift-Mod-z': redo,
            'Mod-y': redo,
            'Mod-b': toggleMark(articleSchema.marks.strong),
            'Mod-i': toggleMark(articleSchema.marks.em),
          }),
          keymap(baseKeymap),
        ],
      }),
      attributes: { 'aria-label': label.current, spellcheck: 'false' },
    });
    view.focus();
    readyRef.current({ blocks: () => docToBlocks(view.state.doc) });
    return () => {
      readyRef.current(null);
      view.destroy();
    };
  }, []);

  return <div ref={hostRef} className="article-view article-editor" data-testid="article-editor" />;
}
```

- [ ] **Step 4: Add fix-up mode to the article pane**

In `apps/client/src/components/ArticlePane.tsx`:
1. In the `@jot/db` import, add `EmptyArticleError,` after `deleteMarkup,`, and add `saveRevision, type RevisionResult,` before `type MarkupView,`.
2. After the `./ArticleView` import, add `import { ArticleEditor, type ArticleEditorHandle } from './ArticleEditor';`.
3. Change the markups query's tables to `['article', 'markup', 'anchor']`.
4. In the backlinks query's tables, add `'article',` before `'memo',`.
5. After `const [flash, setFlash] = useState<FlashTarget | null>(null);`, add:
```tsx
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<ArticleEditorHandle | null>(null);
  const [saving, setSaving] = useState(false);
  const [editNotice, setEditNotice] = useState<RevisionResult | 'unchanged' | null>(null);
```
6. After the `onAnnotationClick` function, add:
```tsx
  const startEditing = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setPopover(null);
    setEditNotice(null);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      const result = await saveRevision(lib, articleId, editor.blocks());
      setEditing(false);
      setEditNotice(result ?? 'unchanged');
    } catch (error) {
      reportError(error instanceof EmptyArticleError ? new Error(t('edit.empty')) : error);
    } finally {
      setSaving(false);
    }
  };
```
7. Replace the whole `<ArticleView … />` element with:
```tsx
        {editing ? (
          <div className="edit-bar" role="region" aria-label={t('edit.heading')} data-testid="edit-bar">
            <span className="muted">{t('edit.hint')}</span>
            <button type="button" onClick={() => void saveEdit()} disabled={saving} data-testid="edit-save">
              {t('edit.save')}
            </button>
            <button type="button" className="quiet" onClick={() => setEditing(false)} disabled={saving} data-testid="edit-cancel">
              {t('edit.cancel')}
            </button>
          </div>
        ) : (
          <div className="article-tools">
            <button type="button" className="quiet" onClick={startEditing} data-testid="edit-start">
              {t('edit.start')}
            </button>
          </div>
        )}
        {editNotice && !editing && <EditNotice result={editNotice} onDismiss={() => setEditNotice(null)} />}
        {editing ? (
          <ArticleEditor blocks={a.blocks} onReady={setEditor} />
        ) : (
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
        )}
```
8. Wrap the `<Margin … />` element as `{!editing && ( <Margin … /> )}`. Change `{toolbarAt && <SelectionToolbar` to `{!editing && toolbarAt && <SelectionToolbar`, and `{popoverAt && (popoverMarkups.length` to `{!editing && popoverAt && (popoverMarkups.length`.
9. Append to the file:
```tsx
/** What a fix-up save did: how the markups were found in the new text, or that nothing changed. */
function EditNotice({ result, onDismiss }: { result: RevisionResult | 'unchanged'; onDismiss(): void }) {
  const { t } = useTranslation();
  let text = t('edit.unchanged');
  if (result !== 'unchanged') {
    const { exact, mapped, fuzzy, orphan } = result.markups;
    text = exact + mapped + fuzzy + orphan === 0 ? t('edit.saved') : t('edit.savedMarkups', { kept: exact + mapped, moved: fuzzy, lost: orphan });
  }
  return (
    <p className="edit-notice" role="status" data-testid="edit-notice">
      <span>{text}</span>
      <button type="button" className="icon" aria-label={t('app.dismiss')} onClick={onDismiss}>
        ×
      </button>
    </p>
  );
}
```

In `apps/client/src/i18n/en.ts`, add after the `search` block:
```ts
  edit: {
    start: 'Fix text',
    heading: 'Fixing the text',
    label: 'Article text',
    hint: 'Fixing the text. Markups are hidden while you edit and are found again when you save.',
    save: 'Save',
    cancel: 'Discard changes',
    unchanged: 'No changes to save.',
    saved: 'Saved.',
    savedMarkups: 'Saved. Markups found in place: {{kept}}; adjusted to small changes: {{moved}}; not found: {{lost}}.',
    empty: 'The article can’t be empty.',
  },
```

In `apps/client/src/i18n/zh-CN.ts`, add after the `search` block:
```ts
  edit: {
    start: '修订原文',
    heading: '修订原文',
    label: '原文',
    hint: '正在修订原文。修订时标注暂时隐藏，保存后会重新定位。',
    save: '保存修订',
    cancel: '放弃修改',
    unchanged: '没有需要保存的修改。',
    saved: '已保存。',
    savedMarkups: '已保存。原位保留的标注：{{kept}} 处；按上下文重新定位：{{moved}} 处；找不到：{{lost}} 处。',
    empty: '文章不能为空。',
  },
```

Append to `apps/client/src/styles/app.css`:
```css
/* Fix-up editing */
.article-tools { display: flex; justify-content: flex-end; margin: -8px 0 8px; }
.edit-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px; margin: 0 0 12px; padding: 8px 10px; font-size: 13px; background: var(--panel); border: 1px solid var(--accent); border-radius: 8px; }
.edit-bar .muted { flex: 1; }
.article-editor .ProseMirror { outline: none; padding: 4px 8px; border-radius: 6px; box-shadow: 0 0 0 1px var(--line); }
.article-editor .ProseMirror:focus { box-shadow: 0 0 0 2px var(--accent); }
.edit-notice { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; padding: 6px 10px; font-size: 13px; background: var(--panel); border-radius: 8px; }
.edit-notice span { flex: 1; }
```

- [ ] **Step 5: Run the unit tests, then the edit end-to-end tests on both browsers plus regressions**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes (2 new ones), with no type or lint errors.

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e edit annotate notes follow backlinks`
Expected:
- edit: chromium 6 passed; webkit 5 passed and 1 skipped (the composition test).
- annotate, notes, follow and backlinks: unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "feat(client): fix-up edit mode that saves a new revision and reports how markups were found"
```

---

### Task 3: The orphaned-markups panel and re-attaching by hand

**Files:**
- Create: `apps/client/src/components/OrphanPanel.tsx`, `apps/client/e2e/orphans.spec.ts`
- Modify:
  - `apps/client/src/article/markupRange.ts` (`'attach'` action)
  - `apps/client/src/components/SelectionToolbar.tsx` (`actions` prop)
  - `apps/client/src/components/ArticlePane.tsx`
  - `apps/client/src/components/Shell.tsx`
  - `apps/client/src/i18n/en.ts` and `zh-CN.ts`
  - `apps/client/src/styles/app.css`
- Test: `apps/client/e2e/orphans.spec.ts`

**Interfaces:**
- Consumes: `reattachMarkup` (Task 1); `MarkupView.status`; `targetRange(…).status`.
- Produces:
  - `<OrphanPanel orphans notes onReattach onDelete />`. Test IDs:
    - `orphans` for the panel;
    - `orphan` for each item, which shows the style, the original words and the notes' text;
    - `orphan-reattach` and `orphan-delete` for the item's buttons.
  - Re-attach mode shows a hint (`reattach-hint`, cancel `reattach-cancel`), and the selection toolbar offers only **Attach here** (`toolbar-attach`).
  - `<SelectionToolbar actions? />`, which defaults to the usual five actions.
  - Following a link to an orphan reports `memo.lostTarget`, both from the memo (in `Shell`) and when the article is already open (in `ArticlePane`). It never flashes stale offsets.

- [ ] **Step 1: Write the failing end-to-end tests**

`apps/client/e2e/orphans.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

async function importArticle(page: Page) {
  await openApp(page);
  await importText(page, '孤立', '春风又绿江南岸。他用比喻写春天。明月何时照我还。');
}

/** A fix-up that deletes the sentence containing 比喻. */
async function deleteTheMetaphorSentence(page: Page) {
  await page.getByTestId('edit-start').click();
  await page.getByTestId('article-editor').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('春风又绿江南岸。明月何时照我还。');
  await page.getByTestId('edit-save').click();
}

test('lists a markup whose words were deleted, and re-attaches it to a new selection (spec §10 step 5)', async ({ page }) => {
  await importArticle(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await page.getByTestId('side-note').locator('textarea').fill('修辞');
  await deleteTheMetaphorSentence(page);
  await expect(page.getByTestId('edit-notice')).toContainText('not found: 1');
  await expect(page.getByTestId('orphan')).toHaveCount(1);
  await expect(page.getByTestId('orphan')).toContainText('比喻');
  await expect(page.getByTestId('orphan')).toContainText('修辞');
  await expect(page.locator('.mk-highlight')).toHaveCount(0);
  await expect(page.getByTestId('side-note')).toBeHidden();

  await page.getByTestId('orphan-reattach').click();
  await expect(page.getByTestId('reattach-hint')).toContainText('比喻');
  await selectText(page, '明月');
  await expect(page.getByTestId('toolbar-highlight')).toHaveCount(0);
  await page.getByTestId('toolbar-attach').click();
  await expect(page.getByTestId('orphans')).toHaveCount(0);
  await expect(page.locator('.mk-highlight')).toHaveText(['明月']);
  await expect(page.getByTestId('side-note')).toBeVisible();
  await expect(page.getByTestId('side-note').locator('textarea')).toHaveValue('修辞');
});

test('deletes an orphaned markup', async ({ page }) => {
  await importArticle(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await deleteTheMetaphorSentence(page);
  await expect(page.getByTestId('orphan')).toHaveCount(1);
  await page.getByTestId('orphan-delete').click();
  await expect(page.getByTestId('orphans')).toHaveCount(0);
});

test('a memo link to an orphaned markup explains why it goes nowhere', async ({ page }) => {
  await importArticle(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-highlight').click();
  await page.locator('.mk-highlight').click();
  await page.getByTestId('popover-link').click();
  const chip = page.getByTestId('memo-editor').locator('.anchor-chip');
  await expect(chip).toHaveText(['比喻']);
  await deleteTheMetaphorSentence(page);
  await chip.click();
  await expect(page.getByTestId('error-banner')).toContainText('can’t be found since the article text was fixed');
  await expect(page.locator('.flash')).toHaveCount(0);
});
```

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e orphans --project chromium --timeout 15000`
Expected: FAIL: there is no `orphan` item, and the link test gets no explanation.

- [ ] **Step 2: Implement the panel, the toolbar option and the lost-target message**

In `apps/client/src/article/markupRange.ts`, replace the `ToolbarAction` type (and its comment) with:
```ts
/**
 * Toolbar actions: a style for the selection, a side note (which highlights it), a quote into the memo,
 * or — while re-attaching an orphaned markup — attaching it to the selection.
 */
export type ToolbarAction = 'underline' | 'bold' | 'highlight' | 'note' | 'quote' | 'attach';
```

Replace `apps/client/src/components/SelectionToolbar.tsx` with:
```tsx
import { useTranslation } from 'react-i18next';
import type { ToolbarAction } from '../article/markupRange';

const DEFAULT_ACTIONS: readonly ToolbarAction[] = ['underline', 'bold', 'highlight', 'note', 'quote'];

interface Props {
  top: number;
  left: number;
  actions?: readonly ToolbarAction[];
  onAction(action: ToolbarAction): void;
}

export function SelectionToolbar({ top, left, actions = DEFAULT_ACTIONS, onAction }: Props) {
  const { t } = useTranslation();
  // preventDefault on mousedown keeps the text selection while a button is pressed.
  return (
    <div className="toolbar" role="toolbar" style={{ top, left }} onMouseDown={(e) => e.preventDefault()} data-testid="selection-toolbar">
      {actions.map((action) => (
        <button key={action} type="button" onClick={() => onAction(action)} data-testid={`toolbar-${action}`}>
          {t(`toolbar.${action}`)}
        </button>
      ))}
    </div>
  );
}
```

`apps/client/src/components/OrphanPanel.tsx`:
```tsx
import type { MarkupView, SideNoteView } from '@jot/db';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { excerpt } from '../article/excerpt';

interface Props {
  orphans: MarkupView[];
  notes: SideNoteView[];
  onReattach(markup: MarkupView): void;
  onDelete(markup: MarkupView): void;
}

/** Markups whose words can't be found since the text was fixed (spec §6.2): re-attach each one to new words, or delete it. */
export function OrphanPanel({ orphans, notes, onReattach, onDelete }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  return (
    <section className="orphans" data-testid="orphans">
      <button type="button" className="orphans-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('orphans.heading', { count: orphans.length })}
      </button>
      {open && (
        <ul>
          {orphans.map((m) => (
            <li key={m.id} data-testid="orphan">
              <span className="muted">{t(`markup.styles.${m.style}`)}</span>
              <q className="excerpt">{excerpt(m.exact, 40)}</q>
              {notes
                .filter((n) => n.markupId === m.id && n.body.trim() !== '')
                .map((n) => (
                  <span key={n.id} className="orphan-note">
                    {n.body}
                  </span>
                ))}
              <div className="actions">
                <button type="button" onClick={() => onReattach(m)} data-testid="orphan-reattach">
                  {t('orphans.reattach')}
                </button>
                <button type="button" onClick={() => onDelete(m)} data-testid="orphan-delete">
                  {t('orphans.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

In `apps/client/src/components/ArticlePane.tsx`:
1. In the `@jot/db` import, add `reattachMarkup,` after `listSideNotes,`.
2. After the `./MarkupPopover` import, add `import { OrphanPanel } from './OrphanPanel';`.
3. After `const [editNotice, setEditNotice] = …;`, add:
```tsx
  const [reattaching, setReattaching] = useState<MarkupView | null>(null);
```
4. In the focus effect, replace:
```tsx
      if (!range || range.articleId !== articleId) {
        reportError(new Error(t('memo.missingTarget')));
        return;
      }
```
with:
```tsx
      if (!range || range.articleId !== articleId || range.status === 'orphan') {
        reportError(new Error(t(range?.status === 'orphan' ? 'memo.lostTarget' : 'memo.missingTarget')));
        return;
      }
```
5. Directly after the `tagIdsOf` helper, add:
```tsx
  const orphans = (markups.data ?? []).filter((m) => m.status === 'orphan');
```
6. In `onAction`, directly after `const anchor = captureAnchor(a.text, range.start, range.end);`, add:
```tsx
    if (action === 'attach') {
      const markup = reattaching;
      setReattaching(null);
      if (markup) await reattachMarkup(lib, markup.id, { revisionId: a.revisionId, anchor });
      return;
    }
```
7. In `startEditing`, add `setReattaching(null);` as its first line.
8. Directly before the `{editing ? (\n          <ArticleEditor` block, add:
```tsx
        {!editing && orphans.length > 0 && (
          <OrphanPanel
            orphans={orphans}
            notes={notes.data ?? []}
            onReattach={setReattaching}
            onDelete={(m) => {
              if (reattaching?.id === m.id) setReattaching(null);
              deleteMarkup(lib, m.id).catch(reportError);
            }}
          />
        )}
        {!editing && reattaching && (
          <div className="reattach-hint" role="status" data-testid="reattach-hint">
            <span>{t('orphans.hint', { exact: excerpt(reattaching.exact) })}</span>
            <button type="button" className="quiet" onClick={() => setReattaching(null)} data-testid="reattach-cancel">
              {t('orphans.cancel')}
            </button>
          </div>
        )}
```
9. In the `<SelectionToolbar … />` element, add the prop `actions={reattaching ? ['attach'] : undefined}`.

In `apps/client/src/components/Shell.tsx`, in `follow`, replace:
```tsx
        if (!range) {
          reportError(new Error(t('memo.missingTarget')));
          return;
        }
```
with:
```tsx
        if (!range || range.status === 'orphan') {
          reportError(new Error(t(range ? 'memo.lostTarget' : 'memo.missingTarget')));
          return;
        }
```

In `apps/client/src/i18n/en.ts`:
- add `attach: 'Attach here',` to `toolbar`, after `quote`
- add `lostTarget: 'The linked passage can’t be found since the article text was fixed.',` to `memo`, after `missingTarget`
- add after the `edit` block:
```ts
  orphans: {
    heading: 'Markups whose words can’t be found in the fixed text: {{count}}',
    reattach: 'Re-attach…',
    delete: 'Delete',
    hint: 'Select the new words for “{{exact}}”, then choose Attach here.',
    cancel: 'Cancel',
  },
```

In `apps/client/src/i18n/zh-CN.ts`:
- add `attach: '附到此处',` to `toolbar`, after `quote`
- add `lostTarget: '原文修订后，找不到链接的段落。',` to `memo`, after `missingTarget`
- add after the `edit` block:
```ts
  orphans: {
    heading: '修订后找不到原文的标注：{{count}} 处',
    reattach: '重新定位…',
    delete: '删除',
    hint: '请选出“{{exact}}”对应的新文字，然后点“附到此处”。',
    cancel: '取消',
  },
```

Append to `apps/client/src/styles/app.css`:
```css
/* Orphaned markups */
.orphans { margin: 0 0 12px; padding: 8px 10px; border: 1px solid var(--danger); border-radius: 8px; background: var(--panel); font-size: 13px; }
.orphans-toggle { border: none; background: none; padding: 0; color: var(--danger); font-weight: 600; text-align: left; }
.orphans ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.orphans li { display: flex; flex-direction: column; gap: 4px; padding-top: 6px; border-top: 1px solid var(--line); }
.orphans .excerpt { font-family: var(--font-read); }
.orphan-note { color: var(--muted); }
.orphans .actions { display: flex; gap: 6px; }
.reattach-hint { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px; margin: 0 0 12px; padding: 8px 10px; font-size: 13px; background: var(--panel); border: 1px solid var(--accent); border-radius: 8px; }
.reattach-hint span { flex: 1; }
```

- [ ] **Step 3: Run the orphan end-to-end tests on both browsers, plus regressions and the unit suite**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e orphans edit follow annotate popover`
Expected: orphans passes 3 on each browser, and the other specs are unchanged.

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add apps/client
git commit -m "feat(client): list orphaned markups after a fix-up and re-attach them to new words"
```

---

### Task 4: Spec, README, desktop check and the full verification

**Files:**
- Modify: `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` (§2, §6.1, §6.2, §6.6, §10), `README.md`
- Test: the complete verification below, plus a desktop screenshot

**Interfaces:**
- Consumes: everything above.
- Produces: an up-to-date spec and README, and a verified desktop build.

- [ ] **Step 1: Record what was built in the spec**

In `docs/superpowers/specs/2026-09-27-jot-core-app-design.md`:

1. Record that `.docx` import is deferred:
   - In the §2 table, change the Import (v1) row's value to: `Paste, \`.txt\` and \`.md\`. \`.docx\` is deferred (decided with the product owner when plan 5 was reviewed). No URL clipping, PDF or EPUB.`
   - In §6.1, replace the sub-bullet that starts "`.docx` is converted by **mammoth**" with:
```markdown
  - `.docx` import is deferred (decided when plan 5 was reviewed). When it comes, it will go through mammoth (BSD-2) into this same normalizer.
```
   - In §10, change step 1 to: `1. Import a Chinese article by pasting it, and an English one from \`.md\`.`
2. In §6.2, directly before the "**Edge cases**" line, add:
```markdown
**As built (plan 5).**
- Each anchor is re-attached from the revision it was captured on to the new current revision. A series of fix-ups therefore ends where a single edit would, on every device. Only the local `anchor_res` changes.
- Re-attaching an orphaned markup by hand (select new words, then **Attach here**) creates a new anchor on the current revision, points the markup at it, and tombstones the old anchor. Side notes and memo links follow the markup.
- A memo link or search result that leads to an orphan explains that the passage can't be found since the text was fixed.

```
3. In §6.6, replace the "**Fix-up edit mode:**" bullet and its three sub-bullets with:
```markdown
- **Fix-up edit mode:**
  - **Fix text** makes the text editable in place, using the same flat schema, with undo, and bold and italic keys. Markups, side notes and the selection toolbar are hidden while editing.
  - Saving stores a new immutable `article_revision`, sets `current_revision_id`, and runs reattachment (§6.2). A notice then says how many markups were found in place, adjusted to small changes, or not found. Markups that weren't found are listed in the orphaned-markups panel above the text.
  - Saving an unchanged text writes nothing and says so. A text left empty is refused, and the editor stays open.
  - Leaving without saving (**Discard changes**, or opening another article) discards the changes.
```

- [ ] **Step 2: Update the README**

In `README.md`, replace the first paragraph under `# Jot` with:
```markdown
A library for writers who study model articles. Import an article (paste, `.txt`, `.md`), read it
in a calm two-column layout, and fix import typos in place. Markups, notes and links find their words again.
Underline, bold or highlight passages of any length, and keep side notes beside them. Write analysis memos
that quote passages and jump back to them. Tag everything with tiered tags, and find it again by keyword,
tag and type. The interface is in 简体中文 and English. Desktop (Windows, macOS) and web.
```

- [ ] **Step 3: Check the desktop app through WSLg**

1. Run `docker compose up -d desktop`.
2. Wait until the window is up by retrying the screenshot until it succeeds:
   `until docker compose exec -T -u node desktop node apps/desktop/scripts/screenshot.mjs Jot .screenshots/desktop-fixup.png; do sleep 5; done`
   - Expected: the window shows the library and article columns.
   - Open the PNG to check it.
3. Before this task is complete, ask the user to try the desktop build by hand:
   - fix a typo with **Fix text**;
   - type Chinese with the input method while editing (risk check M0.3 on WebKitGTK and, for the user, on macOS);
   - re-attach an orphaned markup.
4. Then run `docker compose stop desktop`.

- [ ] **Step 4: Run the complete verification on freshly started services**

Run:
```bash
docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test'
docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'
docker compose restart web && docker compose --profile e2e up -d --force-recreate playwright
until docker compose exec -T web node -e "require('net').connect(3000,'localhost').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; do sleep 2; done
docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e
```
Expected: every command exits 0. The e2e run has no failures. Its only skips are the known WebKit ones (no OPFS, synthetic paste) and the Chromium-only composition tests.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-27-jot-core-app-design.md README.md
git commit -m "docs: fix-up editing and orphaned markups in the spec and README; defer .docx"
```

---

## Done when

- In the browser and in the desktop window, a writer can:
  - correct an article's text with **Fix text**. Markups, side notes, memo chips, cited marks and search follow the correction.
  - see which markups couldn't be found, and re-attach each one to new words or delete it.
- Spec §10 step 5 passes as an end-to-end test: markups next to the edit reattach, and a markup whose text was deleted appears in the orphaned-markups panel.
- `pnpm typecheck && pnpm lint && pnpm test` and `cargo test` pass, and the e2e suite passes on Chromium and WebKit.
