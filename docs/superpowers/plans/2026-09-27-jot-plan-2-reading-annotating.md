# Jot Plan 2: Reading & Annotating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the plan-1 foundation into a usable reader on web and desktop. A writer can:
- import a model article (paste, `.txt`, `.md`),
- see it in the library,
- read it in a two-column layout,
- mark up terms, lines and paragraphs,
- attach side notes that line up in the margin,
- remove markups.

Everything is saved, and the UI is in Chinese and English.

**Architecture:**
- `@jot/db` gains article, markup and side-note repositories, all writing through `Library.commit` (which now notifies subscribers).
- `apps/client` gains:
  - a boot sequence and a small data layer (`LibraryProvider`, and `useLibraryQuery`, which re-runs after every commit),
  - a hash router,
  - i18next,
  - an import pipeline (HTML, Markdown or plain text → blocks),
  - a read-only **ProseMirror** article view whose document positions are canonical-text offsets + 1,
  - markups as decorations, side notes laid out beside their anchors, and a popover for existing markups.
- On desktop, a production Content-Security-Policy closes plan 1's deferred CSP ruling.

**Tech Stack:** Plan 1's stack, plus prosemirror-model / -state / -view, i18next and react-i18next, markdown-it, and happy-dom (unit tests only). All are MIT-licensed.

**Spec:** `docs/superpowers/specs/2026-09-27-jot-core-app-design.md` (§4.1, §6.1, §6.2 capture, §6.6, §6.8, §8, §9 M3–M4). Plan 1 (`docs/superpowers/plans/2026-09-27-jot-plan-1-foundation.md`) is merged on `main`. Its code is the base for this plan.

**Series:** Plan 2 of 4.
- **Plan 3:** memos with TipTap + Yjs (including risk check M0.4), anchor links, backlinks, the tag UI and search UI.
- **Plan 4:** fix-up editing and reattachment in the UI, .docx import, export, desktop CI builds.

**Branch:** `git checkout -b plan-2-reading-annotating` from `main`.

## Global Constraints

- **Plan 1's constraints all still apply:**
  - Docker only; nothing installed on the host.
  - Node ≥ 24, pnpm 10, TypeScript ~5.9.
  - `SqlDriver` has only `query` and `batch`.
  - UTF-16 offsets, and anchors never split a surrogate pair.
  - Synced tables written only through `Library.commit`.
  - FTS queries built only by `buildFtsQuery`.
  - MIT/BSD/Apache dependencies.
  - Conventional commits with **no attribution lines**.
- **Run commands** as `docker compose run --rm -T -e NO_COLOR=1 dev <cmd>` from the repo root.
- **End-to-end tests** need the `web` and `playwright` services:
  1. `docker compose up -d web && docker compose --profile e2e up -d playwright`
  2. `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e [spec]`
- **Unicode escapes in source files are written as `\u{XXXX}`,** and regexes that contain them carry the `u` flag. The tool that writes this plan corrupts the four-digit `\uXXXX` form.
- **Every user-facing string goes through i18next,** with both `zh-CN` and `en` resources. `zh-CN` is typed `Messages`, so a missing key fails `pnpm typecheck`. The only exception is the developer diagnostics screen (`#/diagnostics`), which stays English.
- **Imported content is never rendered as HTML.** No `dangerouslySetInnerHTML` anywhere. Article text reaches the DOM only as ProseMirror text nodes.
- **The article view uses ProseMirror directly, not TipTap** (a deliberate deviation from spec §6.6):
  - The schema is flat textblocks only (paragraph, heading, quote, list_item, with strong/em marks).
  - So `pmPos = canonicalOffset + 1` holds for every offset inside a block (the `\n\n` separator counts 2 — exactly one block's close token plus the next block's open token).
  - TipTap stays the choice for the memo editor in plan 3.
- **`?storage=memory`** (dev builds only, `import.meta.env.DEV`) opens an in-memory sqlite-wasm library.
  - The WebKit end-to-end project uses it, because Playwright's WebKit has no OPFS (plan-1 ruling).
  - Tests that check persistence across a reload run on Chromium only.
- **Markup kinds:** `term` highlights the selection, trimmed of whitespace. `line` extends to whole sentences (`sentenceSpan`). `paragraph` snaps to whole blocks (`unit: 'block'`). `note` creates a `term` markup plus an empty side note and focuses it.

## Review Focus

These five inputs aren't covered by the spec's happy paths and are most likely to bite real users. Each one has a test in the task that owns the code.

1. **Hostile pasted HTML or Markdown** (`<script>`, `onerror=` handlers, `<iframe>`, raw HTML inside Markdown). Only text and bold/italic survive, and nothing executes. Tested in Task 5 (unit) and Task 9 (end-to-end, `window.__pwned` stays unset).
2. **Selections that are collapsed, whitespace-only, or reach outside the article** (for example, starting in the sidebar). No toolbar appears and no markup is created. Tested in Task 11 (`markupRange` unit test, plus an end-to-end test with a selection outside the article).
3. **Overlapping markups, and markups on characters outside the BMP** (😀). All of them render, and clicking an overlap offers each markup. Tested in Task 10 (decorations unit test), Task 11 (end-to-end, emoji) and Task 13 (end-to-end, clicking an overlap).
4. **A very long article** (~190,000 characters, 8,000 paragraphs). It imports and opens in under 5 s in Chromium. Tested in Task 9 (end-to-end).
5. **An empty import, an unsupported file type, or a second tab.** The user sees a clear message and nothing is created. Tested in Task 5 (unsupported extension), Task 9 (empty submit) and Task 7 (lock message at app level).

---

## File Map

```
packages/core/src/anchoring/capture.ts   + trimRange, sentenceSpan               Task 2
packages/core/src/article/lang.ts        detectLang                              Task 2
packages/db/src/library.ts               + subscribe                             Task 1
packages/db/src/articles.ts              createArticle/listArticles/getArticle/deleteArticle   Task 3
packages/db/src/markups.ts               markups + side notes                    Task 4
apps/client/src/import/                  htmlToBlocks, markdown, draft           Task 5
apps/client/src/i18n/                    en, zh-CN, index                        Task 6
apps/client/src/platform/index.ts        + ?storage=memory                       Task 7
apps/client/src/data/                    openLibrary, LibraryContext             Task 7
apps/client/src/router.ts                parseHash/routeHash/navigate/useRoute   Task 7
apps/client/src/App.tsx, main.tsx        boot + routes                           Task 7
apps/client/src/diagnostics/Diagnostics.tsx   takes driver/platform props        Task 7
apps/client/src/components/Shell.tsx, Sidebar.tsx, Splitter.tsx, MemoPane.tsx   Task 8
apps/client/src/components/ArticlePane.tsx    (plain text in T8; full in T11–13)
apps/client/src/styles/app.css                                                   Task 8
apps/client/src/components/ImportDialog.tsx                                      Task 9
apps/client/src/article/schema.ts, decorations.ts                                Task 10
apps/client/src/article/markupRange.ts                                           Task 11
apps/client/src/components/ArticleView.tsx, SelectionToolbar.tsx                Task 11
apps/client/src/article/margin.ts, components/Margin.tsx                         Task 12
apps/client/src/components/MarkupPopover.tsx                                     Task 13
apps/client/e2e/helpers.ts, shell/import/annotate/notes/popover .spec.ts         Tasks 7–13
apps/desktop/src-tauri/tauri.conf.json (CSP), apps/desktop/scripts/screenshot.mjs Task 14
.github/workflows/ci.yml, README.md                                              Task 15
```

---

### Task 1: `Library.subscribe` change notifications

**Files:**
- Modify: `packages/db/src/library.ts`
- Test: `packages/db/src/library.test.ts` (append a `describe`)

**Interfaces:**
- Produces:
  - `type ChangeListener = (ops: Op[]) => void`
  - `Library.subscribe(listener: ChangeListener): () => void`
  - Listeners are called after a commit's batch succeeds, and never when it fails. A listener that throws is logged with `console.error` and does not fail the commit.

- [ ] **Step 1: Write the failing test** (append to `packages/db/src/library.test.ts`; also add `vi` to that file's `vitest` import)

```ts
describe('Library.subscribe', () => {
  it('notifies listeners after a successful commit', async () => {
    const lib = await Library.open(createNodeDriver());
    const seen: string[] = [];
    lib.subscribe((ops) => seen.push(...ops.map((o) => `${o.table}:${o.id}`)));
    await lib.commit([{ table: 'tag', id: 't1', fields: tagFields('x') }]);
    expect(seen).toEqual(['tag:t1']);
  });

  it('does not notify when the commit fails', async () => {
    const lib = await Library.open(createNodeDriver());
    let calls = 0;
    lib.subscribe(() => calls++);
    await expect(
      lib.commit([{ table: 'tag', id: 't1', fields: tagFields('x') }], [{ sql: 'INSERT INTO nope VALUES (1)' }]),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it('stops notifying after unsubscribe', async () => {
    const lib = await Library.open(createNodeDriver());
    let calls = 0;
    const unsubscribe = lib.subscribe(() => calls++);
    unsubscribe();
    await lib.commit([{ table: 'tag', id: 't1', fields: tagFields('x') }]);
    expect(calls).toBe(0);
  });

  it('keeps committing when a listener throws', async () => {
    const lib = await Library.open(createNodeDriver());
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    lib.subscribe(() => {
      throw new Error('listener bug');
    });
    await expect(lib.commit([{ table: 'tag', id: 't1', fields: tagFields('x') }])).resolves.toHaveLength(1);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/library.test.ts`
Expected: FAIL with `lib.subscribe is not a function`.

- [ ] **Step 3: Implement** in `packages/db/src/library.ts`

Add below the `LibraryOptions` interface:
```ts
export type ChangeListener = (ops: Op[]) => void;
```

Add inside `class Library`, below `readonly lock`:
```ts
  private readonly listeners = new Set<ChangeListener>();

  /** Called after every successful commit (UI refresh); returns an unsubscribe function. */
  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
```

In `commit`, replace `    return ops;` with:
```ts
    for (const listener of this.listeners) {
      try {
        listener(ops);
      } catch (err) {
        console.error('Library change listener failed', err);
      }
    }
    return ops;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/library.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): notify subscribers after each successful commit"
```

---

### Task 2: Selection helpers and language detection in `@jot/core`

**Files:**
- Modify: `packages/core/src/anchoring/capture.ts`, `packages/core/src/index.ts`
- Create: `packages/core/src/article/lang.ts`
- Test: `packages/core/src/anchoring/capture.test.ts` (append), `packages/core/src/article/lang.test.ts`

**Interfaces:**
- Consumes: `sentenceRange` and `TextRange` (plan 1).
- Produces:
  - `trimRange(text: string, start: number, end: number): TextRange` — shrinks the range past leading and trailing whitespace, including U+3000; returns a collapsed range when nothing is left
  - `sentenceSpan(text: string, start: number, end: number, locale?: string): TextRange` — every whole sentence the range touches
  - `detectLang(text: string): 'zh' | 'en'`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/anchoring/capture.test.ts` (and add `sentenceSpan, trimRange` to its import from `./capture`):
```ts
describe('trimRange', () => {
  it('drops surrounding whitespace, including full-width spaces', () => {
    expect(trimRange('  比喻 ', 0, 5)).toEqual({ start: 2, end: 4 });
    expect(trimRange('\u{3000}\u{3000}第一段', 0, 5)).toEqual({ start: 2, end: 5 });
  });

  it('collapses an all-whitespace range', () => {
    const r = trimRange('a   b', 1, 4);
    expect(r.start).toBe(r.end);
  });
});

describe('sentenceSpan', () => {
  it('extends a selection to the whole sentences it touches', () => {
    expect(sentenceSpan('他来了。她走了。我也走了。', 5, 10)).toEqual({ start: 4, end: 13 });
    expect(sentenceSpan('One. Two three. Four.', 6, 11, 'en')).toEqual({ start: 5, end: 15 });
  });

  it('never shrinks the selection', () => {
    expect(sentenceSpan('abc', 0, 3)).toEqual({ start: 0, end: 3 });
  });
});
```

`packages/core/src/article/lang.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { detectLang } from './lang';

describe('detectLang', () => {
  it('recognizes Chinese text, even with some Latin words', () => {
    expect(detectLang('他用比喻写春天。')).toBe('zh');
    expect(detectLang('鲁迅在《故乡》里写道：AI 也读不懂这种 nostalgia。')).toBe('zh');
  });

  it('recognizes English text, even with a Chinese name', () => {
    expect(detectLang('Writers love a good metaphor, said 鲁迅.')).toBe('en');
  });

  it('defaults to English for text without letters', () => {
    expect(detectLang('')).toBe('en');
    expect(detectLang('123 !!!')).toBe('en');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/core/src/anchoring/capture.test.ts packages/core/src/article/lang.test.ts`
Expected: FAIL with `trimRange is not a function` (or `is not exported`) and `Cannot find module './lang'`.

- [ ] **Step 3: Implement**

Append to `packages/core/src/anchoring/capture.ts`:
```ts
/** Shrinks [start, end) past leading/trailing whitespace; collapsed when nothing is left. */
export function trimRange(text: string, start: number, end: number): TextRange {
  let s = start;
  let e = end;
  while (s < e && /\s/u.test(text[s])) s++;
  while (e > s && /\s/u.test(text[e - 1])) e--;
  return { start: s, end: e };
}

/** Every whole sentence the range touches ("line" markups); never smaller than the range. */
export function sentenceSpan(text: string, start: number, end: number, locale = 'zh'): TextRange {
  const first = sentenceRange(text, start, locale);
  const last = sentenceRange(text, Math.max(start, end - 1), locale);
  return { start: Math.min(first.start, start), end: Math.max(last.end, end) };
}
```

`packages/core/src/article/lang.ts`:
```ts
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const LETTER = /\p{L}/u;

/** 'zh' when CJK characters are a substantial share of the letters in the first 5000 characters. */
export function detectLang(text: string): 'zh' | 'en' {
  let cjk = 0;
  let latin = 0;
  for (const ch of text.slice(0, 5000)) {
    if (CJK.test(ch)) cjk++;
    else if (LETTER.test(ch)) latin++;
  }
  return cjk > 0 && cjk * 4 >= latin ? 'zh' : 'en';
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './article/lang';
```

- [ ] **Step 4: Run them to verify they pass**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/core/src/anchoring/capture.test.ts packages/core/src/article/lang.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add trimRange, sentenceSpan and detectLang"
```

---

### Task 3: Article repository

**Files:**
- Create: `packages/db/src/articles.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/articles.test.ts`

**Interfaces:**
- Consumes: `canonicalText`, `normalizeBlocks`, `detectLang`, `newId` and `Block` from core; `Library` and `OpInput`; `indexStatements` and `unindexStatements`.
- Produces:
  - `type ImportKind = 'paste' | 'txt' | 'md' | 'docx'`
  - `interface NewArticle { title: string; author?: string | null; source?: string | null; importKind: ImportKind; blocks: Block[] }`
  - `interface ArticleSummary { id: string; title: string; author: string | null; lang: string | null; createdAt: number }`
  - `interface ArticleDetail extends ArticleSummary { source: string | null; revisionId: string; blocks: Block[]; text: string }`
  - `class EmptyArticleError` (name `'EmptyArticleError'`)
  - `createArticle(lib, input): Promise<{ articleId: string; revisionId: string }>`, `listArticles(lib): Promise<ArticleSummary[]>` (newest first), `getArticle(lib, id): Promise<ArticleDetail | null>`
  - `deleteArticle(lib, id): Promise<void>` — tombstones the article, its markups, anchors and side notes, and removes them from search

- [ ] **Step 1: Write the failing test**

`packages/db/src/articles.test.ts`:
```ts
import type { Block } from '@jot/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, EmptyArticleError, getArticle, listArticles } from './articles';
import { Library } from './library';
import { search } from './search';

let lib: Library;
beforeEach(async () => {
  let t = 1000;
  lib = await Library.open(createNodeDriver(), { now: () => t++ });
});

const paragraphs = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));

describe('articles', () => {
  it('creates articles and lists them newest first', async () => {
    const a = await createArticle(lib, { title: '故乡', author: '鲁迅', importKind: 'paste', blocks: paragraphs('我冒了严寒。') });
    const b = await createArticle(lib, { title: 'Second', importKind: 'txt', blocks: paragraphs('Hello.') });
    const list = await listArticles(lib);
    expect(list.map((x) => x.id)).toEqual([b.articleId, a.articleId]);
    expect(list[1]).toMatchObject({ title: '故乡', author: '鲁迅', lang: 'zh' });
  });

  it('returns the current revision with normalized blocks and canonical text', async () => {
    const { articleId, revisionId } = await createArticle(lib, {
      title: 'T',
      importKind: 'paste',
      blocks: paragraphs(' 第一段。 ', '', '第二段。'),
    });
    const article = await getArticle(lib, articleId);
    expect(article).toMatchObject({ id: articleId, revisionId, text: '第一段。\n\n第二段。' });
    expect(article?.blocks).toEqual(paragraphs('第一段。', '第二段。'));
  });

  it('derives a title from the first paragraph when none is given', async () => {
    const long = '春'.repeat(50);
    const { articleId } = await createArticle(lib, { title: '   ', importKind: 'paste', blocks: paragraphs(long) });
    expect((await getArticle(lib, articleId))?.title).toBe(`${'春'.repeat(40)}…`);
  });

  it('rejects an article with no text (Review Focus 5)', async () => {
    await expect(createArticle(lib, { title: 'x', importKind: 'paste', blocks: paragraphs('  ', '') })).rejects.toBeInstanceOf(
      EmptyArticleError,
    );
    expect(await listArticles(lib)).toEqual([]);
  });

  it('makes the article searchable by title and body', async () => {
    const { articleId } = await createArticle(lib, { title: '春天', importKind: 'paste', blocks: paragraphs('他用比喻写景。') });
    expect((await search(lib.driver, { text: '比喻' })).map((h) => h.entityId)).toEqual([articleId]);
    expect((await search(lib.driver, { text: '春天' })).map((h) => h.entityId)).toEqual([articleId]);
  });

  it('deletes an article from the list, from lookups and from search', async () => {
    const { articleId } = await createArticle(lib, { title: '春天', importKind: 'paste', blocks: paragraphs('他用比喻写景。') });
    await deleteArticle(lib, articleId);
    expect(await listArticles(lib)).toEqual([]);
    expect(await getArticle(lib, articleId)).toBeNull();
    expect(await search(lib.driver, { text: '比喻' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/articles.test.ts`
Expected: FAIL with `Cannot find module './articles'`.

- [ ] **Step 3: Implement**

`packages/db/src/articles.ts`:
```ts
import { canonicalText, detectLang, newId, normalizeBlocks, type Block } from '@jot/core';
import type { Library, OpInput } from './library';
import { indexStatements, unindexStatements } from './search';

export type ImportKind = 'paste' | 'txt' | 'md' | 'docx';

export interface NewArticle {
  title: string;
  author?: string | null;
  source?: string | null;
  importKind: ImportKind;
  blocks: Block[];
}

export interface ArticleSummary {
  id: string;
  title: string;
  author: string | null;
  lang: string | null;
  createdAt: number;
}

export interface ArticleDetail extends ArticleSummary {
  source: string | null;
  revisionId: string;
  blocks: Block[];
  text: string;
}

export class EmptyArticleError extends Error {
  constructor() {
    super('The article has no text');
    this.name = 'EmptyArticleError';
  }
}

const TITLE_LENGTH = 40;

function deriveTitle(blocks: Block[]): string {
  const chars = [...blocks[0].runs.map((r) => r.t).join('')];
  return chars.length > TITLE_LENGTH ? `${chars.slice(0, TITLE_LENGTH).join('')}…` : chars.join('');
}

const optional = (value: string | null | undefined): string | null => {
  const clean = value?.normalize('NFC').trim();
  return clean ? clean : null;
};

export async function createArticle(lib: Library, input: NewArticle): Promise<{ articleId: string; revisionId: string }> {
  const blocks = normalizeBlocks(input.blocks);
  if (blocks.length === 0) throw new EmptyArticleError();
  const text = canonicalText(blocks);
  const title = input.title.normalize('NFC').trim() || deriveTitle(blocks);
  const articleId = newId();
  const revisionId = newId();
  const now = lib.now();
  await lib.commit(
    [
      {
        table: 'article_revision',
        id: revisionId,
        fields: { article_id: articleId, parent_id: null, blocks: JSON.stringify(blocks), text, created_at: now },
      },
      {
        table: 'article',
        id: articleId,
        fields: {
          title,
          author: optional(input.author),
          source: optional(input.source),
          lang: detectLang(text),
          import_kind: input.importKind,
          current_revision_id: revisionId,
          created_at: now,
        },
      },
    ],
    indexStatements({ entityType: 'article', entityId: articleId, articleId, title, body: text }),
  );
  return { articleId, revisionId };
}

export function listArticles(lib: Library): Promise<ArticleSummary[]> {
  return lib.driver.query<ArticleSummary>(
    'SELECT id, title, author, lang, created_at AS createdAt FROM article WHERE deleted = 0 ORDER BY created_at DESC, id DESC',
  );
}

export async function getArticle(lib: Library, id: string): Promise<ArticleDetail | null> {
  const [row] = await lib.driver.query<Omit<ArticleDetail, 'blocks'> & { blocks: string }>(
    `SELECT a.id, a.title, a.author, a.source, a.lang, a.created_at AS createdAt,
            r.id AS revisionId, r.blocks, r.text
     FROM article a JOIN article_revision r ON r.id = a.current_revision_id
     WHERE a.id = ? AND a.deleted = 0`,
    [id],
  );
  return row ? { ...row, blocks: JSON.parse(row.blocks) as Block[] } : null;
}

/** Tombstones the article with its markups, anchors and side notes, and drops them from search. */
export async function deleteArticle(lib: Library, id: string): Promise<void> {
  const markups = await lib.driver.query<{ id: string; anchorId: string }>(
    'SELECT id, anchor_id AS anchorId FROM markup WHERE article_id = ? AND deleted = 0',
    [id],
  );
  const notes = await lib.driver.query<{ id: string }>('SELECT id FROM side_note WHERE article_id = ? AND deleted = 0', [id]);
  const tombstone = (table: OpInput['table'], rowId: string): OpInput => ({ table, id: rowId, fields: { deleted: 1 } });
  await lib.commit(
    [
      tombstone('article', id),
      ...markups.flatMap((m) => [tombstone('markup', m.id), tombstone('anchor', m.anchorId)]),
      ...notes.map((n) => tombstone('side_note', n.id)),
    ],
    [
      ...unindexStatements('article', id),
      ...markups.flatMap((m) => unindexStatements('markup', m.id)),
      ...notes.flatMap((n) => unindexStatements('side_note', n.id)),
    ],
  );
}
```

Append to `packages/db/src/index.ts`:
```ts
export * from './articles';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/articles.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): add article repository with revisions and search indexing"
```

---

### Task 4: Markup and side-note repository

**Files:**
- Create: `packages/db/src/markups.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/markups.test.ts`

**Interfaces:**
- Consumes: `captureAnchor`, `newId`, `TextAnchor` and `ResolutionStatus` from core; `generateKeyBetween`; `Library`; the search statements; `createArticle` and `deleteArticle` (Task 3).
- Produces:
  - `type MarkupKind = 'term' | 'line' | 'paragraph'`
  - `interface NewMarkup { articleId; revisionId; anchor: TextAnchor; kind: MarkupKind; style?: string }`
  - `interface MarkupView { id; kind: MarkupKind; style; anchorId; start; end; exact; status: ResolutionStatus }` — position taken from `anchor_res`, falling back to the anchor
  - `interface SideNoteView { id; markupId; body; sortKey; createdAt }`
  - `class EmptySelectionError`
  - `createMarkup(lib, m): Promise<{ markupId; anchorId }>` — also writes `anchor_res` (status `exact`) and indexes the quote for search
  - `listMarkups(lib, articleId): Promise<MarkupView[]>`, ordered by position
  - `deleteMarkup(lib, markupId)` — also deletes that markup's side notes
  - `createSideNote(lib, { markupId, articleId, body }): Promise<string>`, `updateSideNote(lib, id, body)`, `deleteSideNote(lib, id)`
  - `listSideNotes(lib, articleId): Promise<SideNoteView[]>`, ordered by markup, then `sort_key`

- [ ] **Step 1: Write the failing test**

`packages/db/src/markups.test.ts`:
```ts
import { captureAnchor, type Block } from '@jot/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, getArticle } from './articles';
import { Library } from './library';
import {
  createMarkup, createSideNote, deleteMarkup, deleteSideNote, EmptySelectionError, listMarkups, listSideNotes, updateSideNote,
} from './markups';
import { search } from './search';

let lib: Library;
let articleId: string;
let revisionId: string;
let text: string;

const blocks: Block[] = [
  { k: 'p', runs: [{ t: '他用比喻写春天。' }] },
  { k: 'p', runs: [{ t: '她也用比喻。' }] },
];

beforeEach(async () => {
  let t = 1000;
  lib = await Library.open(createNodeDriver(), { now: () => t++ });
  ({ articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks }));
  text = (await getArticle(lib, articleId))!.text;
});

const mark = (start: number, end: number, kind: 'term' | 'line' | 'paragraph' = 'term') =>
  createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, start, end), kind });

describe('markups', () => {
  it('creates a markup and lists it at its position', async () => {
    const { markupId } = await mark(2, 4);
    expect(await listMarkups(lib, articleId)).toEqual([
      { id: markupId, kind: 'term', style: 'default', anchorId: expect.any(String), start: 2, end: 4, exact: '比喻', status: 'exact' },
    ]);
  });

  it('lists overlapping markups in position order', async () => {
    const b = await mark(4, 8, 'line');
    const a = await mark(2, 6);
    expect((await listMarkups(lib, articleId)).map((m) => m.id)).toEqual([a.markupId, b.markupId]);
  });

  it('rejects a whitespace-only selection (Review Focus 2)', async () => {
    await expect(
      createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 8, 10), kind: 'term' }),
    ).rejects.toBeInstanceOf(EmptySelectionError);
  });

  it('indexes the quote for search', async () => {
    const { markupId } = await mark(2, 4);
    const hits = await search(lib.driver, { text: '比喻', types: ['markup'] });
    expect(hits.map((h) => h.entityId)).toEqual([markupId]);
  });

  it('keeps side notes in creation order and searchable', async () => {
    const { markupId } = await mark(2, 4);
    const first = await createSideNote(lib, { markupId, articleId, body: '以物喻物' });
    const second = await createSideNote(lib, { markupId, articleId, body: '' });
    await updateSideNote(lib, second, '通感');
    expect((await listSideNotes(lib, articleId)).map((n) => [n.id, n.body])).toEqual([
      [first, '以物喻物'],
      [second, '通感'],
    ]);
    expect((await search(lib.driver, { text: '通感' })).map((h) => h.entityId)).toEqual([second]);
    await deleteSideNote(lib, first);
    expect((await listSideNotes(lib, articleId)).map((n) => n.id)).toEqual([second]);
    expect(await search(lib.driver, { text: '以物' })).toEqual([]);
  });

  it('deleting a markup deletes its side notes', async () => {
    const { markupId } = await mark(2, 4);
    await createSideNote(lib, { markupId, articleId, body: '旁注' });
    await deleteMarkup(lib, markupId);
    expect(await listMarkups(lib, articleId)).toEqual([]);
    expect(await listSideNotes(lib, articleId)).toEqual([]);
    expect(await search(lib.driver, { text: '旁注' })).toEqual([]);
  });

  it('deleting an article deletes its markups and side notes', async () => {
    const { markupId } = await mark(2, 4);
    await createSideNote(lib, { markupId, articleId, body: '旁注' });
    await deleteArticle(lib, articleId);
    expect(await listMarkups(lib, articleId)).toEqual([]);
    expect(await listSideNotes(lib, articleId)).toEqual([]);
    expect(await search(lib.driver, { text: '比喻' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run packages/db/src/markups.test.ts`
Expected: FAIL with `Cannot find module './markups'`.

- [ ] **Step 3: Implement**

`packages/db/src/markups.ts`:
```ts
import { newId, type ResolutionStatus, type TextAnchor } from '@jot/core';
import { generateKeyBetween } from 'fractional-indexing';
import type { Stmt } from './driver';
import type { Library, OpInput } from './library';
import { indexStatements, unindexStatements } from './search';

export type MarkupKind = 'term' | 'line' | 'paragraph';

export interface NewMarkup {
  articleId: string;
  revisionId: string;
  anchor: TextAnchor;
  kind: MarkupKind;
  style?: string;
}

export interface MarkupView {
  id: string;
  kind: MarkupKind;
  style: string;
  anchorId: string;
  start: number;
  end: number;
  exact: string;
  status: ResolutionStatus;
}

export interface SideNoteView {
  id: string;
  markupId: string;
  body: string;
  sortKey: string;
  createdAt: number;
}

export class EmptySelectionError extends Error {
  constructor() {
    super('Select some text first');
    this.name = 'EmptySelectionError';
  }
}

/** Local-only resolved position (spec §5.3); a new anchor sits exactly where it was captured. */
function anchorResStatement(anchorId: string, revisionId: string, start: number, end: number): Stmt {
  return {
    sql: `INSERT INTO anchor_res (anchor_id, revision_id, start, "end", status, score) VALUES (?, ?, ?, ?, 'exact', 1)
          ON CONFLICT (anchor_id) DO UPDATE SET revision_id = excluded.revision_id, start = excluded.start,
            "end" = excluded."end", status = excluded.status, score = excluded.score`,
    params: [anchorId, revisionId, start, end],
  };
}

export async function createMarkup(lib: Library, m: NewMarkup): Promise<{ markupId: string; anchorId: string }> {
  const a = m.anchor;
  if (a.exact.trim() === '') throw new EmptySelectionError();
  const anchorId = newId();
  const markupId = newId();
  const now = lib.now();
  await lib.commit(
    [
      {
        table: 'anchor',
        id: anchorId,
        fields: {
          article_id: m.articleId,
          revision_id: m.revisionId,
          start: a.start,
          end: a.end,
          exact: a.exact,
          prefix: a.prefix,
          suffix: a.suffix,
          unit: a.unit,
          created_at: now,
        },
      },
      {
        table: 'markup',
        id: markupId,
        fields: { article_id: m.articleId, anchor_id: anchorId, kind: m.kind, style: m.style ?? 'default', created_at: now },
      },
    ],
    [
      anchorResStatement(anchorId, m.revisionId, a.start, a.end),
      ...indexStatements({ entityType: 'markup', entityId: markupId, articleId: m.articleId, title: '', body: a.exact }),
    ],
  );
  return { markupId, anchorId };
}

export function listMarkups(lib: Library, articleId: string): Promise<MarkupView[]> {
  return lib.driver.query<MarkupView>(
    `SELECT m.id, m.kind, m.style, a.id AS anchorId,
            coalesce(r.start, a.start) AS start, coalesce(r."end", a."end") AS "end",
            a.exact, coalesce(r.status, 'exact') AS status
     FROM markup m
     JOIN anchor a ON a.id = m.anchor_id
     LEFT JOIN anchor_res r ON r.anchor_id = a.id
     WHERE m.article_id = ? AND m.deleted = 0
     ORDER BY start, "end", m.id`,
    [articleId],
  );
}

export async function deleteMarkup(lib: Library, markupId: string): Promise<void> {
  const [row] = await lib.driver.query<{ anchorId: string }>('SELECT anchor_id AS anchorId FROM markup WHERE id = ?', [markupId]);
  if (!row) return;
  const notes = await lib.driver.query<{ id: string }>('SELECT id FROM side_note WHERE markup_id = ? AND deleted = 0', [
    markupId,
  ]);
  await lib.commit(
    [
      { table: 'markup', id: markupId, fields: { deleted: 1 } },
      { table: 'anchor', id: row.anchorId, fields: { deleted: 1 } },
      ...notes.map((n): OpInput => ({ table: 'side_note', id: n.id, fields: { deleted: 1 } })),
    ],
    [...unindexStatements('markup', markupId), ...notes.flatMap((n) => unindexStatements('side_note', n.id))],
  );
}

export async function createSideNote(
  lib: Library,
  input: { markupId: string; articleId: string; body: string },
): Promise<string> {
  return lib.lock.run(async () => {
    const [last] = await lib.driver.query<{ k: string | null }>(
      'SELECT max(sort_key) AS k FROM side_note WHERE markup_id = ? AND deleted = 0',
      [input.markupId],
    );
    const id = newId();
    await lib.commit(
      [
        {
          table: 'side_note',
          id,
          fields: {
            markup_id: input.markupId,
            article_id: input.articleId,
            body: input.body,
            sort_key: generateKeyBetween(last?.k ?? null, null),
            created_at: lib.now(),
          },
        },
      ],
      indexStatements({ entityType: 'side_note', entityId: id, articleId: input.articleId, title: '', body: input.body }),
    );
    return id;
  });
}

export async function updateSideNote(lib: Library, id: string, body: string): Promise<void> {
  const [row] = await lib.driver.query<{ articleId: string }>(
    'SELECT article_id AS articleId FROM side_note WHERE id = ? AND deleted = 0',
    [id],
  );
  if (!row) return;
  await lib.commit(
    [{ table: 'side_note', id, fields: { body } }],
    indexStatements({ entityType: 'side_note', entityId: id, articleId: row.articleId, title: '', body }),
  );
}

export async function deleteSideNote(lib: Library, id: string): Promise<void> {
  await lib.commit([{ table: 'side_note', id, fields: { deleted: 1 } }], unindexStatements('side_note', id));
}

export function listSideNotes(lib: Library, articleId: string): Promise<SideNoteView[]> {
  return lib.driver.query<SideNoteView>(
    `SELECT id, markup_id AS markupId, body, sort_key AS sortKey, created_at AS createdAt
     FROM side_note WHERE article_id = ? AND deleted = 0 ORDER BY markup_id, sort_key, id`,
    [articleId],
  );
}
```

Append to `packages/db/src/index.ts`:
```ts
export * from './markups';
```

- [ ] **Step 4: Run it to verify it passes, then run the whole suite**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run packages/db/src/markups.test.ts && pnpm test && pnpm typecheck && pnpm lint'`
Expected: 7 markup tests pass, every other test passes, and there are no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): add markup and side-note repository with anchors and search"
```

---
### Task 5: Import pipeline: HTML, Markdown and plain text to blocks

**Files:**
- Create: `apps/client/src/import/htmlToBlocks.ts`, `apps/client/src/import/markdown.ts`, `apps/client/src/import/draft.ts`
- Test: `apps/client/src/import/htmlToBlocks.test.ts`, `apps/client/src/import/markdown.test.ts`, `apps/client/src/import/draft.test.ts`

**Interfaces:**
- Consumes: `normalizeBlocks`, `plainTextToBlocks`, `blockText`, `Block`, `BlockKind` and `Run` from core; `ImportKind` from `@jot/db`.
- Produces:
  - `htmlToBlocks(html: string): Block[]`
  - `markdownToBlocks(source: string): Block[]`
  - `type ImportSource = { kind: 'paste'; text: string; html?: string } | { kind: 'file'; name: string; text: string }`
  - `interface ImportDraft { title: string; blocks: Block[]; importKind: ImportKind }`
  - `draftFromSource(source): ImportDraft` — throws `UnsupportedFileError` for extensions other than `.txt`, `.text`, `.md`, `.markdown` or none

- [ ] **Step 1: Add dependencies**

Run: `docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client add markdown-it && pnpm --filter @jot/client add -D @types/markdown-it happy-dom'`

- [ ] **Step 2: Write the failing tests**

`apps/client/src/import/htmlToBlocks.test.ts`:
```ts
// @vitest-environment happy-dom
import { blockText } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { htmlToBlocks } from './htmlToBlocks';

const kinds = (html: string) => htmlToBlocks(html).map((b) => [b.k, blockText(b)]);

describe('htmlToBlocks', () => {
  it('keeps paragraphs, headings, quotes and list items', () => {
    expect(
      kinds('<h1>题目</h1><p>第一段。</p><h4>小节</h4><blockquote><p>引文</p></blockquote><ul><li>甲</li><li>乙</li></ul>'),
    ).toEqual([
      ['h1', '题目'],
      ['p', '第一段。'],
      ['h3', '小节'],
      ['quote', '引文'],
      ['li', '甲'],
      ['li', '乙'],
    ]);
  });

  it('keeps bold and italic as run marks', () => {
    expect(htmlToBlocks('<p>a <strong>b</strong> <em>c</em></p>')).toEqual([
      { k: 'p', runs: [{ t: 'a ' }, { t: 'b', b: true }, { t: ' ' }, { t: 'c', i: true }] },
    ]);
  });

  it('splits on <br> and flattens nested containers', () => {
    expect(kinds('<div><div>第一行<br>第二行</div><section><p>第三行</p></section></div>')).toEqual([
      ['p', '第一行'],
      ['p', '第二行'],
      ['p', '第三行'],
    ]);
  });

  it('joins wrapped CJK source lines without adding spaces', () => {
    expect(kinds('<p>第一行\n第二行</p><p>Hello\nworld</p>')).toEqual([
      ['p', '第一行第二行'],
      ['p', 'Hello world'],
    ]);
  });

  it('drops scripts, styles and embedded content without running anything (Review Focus 1)', () => {
    const w = window as unknown as { __pwned?: number };
    const blocks = htmlToBlocks(
      '<p>安全</p><script>window.__pwned = 1</script><style>p{}</style>' +
        '<img src="x" onerror="window.__pwned = 1"><iframe src="javascript:window.__pwned=1"></iframe>',
    );
    expect(blocks.map(blockText)).toEqual(['安全']);
    expect(w.__pwned).toBeUndefined();
  });

  it('ignores whitespace between blocks and returns nothing for empty input', () => {
    expect(kinds('<p>a</p>\n  \n<p>b</p>')).toEqual([
      ['p', 'a'],
      ['p', 'b'],
    ]);
    expect(htmlToBlocks('')).toEqual([]);
    expect(htmlToBlocks('<p>   </p>')).toEqual([]);
  });

  it('survives deeply nested markup', () => {
    expect(kinds(`${'<div>'.repeat(2000)}深${'</div>'.repeat(2000)}`)).toEqual([['p', '深']]);
  });
});
```

`apps/client/src/import/markdown.test.ts`:
```ts
// @vitest-environment happy-dom
import { blockText } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { markdownToBlocks } from './markdown';

describe('markdownToBlocks', () => {
  it('converts headings, emphasis and lists', () => {
    expect(markdownToBlocks('# 题目\n\n正文 **重点** *强调*\n\n- 甲\n- 乙\n')).toEqual([
      { k: 'h1', runs: [{ t: '题目' }] },
      { k: 'p', runs: [{ t: '正文 ' }, { t: '重点', b: true }, { t: ' ' }, { t: '强调', i: true }] },
      { k: 'li', runs: [{ t: '甲' }] },
      { k: 'li', runs: [{ t: '乙' }] },
    ]);
  });

  it('shows raw HTML in Markdown as text instead of rendering it (Review Focus 1)', () => {
    expect(markdownToBlocks('<b>x</b> and <script>alert(1)</script>').map(blockText)).toEqual([
      '<b>x</b> and <script>alert(1)</script>',
    ]);
  });
});
```

`apps/client/src/import/draft.test.ts`:
```ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { draftFromSource, UnsupportedFileError } from './draft';

describe('draftFromSource', () => {
  it('prefers pasted HTML and falls back to plain text', () => {
    expect(draftFromSource({ kind: 'paste', text: 'plain', html: '<h1>题</h1><p>文</p>' })).toMatchObject({
      title: '题',
      importKind: 'paste',
      blocks: [{ k: 'h1' }, { k: 'p' }],
    });
    expect(draftFromSource({ kind: 'paste', text: '甲\n\n乙', html: '<meta charset="utf-8">' })).toMatchObject({
      title: '',
      blocks: [{ k: 'p' }, { k: 'p' }],
    });
  });

  it('reads .md files with the first heading as title and .txt files with the file name', () => {
    expect(draftFromSource({ kind: 'file', name: 'guxiang.md', text: '# 故乡\n\n我冒了严寒。' })).toMatchObject({
      title: '故乡',
      importKind: 'md',
    });
    expect(draftFromSource({ kind: 'file', name: 'notes.MD', text: '没有标题' })).toMatchObject({ title: 'notes', importKind: 'md' });
    expect(draftFromSource({ kind: 'file', name: '春.txt', text: '\u{FEFF}第一段\n第二段' })).toMatchObject({
      title: '春',
      importKind: 'txt',
      blocks: [{ runs: [{ t: '第一段' }] }, { runs: [{ t: '第二段' }] }],
    });
  });

  it('rejects unsupported file types (Review Focus 5)', () => {
    expect(() => draftFromSource({ kind: 'file', name: 'essay.docx', text: '' })).toThrow(UnsupportedFileError);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/import`
Expected: FAIL with `Cannot find module './htmlToBlocks'`, `'./markdown'` and `'./draft'`.

- [ ] **Step 4: Implement**

`apps/client/src/import/htmlToBlocks.ts`:
```ts
import { normalizeBlocks, type Block, type BlockKind, type Run } from '@jot/core';

const BLOCK_KIND: Record<string, BlockKind> = {
  P: 'p', DIV: 'p', SECTION: 'p', ARTICLE: 'p', MAIN: 'p', HEADER: 'p', FOOTER: 'p', ASIDE: 'p', PRE: 'p',
  TABLE: 'p', TR: 'p', UL: 'p', OL: 'p', DL: 'p', DT: 'p', DD: 'p', FIGCAPTION: 'p', CAPTION: 'p',
  H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3',
  BLOCKQUOTE: 'quote', LI: 'li',
};

const SKIPPED = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK', 'IFRAME', 'OBJECT', 'EMBED',
  'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG',
]);

type Marks = Pick<Run, 'b' | 'i'>;

/**
 * Pasted or converted HTML → the article block model (spec §6.1). Only text, block structure and
 * bold/italic survive. The input is parsed with DOMParser (which never runs scripts or loads media)
 * and is never rendered as HTML, so hostile markup stays inert.
 */
export function htmlToBlocks(html: string): Block[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const blocks: Block[] = [];
  let current: Block | null = null;

  const target = (kind: BlockKind): Block => {
    if (!current) {
      current = { k: kind, runs: [] };
      blocks.push(current);
    }
    return current;
  };

  const walk = (node: Node, marks: Marks, kind: BlockKind): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').replace(/[ \t\r\f]+/g, ' ');
      if (t) target(kind).runs.push({ t, ...marks });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName.toUpperCase();
    if (SKIPPED.has(tag)) return;
    if (tag === 'BR') {
      current = null;
      return;
    }
    const inner: Marks =
      tag === 'B' || tag === 'STRONG' ? { ...marks, b: true } : tag === 'I' || tag === 'EM' ? { ...marks, i: true } : marks;
    const blockKind = BLOCK_KIND[tag];
    if (!blockKind) {
      node.childNodes.forEach((child) => walk(child, inner, kind));
      return;
    }
    // A paragraph inside a quote or list item keeps the outer kind.
    const k: BlockKind = blockKind === 'p' && (kind === 'quote' || kind === 'li') ? kind : blockKind;
    current = null;
    node.childNodes.forEach((child) => walk(child, inner, k));
    current = null;
  };

  body.childNodes.forEach((child) => walk(child, {}, 'p'));
  return normalizeBlocks(blocks);
}
```

`apps/client/src/import/markdown.ts`:
```ts
import type { Block } from '@jot/core';
import MarkdownIt from 'markdown-it';
import { htmlToBlocks } from './htmlToBlocks';

// html: false → raw HTML in the source is escaped and shows up as text.
const md = new MarkdownIt({ html: false, linkify: false });

export function markdownToBlocks(source: string): Block[] {
  return htmlToBlocks(md.render(source));
}
```

`apps/client/src/import/draft.ts`:
```ts
import { blockText, plainTextToBlocks, type Block } from '@jot/core';
import type { ImportKind } from '@jot/db';
import { htmlToBlocks } from './htmlToBlocks';
import { markdownToBlocks } from './markdown';

export type ImportSource = { kind: 'paste'; text: string; html?: string } | { kind: 'file'; name: string; text: string };

export interface ImportDraft {
  title: string;
  blocks: Block[];
  importKind: ImportKind;
}

export class UnsupportedFileError extends Error {
  constructor(name: string) {
    super(`Unsupported file: ${name}`);
    this.name = 'UnsupportedFileError';
  }
}

const withoutBom = (text: string) => text.replace(/^\u{FEFF}/u, '');

function headingTitle(blocks: Block[]): string | null {
  const heading = blocks.find((b) => b.k === 'h1');
  return heading ? blockText(heading) : null;
}

/** What an import would create, before anything is saved (the dialog previews it). */
export function draftFromSource(source: ImportSource): ImportDraft {
  const text = withoutBom(source.text);
  if (source.kind === 'paste') {
    const fromHtml = source.html ? htmlToBlocks(source.html) : [];
    const blocks = fromHtml.length > 0 ? fromHtml : plainTextToBlocks(text);
    return { title: headingTitle(blocks) ?? '', blocks, importKind: 'paste' };
  }
  const dot = source.name.lastIndexOf('.');
  const ext = dot >= 0 ? source.name.slice(dot + 1).toLowerCase() : '';
  const stem = dot > 0 ? source.name.slice(0, dot) : source.name;
  if (ext === 'md' || ext === 'markdown') {
    const blocks = markdownToBlocks(text);
    return { title: headingTitle(blocks) ?? stem, blocks, importKind: 'md' };
  }
  if (ext === 'txt' || ext === 'text' || ext === '') {
    return { title: stem, blocks: plainTextToBlocks(text), importKind: 'txt' };
  }
  throw new UnsupportedFileError(source.name);
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/import && pnpm typecheck && pnpm lint'`
Expected: PASS (12 tests), with no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "feat(client): import pasted HTML, Markdown and plain text as article blocks"
```

---

### Task 6: Interface translations (zh-CN and en)

**Files:**
- Create: `apps/client/src/i18n/en.ts`, `apps/client/src/i18n/zh-CN.ts`, `apps/client/src/i18n/index.ts`
- Test: `apps/client/src/i18n/i18n.test.ts`

**Interfaces:**
- Produces:
  - `type Messages = typeof en`
  - `type Language = 'zh-CN' | 'en'` and `LANGUAGES`
  - `pickLanguage(stored: string | null, preferred: readonly string[]): Language`
  - `initI18n(): Promise<void>` — reads `localStorage['jot.lang']` and `navigator.languages`
  - `setLanguage(lang: Language): Promise<void>` — persists the choice and sets `<html lang>`
- Keys used by later tasks: `app.*`, `library.*`, `importDialog.*`, `article.*`, `toolbar.*`, `markup.*`, `notes.*`, `memo.*` (full list below).

- [ ] **Step 1: Add dependencies**

Run: `docker compose run --rm -T dev pnpm --filter @jot/client add i18next react-i18next`

- [ ] **Step 2: Write the failing test**

`apps/client/src/i18n/i18n.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { pickLanguage } from './index';
import { zhCN } from './zh-CN';

describe('pickLanguage', () => {
  it('uses a stored choice first', () => {
    expect(pickLanguage('en', ['zh-CN'])).toBe('en');
    expect(pickLanguage('zh-CN', ['en-US'])).toBe('zh-CN');
  });

  it('otherwise follows the first Chinese or English browser language', () => {
    expect(pickLanguage(null, ['zh-TW'])).toBe('zh-CN');
    expect(pickLanguage(null, ['fr-FR', 'zh-CN', 'en'])).toBe('zh-CN');
    expect(pickLanguage(null, ['en-GB'])).toBe('en');
    expect(pickLanguage('garbage', ['de'])).toBe('en');
  });
});

describe('translations', () => {
  const leaves = (o: object, prefix = ''): [string, string][] =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v]] : leaves(v as object, `${prefix}${k}.`)));
  const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

  it('define the same keys in both languages', () => {
    expect(leaves(zhCN).map(([k]) => k).sort()).toEqual(leaves(en).map(([k]) => k).sort());
  });

  it('keep the same {{placeholders}} and no empty strings', () => {
    const zh = new Map(leaves(zhCN));
    for (const [key, value] of leaves(en)) {
      expect(value.length, key).toBeGreaterThan(0);
      expect(zh.get(key)?.length ?? 0, key).toBeGreaterThan(0);
      expect(placeholders(zh.get(key) ?? ''), key).toEqual(placeholders(value));
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/i18n`
Expected: FAIL with `Cannot find module './en'`.

- [ ] **Step 4: Implement**

`apps/client/src/i18n/en.ts`:
```ts
export const en = {
  app: {
    loading: 'Opening your library…',
    locked: 'Jot is already open in another tab. Close it to continue here.',
    unavailable: 'Storage is unavailable: {{message}}',
    language: 'Language',
  },
  library: {
    heading: 'Library',
    empty: 'No articles yet. Import a model article to start.',
    import: 'Import',
    delete: 'Delete',
    confirmDelete: 'Delete “{{title}}”? Its markups and side notes are deleted too.',
    collapse: 'Hide library',
    expand: 'Show library',
  },
  importDialog: {
    heading: 'Import a model article',
    title: 'Title',
    titlePlaceholder: 'Leave empty to use the first line',
    author: 'Author',
    source: 'Source',
    paste: 'Paste the article',
    pastePlaceholder: 'Paste text here…',
    file: 'Or open a .txt or .md file',
    paragraphs: 'Paragraphs: {{count}}',
    submit: 'Import',
    cancel: 'Cancel',
    empty: 'There is no text to import.',
    unsupported: 'Only .txt and .md files can be imported for now.',
  },
  article: {
    none: 'Choose an article from the library, or import one.',
    loading: 'Loading…',
    missing: 'This article no longer exists.',
  },
  toolbar: {
    term: 'Term',
    line: 'Line',
    paragraph: 'Paragraph',
    note: 'Note',
  },
  markup: {
    remove: 'Remove markup',
    addNote: 'Add side note',
    kinds: { term: 'Term', line: 'Line', paragraph: 'Paragraph' },
  },
  notes: {
    placeholder: 'Write a side note…',
    delete: 'Delete note',
  },
  memo: {
    heading: 'Memo',
    comingSoon: 'Analysis memos arrive in the next update.',
  },
};

export type Messages = typeof en;
```

`apps/client/src/i18n/zh-CN.ts`:
```ts
import type { Messages } from './en';

export const zhCN: Messages = {
  app: {
    loading: '正在打开文库…',
    locked: 'Jot 已在另一个标签页中打开。关闭那个标签页后即可在这里继续。',
    unavailable: '存储不可用：{{message}}',
    language: '语言',
  },
  library: {
    heading: '文库',
    empty: '还没有文章。导入一篇范文开始吧。',
    import: '导入',
    delete: '删除',
    confirmDelete: '删除《{{title}}》？其中的标注和旁注也会一并删除。',
    collapse: '收起文库',
    expand: '展开文库',
  },
  importDialog: {
    heading: '导入范文',
    title: '标题',
    titlePlaceholder: '留空则使用第一行',
    author: '作者',
    source: '出处',
    paste: '粘贴文章',
    pastePlaceholder: '在此粘贴文本…',
    file: '或打开 .txt / .md 文件',
    paragraphs: '段落：{{count}}',
    submit: '导入',
    cancel: '取消',
    empty: '没有可导入的文字。',
    unsupported: '目前只能导入 .txt 和 .md 文件。',
  },
  article: {
    none: '从文库中选择一篇文章，或导入一篇。',
    loading: '加载中…',
    missing: '这篇文章已不存在。',
  },
  toolbar: {
    term: '词语',
    line: '句子',
    paragraph: '段落',
    note: '旁注',
  },
  markup: {
    remove: '移除标注',
    addNote: '添加旁注',
    kinds: { term: '词语', line: '句子', paragraph: '段落' },
  },
  notes: {
    placeholder: '写旁注…',
    delete: '删除旁注',
  },
  memo: {
    heading: '札记',
    comingSoon: '分析札记将在下一次更新中推出。',
  },
};
```

`apps/client/src/i18n/index.ts`:
```ts
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { zhCN } from './zh-CN';

export type Language = 'zh-CN' | 'en';
export const LANGUAGES: readonly Language[] = ['zh-CN', 'en'];
const STORAGE_KEY = 'jot.lang';

/** A stored choice wins; otherwise the first Chinese or English browser language; otherwise English. */
export function pickLanguage(stored: string | null, preferred: readonly string[]): Language {
  if (stored === 'zh-CN' || stored === 'en') return stored;
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    if (lower.startsWith('zh')) return 'zh-CN';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function initI18n(): Promise<void> {
  await i18next.use(initReactI18next).init({
    resources: { 'zh-CN': { translation: zhCN }, en: { translation: en } },
    lng: pickLanguage(readStored(), navigator.languages ?? [navigator.language]),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = i18next.language;
}

export async function setLanguage(lang: Language): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage blocked (private mode): the choice lasts for this session only.
  }
  await i18next.changeLanguage(lang);
  document.documentElement.lang = lang;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/i18n && pnpm typecheck && pnpm lint'`
Expected: PASS (4 tests), with no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "feat(client): add zh-CN and en interface translations"
```

---

### Task 7: Boot, data hooks, routing and dev-only memory storage

**Files:**
- Create: `apps/client/src/data/openLibrary.ts`, `apps/client/src/data/LibraryContext.tsx`, `apps/client/src/router.ts`, `apps/client/src/components/Shell.tsx` (a placeholder, replaced in Task 8)
- Modify: `apps/client/src/platform/index.ts`, `apps/client/src/App.tsx`, `apps/client/src/main.tsx`, `apps/client/src/diagnostics/Diagnostics.tsx`, `apps/client/e2e/diagnostics.spec.ts`
- Test: `apps/client/src/router.test.ts`, plus the existing e2e `diagnostics.spec.ts`

**Interfaces:**
- Consumes: `Library` and `SqlDriver` from `@jot/db`; `createMemoryDriver` from `@jot/driver-web/memory`; `initI18n` (Task 6).
- Produces:
  - `openLibraryOnce(): Promise<Boot>`, where `Boot = { kind: 'ready'; lib; driver; platform } | { kind: 'locked' } | { kind: 'unavailable'; message }`
  - `<LibraryProvider lib>` and `useLibrary(): Library`
  - `useLibraryQuery<T>(load: (lib: Library) => Promise<T>, deps: readonly unknown[]): { data?: T; error?: Error; loading: boolean }` — reloads after every commit, and resets when `deps` change
  - `type Route = { name: 'home' } | { name: 'article'; id: string } | { name: 'diagnostics' }`
  - `parseHash(hash): Route`, `routeHash(route): string`, `navigate(route): void`, `useRoute(): Route`
  - The App's test IDs: `app-loading`, `db-locked`, `db-unavailable`
  - `<Diagnostics driver platform />`, shown at `#/diagnostics`

- [ ] **Step 1: Write the failing test**

`apps/client/src/router.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseHash, routeHash, type Route } from './router';

describe('router', () => {
  it('parses the known routes and falls back to home', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
    expect(parseHash('#/diagnostics')).toEqual({ name: 'diagnostics' });
    expect(parseHash('#/article/0199-abc')).toEqual({ name: 'article', id: '0199-abc' });
    expect(parseHash('#/article/../../etc')).toEqual({ name: 'home' });
    expect(parseHash('#/nope')).toEqual({ name: 'home' });
  });

  it('round-trips every route', () => {
    const routes: Route[] = [{ name: 'home' }, { name: 'diagnostics' }, { name: 'article', id: '0199a8e1-7c2b-7000-8000-000000000000' }];
    for (const r of routes) expect(parseHash(routeHash(r))).toEqual(r);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/router.test.ts`
Expected: FAIL with `Cannot find module './router'`.

- [ ] **Step 3: Implement the router, data layer and boot**

`apps/client/src/router.ts`:
```ts
import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'article'; id: string } | { name: 'diagnostics' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path === 'diagnostics') return { name: 'diagnostics' };
  const article = /^article\/([\w-]+)$/.exec(path);
  return article ? { name: 'article', id: article[1] } : { name: 'home' };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'diagnostics':
      return '#/diagnostics';
    case 'article':
      return `#/article/${route.id}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHash(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
```

Replace `apps/client/src/platform/index.ts` with:
```ts
import type { SqlDriver } from '@jot/db';
import { createTauriDriver, isTauri } from './tauri';

export type Platform = 'web' | 'desktop';

export interface OpenedDriver {
  driver: SqlDriver;
  platform: Platform;
}

let opened: Promise<OpenedDriver> | null = null;

/** Dev-only: `?storage=memory` opens a throwaway in-memory library (used by WebKit e2e, which has no OPFS). */
function wantsMemoryStorage(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get('storage') === 'memory';
}

/** Opens the library database once per page: native SQLite under Tauri, OPFS in the browser. */
export function openPlatformDriver(): Promise<OpenedDriver> {
  if (opened) return opened;
  if (isTauri()) {
    opened = Promise.resolve<OpenedDriver>({ driver: createTauriDriver(), platform: 'desktop' });
  } else if (wantsMemoryStorage()) {
    opened = import('@jot/driver-web/memory').then(
      async ({ createMemoryDriver }): Promise<OpenedDriver> => ({ driver: await createMemoryDriver(), platform: 'web' }),
    );
  } else {
    opened = import('@jot/driver-web').then(
      async ({ createWebDriver }): Promise<OpenedDriver> => ({ driver: await createWebDriver(), platform: 'web' }),
    );
  }
  return opened;
}
```

`apps/client/src/data/openLibrary.ts`:
```ts
import { Library, type SqlDriver } from '@jot/db';
import { openPlatformDriver, type Platform } from '../platform';

export type Boot =
  | { kind: 'ready'; lib: Library; driver: SqlDriver; platform: Platform }
  | { kind: 'locked' }
  | { kind: 'unavailable'; message: string };

let boot: Promise<Boot> | null = null;

/** Opens (and migrates) the library once per page load. */
export function openLibraryOnce(): Promise<Boot> {
  boot ??= (async (): Promise<Boot> => {
    try {
      const { driver, platform } = await openPlatformDriver();
      return { kind: 'ready', lib: await Library.open(driver), driver, platform };
    } catch (err) {
      if (err instanceof Error && err.name === 'DatabaseLockedError') return { kind: 'locked' };
      return { kind: 'unavailable', message: err instanceof Error ? err.message : String(err) };
    }
  })();
  return boot;
}
```

`apps/client/src/data/LibraryContext.tsx`:
```tsx
import type { Library } from '@jot/db';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const LibraryContext = createContext<Library | null>(null);

export function LibraryProvider({ lib, children }: { lib: Library; children: ReactNode }) {
  return <LibraryContext.Provider value={lib}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): Library {
  const lib = useContext(LibraryContext);
  if (!lib) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return lib;
}

export interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

/**
 * Runs `load` now and again after every commit, so views follow the library without manual refresh.
 * A late result from an older run (or older `deps`) never overwrites a newer one.
 */
export function useLibraryQuery<T>(load: (lib: Library) => Promise<T>, deps: readonly unknown[]): QueryState<T> {
  const lib = useLibrary();
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: undefined, loading: true });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let active = true;
    let version = 0;
    setState({ data: undefined, error: undefined, loading: true });
    const refresh = () => {
      const mine = ++version;
      loadRef.current(lib).then(
        (data) => {
          if (active && mine === version) setState({ data, error: undefined, loading: false });
        },
        (error: unknown) => {
          if (active && mine === version) {
            setState((s) => ({ ...s, error: error instanceof Error ? error : new Error(String(error)), loading: false }));
          }
        },
      );
    };
    refresh();
    const unsubscribe = lib.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
    // `deps` identify what `load` reads; `load` itself is recreated on every render (kept in loadRef).
  }, [lib, ...deps]);

  return state;
}
```

`apps/client/src/components/Shell.tsx` (placeholder until Task 8):
```tsx
import type { Route } from '../router';

export function Shell({ route }: { route: Route }) {
  return <main data-testid="shell">{route.name}</main>;
}
```

Replace `apps/client/src/diagnostics/Diagnostics.tsx` with:
```tsx
import type { SqlDriver } from '@jot/db';
import { useEffect, useState } from 'react';
import type { Platform } from '../platform';
import { runDiagnostics, type DiagnosticsReport } from './runDiagnostics';

let started: Promise<DiagnosticsReport> | null = null;

/** Runs once per page load, even if React mounts the component twice. */
function runOnce(driver: SqlDriver): Promise<DiagnosticsReport> {
  started ??= runDiagnostics(driver);
  return started;
}

/** Developer screen at #/diagnostics (English only by design). */
export function Diagnostics({ driver, platform }: { driver: SqlDriver; platform: Platform }) {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    runOnce(driver).then(
      (r) => {
        if (active) setReport(r);
      },
      (e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      active = false;
    };
  }, [driver]);

  if (error) return <p data-testid="db-unavailable">Diagnostics failed: {error}</p>;
  if (!report) return <p data-testid="diag-loading">Running diagnostics…</p>;
  return (
    <main style={{ fontFamily: 'system-ui, "Noto Sans CJK SC", sans-serif', padding: 24 }}>
      <h1>Jot storage diagnostics</h1>
      <dl>
        <dt>Status</dt>
        <dd data-testid="diag-status">{report.ok ? 'ok' : 'failed'}</dd>
        <dt>Platform</dt>
        <dd data-testid="platform">{platform}</dd>
        <dt>SQLite</dt>
        <dd data-testid="sqlite-version">{report.sqliteVersion}</dd>
        <dt>Device</dt>
        <dd>{report.deviceId}</dd>
        <dt>Launches</dt>
        <dd data-testid="boot-count">{report.bootCount}</dd>
      </dl>
      <ul>
        {report.cases.map((c) => (
          <li key={c.name} data-testid="diag-case">
            {c.ok ? '✓' : '✗'} {c.name}
            {c.error ? ` — ${c.error}` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

Replace `apps/client/src/App.tsx` with:
```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shell } from './components/Shell';
import { LibraryProvider } from './data/LibraryContext';
import { openLibraryOnce, type Boot } from './data/openLibrary';
import { Diagnostics } from './diagnostics/Diagnostics';
import { useRoute } from './router';

export function App() {
  const { t } = useTranslation();
  const route = useRoute();
  const [boot, setBoot] = useState<Boot | null>(null);

  useEffect(() => {
    let active = true;
    void openLibraryOnce().then((b) => {
      if (active) setBoot(b);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!boot) return <p className="boot" data-testid="app-loading">{t('app.loading')}</p>;
  if (boot.kind === 'locked') return <p className="boot" data-testid="db-locked">{t('app.locked')}</p>;
  if (boot.kind === 'unavailable') {
    return <p className="boot" data-testid="db-unavailable">{t('app.unavailable', { message: boot.message })}</p>;
  }
  if (route.name === 'diagnostics') return <Diagnostics driver={boot.driver} platform={boot.platform} />;
  return (
    <LibraryProvider lib={boot.lib}>
      <Shell route={route} />
    </LibraryProvider>
  );
}
```

Replace `apps/client/src/main.tsx` with:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initI18n } from './i18n';

void initI18n().then(() => {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
```

In `apps/client/e2e/diagnostics.spec.ts`, change the three `await page.goto('/');` calls that open the **first** page of each test to `await page.goto('/#/diagnostics');`. Leave the second tab's `await second.goto('/');` unchanged: the lock message now comes from the App (`db-locked`).

- [ ] **Step 4: Run the unit tests, type check and lint**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client && pnpm typecheck && pnpm lint'`
Expected: every client test passes (including 2 router tests), with no type or lint errors.

- [ ] **Step 5: Run the diagnostics e2e**

Run:
```bash
docker compose up -d web && docker compose --profile e2e up -d playwright
docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e diagnostics
```
Expected: 3 passed (chromium) and 3 skipped (webkit).

- [ ] **Step 6: Commit**

```bash
git add apps/client
git commit -m "feat(client): boot the library once, add data hooks, hash routing and dev memory storage"
```

---

### Task 8: App shell: library sidebar, reader area, memo column and styles

**Files:**
- Create: `apps/client/src/components/Sidebar.tsx`, `Splitter.tsx`, `MemoPane.tsx`, `ArticlePane.tsx`, `apps/client/src/data/useStoredNumber.ts`, `apps/client/src/styles/app.css`, `apps/client/e2e/helpers.ts`, `apps/client/e2e/shell.spec.ts`
- Modify: `apps/client/src/components/Shell.tsx` (replace), `apps/client/src/main.tsx` (import the CSS)
- Test: `apps/client/e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `listArticles`, `deleteArticle`, `getArticle` and `ArticleSummary`; `useLibrary` and `useLibraryQuery`; `navigate`, `routeHash` and `Route`; `setLanguage`, `LANGUAGES` and `Language`.
- Produces:
  - `<Shell route>`, laid out as sidebar | reader | splitter | memo
  - Test IDs: `shell`, `import-open`, `library-list`, `library-empty`, `language`, `memo-pane`, `memo-splitter`, `sidebar-toggle`, `article-title`
  - The sidebar collapses to a narrow rail (spec §6.8). The choice is remembered per device.
  - `Shell` holds `importing` state. Task 9 renders `<ImportDialog>` from it.
  - `ArticlePane({ articleId })` in plain-text form. Tasks 11–13 replace its body.
  - e2e helpers `openApp(page, { memory })`, `importText(page, title, text)` and `selectText(page, needle)`

- [ ] **Step 1: Write the failing e2e test and the helpers**

`apps/client/e2e/helpers.ts`:
```ts
import { expect, type Page } from '@playwright/test';

/** Opens the app. `memory` uses the dev-only in-memory library (Playwright's WebKit has no OPFS). */
export async function openApp(page: Page, { memory = true }: { memory?: boolean } = {}): Promise<void> {
  await page.goto(memory ? '/?storage=memory#/' : '/#/');
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
}

export async function importText(page: Page, title: string, text: string): Promise<void> {
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-title').fill(title);
  await page.getByTestId('import-text').fill(text);
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-title')).toHaveText(title);
}

/**
 * Selects the `occurrence`-th `needle` in the article view and reports it like a mouse selection.
 * The needle may cross text nodes (highlights split text) but not paragraphs.
 */
export async function selectText(page: Page, needle: string, occurrence = 0): Promise<void> {
  await page.getByTestId('article-view').evaluate(
    (root, [n, occ]) => {
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
      const all = nodes.map((t) => t.data).join('');
      let at = -1;
      for (let i = 0; i <= occ; i++) at = all.indexOf(n, at + 1);
      if (at < 0) throw new Error(`text not found in article: ${n}`);
      const locate = (offset: number): [Text, number] => {
        let rest = offset;
        for (const t of nodes) {
          if (rest <= t.data.length) return [t, rest];
          rest -= t.data.length;
        }
        const last = nodes[nodes.length - 1];
        return [last, last.data.length];
      };
      const [startNode, startOffset] = locate(at);
      const [endNode, endOffset] = locate(at + n.length);
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const selection = window.getSelection() as Selection;
      selection.removeAllRanges();
      selection.addRange(range);
      root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    [needle, occurrence] as const,
  );
}
```

`apps/client/e2e/shell.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test('shows an empty library and the memo column', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page.getByTestId('memo-pane')).toBeVisible();
});

test('switches the interface language and remembers it', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await page.getByTestId('language').selectOption('zh-CN');
  await expect(page.getByRole('heading', { name: '文库' })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: '文库' })).toBeVisible();
});

test('collapses and restores the library sidebar', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('sidebar-toggle').click();
  await expect(page.getByTestId('library-list')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('library-list')).toHaveCount(0);
  await page.getByTestId('sidebar-toggle').click();
  await expect(page.getByTestId('library-list')).toBeVisible();
});

test('resizes the memo column by dragging the splitter', async ({ page }) => {
  await openApp(page);
  const memo = page.getByTestId('memo-pane');
  const before = (await memo.boundingBox())?.width ?? 0;
  const handle = await page.getByTestId('memo-splitter').boundingBox();
  if (!handle) throw new Error('splitter not rendered');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x - 120, handle.y + 100, { steps: 5 });
  await page.mouse.up();
  expect((await memo.boundingBox())?.width ?? 0).toBeGreaterThan(before + 100);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (with `web` and `playwright` up, as in Task 7): `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e shell --project chromium`
Expected: FAIL because the placeholder shell has no `library-empty`, `memo-pane` or `memo-splitter`.

- [ ] **Step 3: Implement**

`apps/client/src/data/useStoredNumber.ts`:
```ts
import { useState } from 'react';

/** A number kept in localStorage (a per-device layout preference); falls back silently when storage is blocked. */
export function useStoredNumber(key: string, initial: number): [number, (value: number) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      return Number.isFinite(stored) && stored > 0 ? stored : initial;
    } catch {
      return initial;
    }
  });
  const update = (next: number) => {
    setValue(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // storage blocked: keep the value for this session only
    }
  };
  return [value, update];
}

/** A boolean layout preference kept in localStorage (stored as 1 = true, 2 = false; useStoredNumber treats 0 as unset). */
export function useStoredFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useStoredNumber(key, initial ? 1 : 2);
  return [value === 1, (next) => setValue(next ? 1 : 2)];
}
```

`apps/client/src/components/Splitter.tsx`:
```tsx
import type { PointerEvent as ReactPointerEvent } from 'react';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Vertical drag handle; dragging left widens the column to its right. */
export function Splitter({ width, min, max, onResize }: { width: number; min: number; max: number; onResize(width: number): void }) {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = width;
    handle.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => onResize(clamp(startWidth + (startX - e.clientX), min, max));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };
  return <div className="splitter" role="separator" aria-orientation="vertical" onPointerDown={onPointerDown} data-testid="memo-splitter" />;
}
```

`apps/client/src/components/MemoPane.tsx`:
```tsx
import { useTranslation } from 'react-i18next';

export function MemoPane() {
  const { t } = useTranslation();
  return (
    <>
      <h2>{t('memo.heading')}</h2>
      <p className="muted">{t('memo.comingSoon')}</p>
    </>
  );
}
```

`apps/client/src/components/Sidebar.tsx`:
```tsx
import { deleteArticle, listArticles, type ArticleSummary } from '@jot/db';
import { useTranslation } from 'react-i18next';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { LANGUAGES, setLanguage, type Language } from '../i18n';
import { navigate, routeHash } from '../router';

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
  const { data: articles } = useLibraryQuery(listArticles, []);

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
      <h2>{t('library.heading')}</h2>
      {articles?.length === 0 && (
        <p className="muted" data-testid="library-empty">
          {t('library.empty')}
        </p>
      )}
      <ul className="library" data-testid="library-list">
        {articles?.map((a) => (
          <li key={a.id} className={a.id === activeId ? 'active' : undefined}>
            <a href={routeHash({ name: 'article', id: a.id })}>{a.title}</a>
            <button type="button" className="icon" aria-label={t('library.delete')} onClick={() => void remove(a)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <footer>
        <label>
          {t('app.language')}{' '}
          <select value={i18n.language} onChange={(e) => void setLanguage(e.target.value as Language)} data-testid="language">
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

`apps/client/src/components/ArticlePane.tsx` (plain text for now; Task 11 replaces it):
```tsx
import { blockText } from '@jot/core';
import { getArticle } from '@jot/db';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';

export function ArticlePane({ articleId }: { articleId: string }) {
  const { t } = useTranslation();
  const article = useLibraryQuery((lib) => getArticle(lib, articleId), [articleId]);
  const a = article.data;
  if (article.loading && !a) return <p className="empty">{t('article.loading')}</p>;
  if (!a) return <p className="empty">{t('article.missing')}</p>;
  return (
    <div className="article-layout">
      <article>
        <h1 className="article-title" data-testid="article-title">
          {a.title}
        </h1>
        {a.author && <p className="byline">{a.author}</p>}
        <div className="article-view" data-testid="article-view">
          {a.blocks.map((b, i) => (
            <p key={i}>{blockText(b)}</p>
          ))}
        </div>
      </article>
    </div>
  );
}
```

Replace `apps/client/src/components/Shell.tsx` with:
```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStoredFlag, useStoredNumber } from '../data/useStoredNumber';
import type { Route } from '../router';
import { ArticlePane } from './ArticlePane';
import { MemoPane } from './MemoPane';
import { Sidebar } from './Sidebar';
import { Splitter } from './Splitter';

export function Shell({ route }: { route: Route }) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [memoWidth, setMemoWidth] = useStoredNumber('jot.memoWidth', 340);
  const [sidebarCollapsed, setSidebarCollapsed] = useStoredFlag('jot.sidebarCollapsed', false);
  const activeId = route.name === 'article' ? route.id : null;

  return (
    <div className="shell" data-testid="shell" data-importing={importing || undefined}>
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
        <MemoPane />
      </aside>
    </div>
  );
}
```

`apps/client/src/styles/app.css`:
```css
:root {
  color-scheme: light dark;
  --bg: #fbfaf7;
  --panel: #f3f1ec;
  --text: #1f1d1a;
  --muted: #6b665e;
  --line: #dcd7cd;
  --accent: #2f5d8a;
  --danger: #b3261e;
  --mk-term: rgba(255, 213, 79, 0.45);
  --mk-line: #c0392b;
  --mk-para: #2f5d8a;
  --mk-para-bg: rgba(47, 93, 138, 0.07);
  --font-ui: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif;
  --font-read: 'Iowan Old Style', Georgia, 'Noto Serif CJK SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1b1a18;
    --panel: #242320;
    --text: #ebe7df;
    --muted: #a39d92;
    --line: #3a3834;
    --accent: #8fb4dc;
    --danger: #ff8a7a;
    --mk-term: rgba(255, 213, 79, 0.28);
    --mk-line: #ff8a7a;
    --mk-para: #8fb4dc;
    --mk-para-bg: rgba(143, 180, 220, 0.09);
  }
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--text); font-family: var(--font-ui); font-size: 15px; }
button { font: inherit; color: inherit; cursor: pointer; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; }
button:hover { border-color: var(--accent); }
button:disabled { opacity: 0.6; cursor: default; }
.muted { color: var(--muted); }
.error { color: var(--danger); margin: 0; }
.boot { padding: 48px; color: var(--muted); }

/* Shell */
.shell { display: flex; height: 100%; overflow: hidden; }
.sidebar { width: 260px; flex: none; display: flex; flex-direction: column; gap: 10px; padding: 16px; overflow: auto; background: var(--panel); border-right: 1px solid var(--line); }
.sidebar header { display: flex; align-items: center; gap: 8px; }
.sidebar header h1 { flex: 1; }
.sidebar.collapsed { width: 44px; padding: 8px 4px; align-items: center; }
.sidebar .icon { border: none; background: none; padding: 2px 8px; color: var(--muted); }
.sidebar h1 { margin: 0; font-size: 18px; letter-spacing: 0.04em; }
.sidebar h2 { margin: 8px 0 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.library { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.library li { display: flex; align-items: center; border-radius: 6px; }
.library li.active { background: var(--bg); }
.library a { flex: 1; min-width: 0; padding: 6px 8px; color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.library .icon { visibility: hidden; border: none; background: none; padding: 2px 8px; color: var(--muted); }
.library li:hover .icon, .library .icon:focus-visible { visibility: visible; }
.sidebar footer { margin-top: auto; font-size: 13px; color: var(--muted); }
.reader { flex: 1; min-width: 0; overflow: auto; }
.empty { padding: 64px; color: var(--muted); }
.splitter { width: 6px; flex: none; cursor: col-resize; border-left: 1px solid var(--line); touch-action: none; }
.splitter:hover { background: var(--line); }
.memo { flex: none; overflow: auto; padding: 16px; background: var(--panel); }
.memo h2 { margin: 0 0 8px; font-size: 14px; }

/* Article */
.article-layout { position: relative; display: grid; grid-template-columns: minmax(0, 40em) 240px; gap: 32px; padding: 48px 32px 120px 48px; }
.article-title { margin: 0 0 4px; font-family: var(--font-read); font-size: 28px; line-height: 1.3; }
.byline { margin: 0 0 24px; color: var(--muted); }
.article-view { font-family: var(--font-read); font-size: 18px; line-height: 1.9; }
.article-view .ProseMirror { outline: none; white-space: pre-wrap; word-break: break-word; }
.article-view p, .article-view blockquote, .article-view .li { margin: 0 0 1em; }
.article-view blockquote { padding-left: 1em; border-left: 3px solid var(--line); color: var(--muted); }
.article-view .li::before { content: '•'; margin-right: 0.5em; color: var(--muted); }
.article-view h1, .article-view h2, .article-view h3 { margin: 1.2em 0 0.6em; line-height: 1.4; }

/* Markups (decorations) */
.mk { cursor: pointer; }
.mk-term { background: var(--mk-term); border-radius: 2px; }
.mk-line { text-decoration: underline wavy var(--mk-line); text-decoration-thickness: 1px; text-underline-offset: 5px; }
.mk-paragraph { background: var(--mk-para-bg); box-shadow: -12px 0 0 var(--mk-para-bg), -15px 0 0 var(--mk-para); }
.mk-active { outline: 2px solid var(--accent); outline-offset: 1px; }

/* Floating UI */
.toolbar { position: absolute; z-index: 10; display: flex; gap: 2px; padding: 4px; transform: translateY(-100%); background: var(--text); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2); }
.toolbar button { background: transparent; border: none; color: var(--bg); }
.toolbar button:hover { background: rgba(127, 127, 127, 0.25); }
.popover { position: absolute; z-index: 11; min-width: 220px; max-width: 320px; padding: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); }
.popover ul { list-style: none; margin: 0; padding: 0; }
.popover li { display: flex; flex-direction: column; gap: 4px; padding: 6px; }
.popover li + li { border-top: 1px solid var(--line); }
.popover .excerpt { font-family: var(--font-read); }
.popover .actions { display: flex; gap: 6px; }

/* Margin notes */
.margin { position: relative; }
.note { position: absolute; left: 0; right: 0; padding: 6px 8px; font-size: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; transition: top 120ms ease; }
.note:focus-within { border-color: var(--accent); }
.note textarea { display: block; width: 100%; resize: none; overflow: hidden; border: none; outline: none; background: transparent; color: inherit; font: inherit; line-height: 1.5; }
.note footer { display: flex; justify-content: flex-end; }
.note footer button { border: none; background: none; padding: 0 4px; font-size: 12px; color: var(--muted); }

/* Dialog */
.dialog-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(0, 0, 0, 0.35); }
.dialog { width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 20px; background: var(--bg); border-radius: 12px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25); }
.dialog h2 { margin: 0; font-size: 18px; }
.dialog label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
.dialog input, .dialog textarea { font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; }
.dialog textarea { min-height: 200px; font-family: var(--font-read); }
.dialog footer { display: flex; justify-content: flex-end; gap: 8px; }
```

In `apps/client/src/main.tsx`, add as the first line:
```tsx
import './styles/app.css';
```

- [ ] **Step 4: Run the e2e test on both browsers, then type check and lint**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e shell`
Expected: 8 passed (4 on chromium, 4 on webkit).

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client): add app shell with library sidebar, reader area, memo column and styles"
```

---

### Task 9: Import dialog

**Files:**
- Create: `apps/client/src/components/ImportDialog.tsx`, `apps/client/e2e/import.spec.ts`
- Modify: `apps/client/src/components/Shell.tsx` (render the dialog)
- Test: `apps/client/e2e/import.spec.ts`

**Interfaces:**
- Consumes: `draftFromSource`, `ImportSource` and `UnsupportedFileError` (Task 5); `createArticle` and `EmptyArticleError` (Task 3); `navigate`.
- Produces:
  - `<ImportDialog onClose />`
  - Test IDs: `import-dialog`, `import-title`, `import-author`, `import-source`, `import-text`, `import-file`, `import-count`, `import-error`, `import-submit`, `import-cancel`
  - Pasting reads `text/html` and `text/plain` from the clipboard. Typing switches back to plain text.

- [ ] **Step 1: Write the failing e2e test**

`apps/client/e2e/import.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { importText, openApp } from './helpers';

test('imports pasted Chinese text and opens it', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-text').fill('　　春天来了。\n　　燕子飞回来了。\n　　柳树发芽了。');
  await expect(page.getByTestId('import-count')).toContainText('3');
  await page.getByTestId('import-title').fill('春');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-title')).toHaveText('春');
  await expect(page.getByTestId('library-list')).toContainText('春');
  await expect(page.getByTestId('article-view')).toContainText('燕子飞回来了。');
});

test('imports a Markdown file with its heading as the title', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-file').setInputFiles({
    name: 'guxiang.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# 故乡\n\n我冒了严寒，回到相隔二千余里的故乡去。'),
  });
  await expect(page.getByTestId('import-title')).toHaveValue('故乡');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-title')).toHaveText('故乡');
});

test('keeps pasted HTML structure and never runs its scripts (Review Focus 1)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit ignores clipboardData in synthetic paste events');
  await openApp(page);
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-text').evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/html', '<p>安全的<b>文字</b></p><img src="x" onerror="window.__pwned=1"><script>window.__pwned=1</script>');
    data.setData('text/plain', '安全的文字');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId('import-count')).toContainText('1');
  await page.getByTestId('import-title').fill('HTML');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-view')).toContainText('安全的文字');
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('refuses to import nothing and unsupported files (Review Focus 5)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-text').fill('   \n  ');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-error')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles({ name: 'essay.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(page.getByTestId('import-error')).toBeVisible();
  await page.getByTestId('import-cancel').click();
  await expect(page.getByTestId('library-empty')).toBeVisible();
});

test('imports and opens a very long article quickly (Review Focus 4)', async ({ page }) => {
  await openApp(page);
  const text = Array.from({ length: 8000 }, (_, i) => `第${i}段：春风又绿江南岸，明月何时照我还。`).join('\n\n');
  await page.getByTestId('import-open').click();
  await page.getByTestId('import-title').fill('长文');
  await page.getByTestId('import-text').fill(text);
  const started = Date.now();
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('article-title')).toHaveText('长文', { timeout: 20_000 });
  await expect(page.getByTestId('article-view')).toContainText('第7999段', { timeout: 20_000 });
  expect(Date.now() - started).toBeLessThan(5_000);
});

test('keeps imported articles after a reload', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await openApp(page, { memory: false });
  await importText(page, '留存', '这篇文章应该在刷新后仍然存在。');
  await page.reload();
  await expect(page.getByTestId('article-title')).toHaveText('留存', { timeout: 30_000 });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e import --project chromium`
Expected: FAIL because clicking `import-open` shows no dialog (`import-text` is not found).

- [ ] **Step 3: Implement**

`apps/client/src/components/ImportDialog.tsx`:
```tsx
import { createArticle, EmptyArticleError } from '@jot/db';
import { useMemo, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibrary } from '../data/LibraryContext';
import { draftFromSource, UnsupportedFileError, type ImportDraft, type ImportSource } from '../import/draft';
import { navigate } from '../router';

function tryDraft(source: ImportSource): ImportDraft | null {
  try {
    return draftFromSource(source);
  } catch {
    return null;
  }
}

export function ImportDialog({ onClose }: { onClose(): void }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [origin, setOrigin] = useState('');
  const [source, setSource] = useState<ImportSource>({ kind: 'paste', text: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = useMemo(() => tryDraft(source), [source]);

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const data = event.clipboardData;
    if (!data) return;
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    if (!html && !text) return;
    event.preventDefault();
    setError(null);
    setSource({ kind: 'paste', text, html: html || undefined });
  };

  const onType = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setError(null);
    setSource({ kind: 'paste', text: event.target.value });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const next: ImportSource = { kind: 'file', name: file.name, text: await file.text() };
    try {
      const d = draftFromSource(next);
      setSource(next);
      if (!title) setTitle(d.title);
      setError(null);
    } catch (err) {
      setError(err instanceof UnsupportedFileError ? t('importDialog.unsupported') : String(err));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || draft.blocks.length === 0) {
      setError(t('importDialog.empty'));
      return;
    }
    setBusy(true);
    try {
      const { articleId } = await createArticle(lib, {
        title: title || draft.title,
        author,
        source: origin,
        importKind: draft.importKind,
        blocks: draft.blocks,
      });
      onClose();
      navigate({ name: 'article', id: articleId });
    } catch (err) {
      setError(err instanceof EmptyArticleError ? t('importDialog.empty') : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-heading" onSubmit={(e) => void submit(e)} data-testid="import-dialog">
        <h2 id="import-heading">{t('importDialog.heading')}</h2>
        <label>
          {t('importDialog.title')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('importDialog.titlePlaceholder')} data-testid="import-title" />
        </label>
        <label>
          {t('importDialog.author')}
          <input value={author} onChange={(e) => setAuthor(e.target.value)} data-testid="import-author" />
        </label>
        <label>
          {t('importDialog.source')}
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="import-source" />
        </label>
        <label>
          {t('importDialog.paste')}
          <textarea value={source.text} onChange={onType} onPaste={onPaste} placeholder={t('importDialog.pastePlaceholder')} rows={12} data-testid="import-text" />
        </label>
        <label>
          {t('importDialog.file')}
          <input type="file" accept=".txt,.text,.md,.markdown,text/plain,text/markdown" onChange={(e) => void onFile(e)} data-testid="import-file" />
        </label>
        <p className="muted" data-testid="import-count">
          {t('importDialog.paragraphs', { count: draft?.blocks.length ?? 0 })}
        </p>
        {error && (
          <p className="error" role="alert" data-testid="import-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose} data-testid="import-cancel">
            {t('importDialog.cancel')}
          </button>
          <button type="submit" disabled={busy} data-testid="import-submit">
            {t('importDialog.submit')}
          </button>
        </footer>
      </form>
    </div>
  );
}
```

In `apps/client/src/components/Shell.tsx`:
- add `import { ImportDialog } from './ImportDialog';`
- remove the temporary ` data-importing={importing || undefined}` attribute from the `shell` div
- replace the closing `</div>` of the `shell` div (the line just before `  );`) with:
```tsx
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
```

- [ ] **Step 4: Run it on both browsers**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e import`
Expected:
- chromium: 6 passed
- webkit: 4 passed and 2 skipped (the HTML paste and reload tests)

- [ ] **Step 5: Type check, lint and commit**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm typecheck && pnpm lint'`
Expected: no errors.

```bash
git add apps/client
git commit -m "feat(client): import dialog for pasted text, HTML and .txt/.md files"
```

---
### Task 10: ProseMirror article schema, offset mapping and markup decorations

**Files:**
- Create: `apps/client/src/article/schema.ts`, `apps/client/src/article/decorations.ts`
- Test: `apps/client/src/article/schema.test.ts`, `apps/client/src/article/decorations.test.ts`

**Interfaces:**
- Consumes: `Block`, `Run`, `blockRanges`, `canonicalText` and `normalizeBlocks` from core; `MarkupView` from db.
- Produces:
  - `articleSchema`, with textblocks `paragraph`, `heading{level}`, `quote` and `list_item`, and marks `strong` and `em`
  - `blocksToDoc(blocks): PMNode`
  - `offsetToPos(offset) = offset + 1` and `posToOffset(pos) = pos - 1`
  - `buildDecorations(doc, markups, activeId?): DecorationSet`:
    - inline decorations for `term` and `line`, node decorations on every block covered by a `paragraph`
    - class `mk mk-<kind> mk-id-<id>` (plus `mk-active`), and spec `{ markupId }`
    - orphans are skipped, and offsets are clamped to the text
  - `markupIdsAt(el: Element, root: Element): string[]`

- [ ] **Step 1: Add dependencies**

Run: `docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client add prosemirror-model prosemirror-state prosemirror-view && pnpm --filter @jot/client add -D fast-check'`

- [ ] **Step 2: Write the failing tests**

`apps/client/src/article/schema.test.ts`:
```ts
import { blockRanges, canonicalText, normalizeBlocks, type Block } from '@jot/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blocksToDoc, offsetToPos, posToOffset } from './schema';

const blocks: Block[] = [
  { k: 'h1', runs: [{ t: '题目' }] },
  { k: 'p', runs: [{ t: '他用' }, { t: '比喻', b: true }, { t: '写春天。', i: true }] },
  { k: 'quote', runs: [{ t: '引文😀' }] },
  { k: 'li', runs: [{ t: '甲' }] },
];

describe('blocksToDoc', () => {
  it('maps block kinds and inline marks', () => {
    const doc = blocksToDoc(blocks);
    expect(doc.childCount).toBe(4);
    expect([doc.child(0).type.name, doc.child(0).attrs.level]).toEqual(['heading', 1]);
    expect(doc.child(1).child(1).marks.map((m) => m.type.name)).toEqual(['strong']);
    expect(doc.child(1).child(2).marks.map((m) => m.type.name)).toEqual(['em']);
    expect(doc.child(2).type.name).toBe('quote');
    expect(doc.child(3).type.name).toBe('list_item');
  });

  it('reproduces the canonical text', () => {
    const doc = blocksToDoc(blocks);
    expect(doc.textBetween(0, doc.content.size, '\n\n')).toBe(canonicalText(blocks));
  });

  it('property: every in-block offset maps to the same place in the same block', () => {
    const run = fc.record({
      t: fc.array(fc.constantFrom('a', '中', '😀', ' '), { minLength: 1, maxLength: 6 }).map((a) => a.join('')),
      b: fc.option(fc.constant(true as const), { nil: undefined }),
    });
    const block = fc.record({
      k: fc.constantFrom('p' as const, 'h1' as const, 'h2' as const, 'h3' as const, 'quote' as const, 'li' as const),
      runs: fc.array(run, { minLength: 1, maxLength: 4 }),
    });
    fc.assert(
      fc.property(fc.array(block, { minLength: 1, maxLength: 6 }), (raw) => {
        const bs = normalizeBlocks(raw as Block[]);
        fc.pre(bs.length > 0);
        const doc = blocksToDoc(bs);
        blockRanges(bs).forEach((r, i) => {
          for (let o = r.start; o <= r.end; o++) {
            const $pos = doc.resolve(offsetToPos(o));
            expect($pos.index(0)).toBe(i);
            expect($pos.parentOffset).toBe(o - r.start);
            expect(posToOffset(offsetToPos(o))).toBe(o);
          }
        });
      }),
    );
  });
});
```

`apps/client/src/article/decorations.test.ts`:
```ts
// @vitest-environment happy-dom
import type { MarkupView } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { buildDecorations, markupIdsAt } from './decorations';
import { blocksToDoc } from './schema';

// Canonical text: '他用比喻写春天。\n\n她笑😀了。' — the second block starts at offset 10, 😀 is [12, 14).
const doc = blocksToDoc([
  { k: 'p', runs: [{ t: '他用比喻写春天。' }] },
  { k: 'p', runs: [{ t: '她笑😀了。' }] },
]);

const markup = (id: string, kind: MarkupView['kind'], start: number, end: number, status: MarkupView['status'] = 'exact'): MarkupView => ({
  id,
  kind,
  style: 'default',
  anchorId: `a-${id}`,
  start,
  end,
  exact: '',
  status,
});

const spans = (markups: MarkupView[]) =>
  buildDecorations(doc, markups)
    .find()
    .map((d) => ({ id: (d.spec as { markupId: string }).markupId, from: d.from, to: d.to }))
    .sort((a, b) => a.from - b.from || a.id.localeCompare(b.id));

describe('buildDecorations', () => {
  it('draws term and line markups as inline ranges at offset + 1', () => {
    expect(spans([markup('t', 'term', 2, 4), markup('l', 'line', 0, 8)])).toEqual([
      { id: 'l', from: 1, to: 9 },
      { id: 't', from: 3, to: 5 },
    ]);
  });

  it('keeps overlapping markups and astral characters (Review Focus 3)', () => {
    expect(spans([markup('a', 'term', 2, 6), markup('b', 'term', 4, 8), markup('e', 'term', 12, 14)])).toEqual([
      { id: 'a', from: 3, to: 7 },
      { id: 'b', from: 5, to: 9 },
      { id: 'e', from: 13, to: 15 },
    ]);
  });

  it('draws a paragraph markup on every block it covers', () => {
    expect(spans([markup('p', 'paragraph', 0, 16)])).toEqual([
      { id: 'p', from: 0, to: 10 },
      { id: 'p', from: 10, to: 18 },
    ]);
  });

  it('skips orphans and empty ranges, and clamps to the text', () => {
    expect(spans([markup('o', 'term', 2, 4, 'orphan'), markup('z', 'term', 3, 3), markup('x', 'term', 14, 99)])).toEqual([
      { id: 'x', from: 15, to: 17 },
    ]);
  });
});

describe('markupIdsAt', () => {
  it('collects ids from the element and its ancestors inside the root', () => {
    document.body.innerHTML =
      '<div id="root"><p class="mk mk-paragraph mk-id-p1"><span class="mk mk-term mk-id-a mk-id-b">绿</span>x</p></div>';
    const root = document.getElementById('root') as HTMLElement;
    expect(markupIdsAt(root.querySelector('span') as Element, root).sort()).toEqual(['a', 'b', 'p1']);
    expect(markupIdsAt(root, root)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/article`
Expected: FAIL with `Cannot find module './schema'` and `'./decorations'`.

- [ ] **Step 4: Implement**

`apps/client/src/article/schema.ts`:
```ts
import type { Block, Run } from '@jot/core';
import { Schema, type Mark, type Node as PMNode } from 'prosemirror-model';

/**
 * Flat textblocks only. Each block contributes its text plus an open and a close token (2),
 * exactly like the "\n\n" between blocks in the canonical text, so pos = offset + 1 everywhere.
 */
export const articleSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', marks: '_', toDOM: () => ['p', 0] },
    heading: {
      group: 'block',
      content: 'text*',
      marks: '_',
      attrs: { level: { default: 1 } },
      toDOM: (node) => [`h${node.attrs.level as number}`, 0],
    },
    quote: { group: 'block', content: 'text*', marks: '_', toDOM: () => ['blockquote', 0] },
    list_item: { group: 'block', content: 'text*', marks: '_', toDOM: () => ['div', { class: 'li' }, 0] },
    text: {},
  },
  marks: {
    strong: { toDOM: () => ['strong', 0] },
    em: { toDOM: () => ['em', 0] },
  },
});

function marksOf(run: Run): Mark[] {
  const marks: Mark[] = [];
  if (run.b) marks.push(articleSchema.marks.strong.create());
  if (run.i) marks.push(articleSchema.marks.em.create());
  return marks;
}

export function blocksToDoc(blocks: Block[]): PMNode {
  const { nodes } = articleSchema;
  const children = blocks.map((block) => {
    const content = block.runs.filter((r) => r.t.length > 0).map((r) => articleSchema.text(r.t, marksOf(r)));
    switch (block.k) {
      case 'h1':
      case 'h2':
      case 'h3':
        return nodes.heading.create({ level: Number(block.k[1]) }, content);
      case 'quote':
        return nodes.quote.create(null, content);
      case 'li':
        return nodes.list_item.create(null, content);
      default:
        return nodes.paragraph.create(null, content);
    }
  });
  return nodes.doc.create(null, children.length > 0 ? children : [nodes.paragraph.create()]);
}

export const offsetToPos = (offset: number): number => offset + 1;
export const posToOffset = (pos: number): number => pos - 1;
```

`apps/client/src/article/decorations.ts`:
```ts
import type { MarkupView } from '@jot/db';
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { offsetToPos } from './schema';

const ID_PREFIX = 'mk-id-';

/**
 * Markups as decorations: inline highlights for term/line, block decorations for paragraph.
 * Overlapping inline decorations share one span whose class lists every markup id.
 */
export function buildDecorations(doc: PMNode, markups: readonly MarkupView[], activeId: string | null = null): DecorationSet {
  const max = doc.content.size - 2; // length of the canonical text
  const clamp = (offset: number) => Math.max(0, Math.min(max, offset));
  const decorations: Decoration[] = [];
  for (const m of markups) {
    if (m.status === 'orphan') continue;
    const start = clamp(m.start);
    const end = clamp(m.end);
    if (end <= start) continue;
    const attrs = { class: `mk mk-${m.kind} ${ID_PREFIX}${m.id}${m.id === activeId ? ' mk-active' : ''}` };
    const spec = { markupId: m.id };
    if (m.kind === 'paragraph') {
      doc.nodesBetween(offsetToPos(start), offsetToPos(end), (node, pos) => {
        if (node.isTextblock) decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs, spec));
        return false;
      });
    } else {
      decorations.push(Decoration.inline(offsetToPos(start), offsetToPos(end), attrs, spec));
    }
  }
  return DecorationSet.create(doc, decorations);
}

/** Markup ids on `el` and its ancestors up to (not including) `root`. */
export function markupIdsAt(el: Element, root: Element): string[] {
  const ids = new Set<string>();
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    for (const cls of node.classList) if (cls.startsWith(ID_PREFIX)) ids.add(cls.slice(ID_PREFIX.length));
  }
  return [...ids];
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm vitest run apps/client/src/article && pnpm typecheck && pnpm lint'`
Expected: PASS (8 tests), with no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "feat(client): add flat ProseMirror article schema and markup decorations"
```

---

### Task 11: Article view, selection toolbar and markups (risk check M0.3)

**Files:**
- Create: `apps/client/src/article/markupRange.ts`, `apps/client/src/components/ArticleView.tsx`, `apps/client/src/components/SelectionToolbar.tsx`, `apps/client/e2e/annotate.spec.ts`
- Modify: `apps/client/src/components/ArticlePane.tsx` (replace)
- Test: `apps/client/src/article/markupRange.test.ts`, `apps/client/e2e/annotate.spec.ts`

**Interfaces:**
- Consumes: `trimRange`, `sentenceSpan`, `snapToBlocks`, `blockRanges`, `captureAnchor` and `TextRange` from core; `createMarkup`, `createSideNote`, `getArticle`, `listMarkups` and `MarkupView` from db; Task 10's schema and decorations.
- Produces:
  - `type ToolbarAction = 'term' | 'line' | 'paragraph' | 'note'`
  - `markupRange(action, article: { text; blocks; lang }, selection: { start; end }): TextRange | null`
  - `<ArticleView revisionId blocks markups activeMarkupId onSelection onMarkupClick onReady? />`, where:
    - `SelectionInfo = { start; end; rect: DOMRect }`
    - `ArticleViewHandle = { coordsAtOffset(offset): { top; bottom; left } | null }`
  - `<SelectionToolbar top left onAction />`, with test IDs `selection-toolbar` and `toolbar-<action>`
  - `ArticlePane` wiring: selection → toolbar → markup. `note` also creates an empty side note (Task 12 shows it).

- [ ] **Step 1: Write the failing unit test**

`apps/client/src/article/markupRange.test.ts`:
```ts
import type { Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { markupRange } from './markupRange';

// '他来了。她走了。' [0,8) · '\n\n' · '第二段  有空格。' [10,19)
const blocks: Block[] = [
  { k: 'p', runs: [{ t: '他来了。她走了。' }] },
  { k: 'p', runs: [{ t: '第二段  有空格。' }] },
];
const article = { text: '他来了。她走了。\n\n第二段  有空格。', blocks, lang: 'zh' };

describe('markupRange', () => {
  it('uses the trimmed selection for terms and notes', () => {
    expect(markupRange('term', article, { start: 8, end: 12 })).toEqual({ start: 10, end: 12 });
    expect(markupRange('note', article, { start: 12, end: 16 })).toEqual({ start: 12, end: 16 });
  });

  it('refuses whitespace-only selections (Review Focus 2)', () => {
    expect(markupRange('term', article, { start: 13, end: 15 })).toBeNull();
    expect(markupRange('paragraph', article, { start: 8, end: 10 })).toBeNull();
  });

  it('extends lines to whole sentences', () => {
    expect(markupRange('line', article, { start: 5, end: 6 })).toEqual({ start: 4, end: 8 });
  });

  it('snaps paragraphs to whole blocks', () => {
    expect(markupRange('paragraph', article, { start: 1, end: 2 })).toEqual({ start: 0, end: 8 });
    expect(markupRange('paragraph', article, { start: 6, end: 11 })).toEqual({ start: 0, end: 19 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/article/markupRange.test.ts`
Expected: FAIL with `Cannot find module './markupRange'`.

- [ ] **Step 3: Implement `markupRange`**

`apps/client/src/article/markupRange.ts`:
```ts
import { blockRanges, sentenceSpan, snapToBlocks, trimRange, type Block, type TextRange } from '@jot/core';

export type ToolbarAction = 'term' | 'line' | 'paragraph' | 'note';

/** The text range a toolbar action marks up, or null when the selection is only whitespace. */
export function markupRange(
  action: ToolbarAction,
  article: { text: string; blocks: Block[]; lang: string | null },
  selection: { start: number; end: number },
): TextRange | null {
  const base = trimRange(article.text, selection.start, selection.end);
  if (base.start === base.end) return null;
  switch (action) {
    case 'paragraph':
      return snapToBlocks(blockRanges(article.blocks), base.start, base.end);
    case 'line': {
      const sentences = sentenceSpan(article.text, base.start, base.end, article.lang === 'en' ? 'en' : 'zh');
      return trimRange(article.text, sentences.start, sentences.end);
    }
    default:
      return base;
  }
}
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/article/markupRange.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 4: Write the failing e2e test**

`apps/client/e2e/annotate.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

const TEXT = ['春风又绿江南岸，明月何时照我还。他用比喻写春天。', '她笑😀了。第二句在这里。', '第三段只有一句话。'].join('\n\n');

async function setup(page: Page, memory = true) {
  await openApp(page, { memory });
  await importText(page, '标注', TEXT);
}

test('marks a term, a line and a paragraph', async ({ page }) => {
  await setup(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-term').click();
  await expect(page.locator('.mk-term')).toHaveText('比喻');
  await selectText(page, '第二句');
  await page.getByTestId('toolbar-line').click();
  await expect(page.locator('.mk-line')).toHaveText('第二句在这里。');
  await selectText(page, '只有');
  await page.getByTestId('toolbar-paragraph').click();
  await expect(page.locator('.mk-paragraph')).toHaveText('第三段只有一句话。');
});

test('renders overlapping markups and emoji (Review Focus 3)', async ({ page }) => {
  await setup(page);
  await selectText(page, '春风又绿');
  await page.getByTestId('toolbar-term').click();
  await selectText(page, '绿江南');
  await page.getByTestId('toolbar-term').click();
  const overlap = page.locator('.mk-term').filter({ hasText: /^绿$/ });
  await expect(overlap).toHaveCount(1);
  expect(((await overlap.getAttribute('class')) ?? '').match(/mk-id-/g)).toHaveLength(2);
  await selectText(page, '😀');
  await page.getByTestId('toolbar-term').click();
  await expect(page.locator('.mk-term').filter({ hasText: '😀' })).toHaveText('😀');
});

test('ignores collapsed selections and ones that reach outside the article (Review Focus 2)', async ({ page }) => {
  await setup(page);
  await page.getByTestId('article-view').click();
  await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
  await page.evaluate(() => {
    const title = document.querySelector('[data-testid="library-list"] a')?.firstChild as Node;
    const view = document.querySelector('[data-testid="article-view"]') as Element;
    const text = document.createTreeWalker(view, NodeFilter.SHOW_TEXT).nextNode() as Node;
    const range = document.createRange();
    range.setStart(title, 0);
    range.setEnd(text, 3);
    const selection = window.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
    view.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
});

test('selects text with a real mouse drag in the read-only view (risk check M0.3)', async ({ page }) => {
  await setup(page);
  const box = await page.locator('[data-testid="article-view"] p').first().boundingBox();
  if (!box) throw new Error('paragraph not rendered');
  await page.mouse.move(box.x + 2, box.y + 17);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 17, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('selection-toolbar')).toBeVisible();
  await page.getByTestId('toolbar-term').click();
  await expect(page.locator('.mk-term')).toHaveCount(1);
  expect(((await page.locator('.mk-term').textContent()) ?? '').length).toBeGreaterThan(1);
});

test('keeps markups after a reload', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-term').click();
  await expect(page.locator('.mk-term')).toHaveText('比喻');
  await page.reload();
  await expect(page.locator('.mk-term')).toHaveText('比喻', { timeout: 30_000 });
});
```

Run (with `web` and `playwright` up): `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e annotate --project chromium`
Expected: FAIL because there is no `selection-toolbar` and no `.mk-*` elements yet.

- [ ] **Step 5: Implement the view, the toolbar and the pane**

`apps/client/src/components/ArticleView.tsx`:
```tsx
import type { Block } from '@jot/core';
import type { MarkupView } from '@jot/db';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useRef } from 'react';
import { buildDecorations, markupIdsAt } from '../article/decorations';
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

interface Props {
  revisionId: string;
  blocks: Block[];
  markups: MarkupView[];
  activeMarkupId: string | null;
  onSelection(selection: SelectionInfo | null): void;
  onMarkupClick(ids: string[], rect: DOMRect): void;
  onReady?(handle: ArticleViewHandle | null): void;
}

/** Canonical offsets of the DOM selection, or null when it is collapsed or reaches outside `root`. */
function readSelection(view: EditorView, root: HTMLElement): SelectionInfo | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const max = view.state.doc.content.size - 2;
  const clamp = (offset: number) => Math.max(0, Math.min(max, offset));
  const a = clamp(posToOffset(view.posAtDOM(range.startContainer, range.startOffset)));
  const b = clamp(posToOffset(view.posAtDOM(range.endContainer, range.endOffset)));
  if (a === b) return null;
  return { start: Math.min(a, b), end: Math.max(a, b), rect: range.getBoundingClientRect() };
}

/**
 * Read-only article rendered by ProseMirror (flat schema, pos = offset + 1). Markups are decorations,
 * so adding or removing one never rebuilds the document, the selection or the scroll position.
 * The selection is read from the DOM with posAtDOM, which does not depend on the view being editable.
 */
export function ArticleView(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { revisionId, markups, activeMarkupId } = props;

  // One view per revision (revisions are immutable).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { blocks, markups: initial, activeMarkupId: active, onReady } = latest.current;
    const doc = blocksToDoc(blocks);
    const decorations = buildDecorations(doc, initial, active);
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
    const decorations = buildDecorations(view.state.doc, markups, activeMarkupId);
    view.setProps({ decorations: () => decorations });
  }, [markups, activeMarkupId]);

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

`apps/client/src/components/SelectionToolbar.tsx`:
```tsx
import { useTranslation } from 'react-i18next';
import type { ToolbarAction } from '../article/markupRange';

const ACTIONS: ToolbarAction[] = ['term', 'line', 'paragraph', 'note'];

export function SelectionToolbar({ top, left, onAction }: { top: number; left: number; onAction(action: ToolbarAction): void }) {
  const { t } = useTranslation();
  // preventDefault on mousedown keeps the text selection while a button is pressed.
  return (
    <div className="toolbar" role="toolbar" style={{ top, left }} onMouseDown={(e) => e.preventDefault()} data-testid="selection-toolbar">
      {ACTIONS.map((action) => (
        <button key={action} type="button" onClick={() => onAction(action)} data-testid={`toolbar-${action}`}>
          {t(`toolbar.${action}`)}
        </button>
      ))}
    </div>
  );
}
```

Replace `apps/client/src/components/ArticlePane.tsx` with:
```tsx
import { captureAnchor } from '@jot/core';
import { createMarkup, createSideNote, getArticle, listMarkups } from '@jot/db';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { markupRange, type ToolbarAction } from '../article/markupRange';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { ArticleView, type SelectionInfo } from './ArticleView';
import { SelectionToolbar } from './SelectionToolbar';

export function ArticlePane({ articleId }: { articleId: string }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const article = useLibraryQuery((l) => getArticle(l, articleId), [articleId]);
  const markups = useLibraryQuery((l) => listMarkups(l, articleId), [articleId]);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [activeMarkupId, setActiveMarkupId] = useState<string | null>(null);

  const a = article.data;
  if (article.loading && !a) return <p className="empty">{t('article.loading')}</p>;
  if (!a) return <p className="empty">{t('article.missing')}</p>;

  const onAction = async (action: ToolbarAction) => {
    const sel = selection;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    if (!sel) return;
    const range = markupRange(action, a, sel);
    if (!range) return;
    const anchor = captureAnchor(a.text, range.start, range.end, action === 'paragraph' ? 'block' : 'range');
    const kind = action === 'note' ? 'term' : action;
    const { markupId } = await createMarkup(lib, { articleId, revisionId: a.revisionId, anchor, kind });
    setActiveMarkupId(markupId);
    if (action === 'note') await createSideNote(lib, { markupId, articleId, body: '' });
  };

  const box = layoutRef.current?.getBoundingClientRect();
  const toolbarAt = selection && box ? { top: selection.rect.top - box.top - 6, left: Math.max(0, selection.rect.left - box.left) } : null;

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
          onSelection={setSelection}
          onMarkupClick={(ids) => setActiveMarkupId(ids[0] ?? null)}
        />
      </article>
      <div className="margin" data-testid="margin" />
      {toolbarAt && <SelectionToolbar top={toolbarAt.top} left={toolbarAt.left} onAction={(k) => void onAction(k)} />}
    </div>
  );
}
```

- [ ] **Step 6: Run the e2e on both browsers, plus the import e2e for regressions**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e annotate import`
Expected:
- annotate: chromium 5 passed; webkit 4 passed and 1 skipped
- import: the same results as in Task 9. The long-article test must still pass within its 5 s budget, now with ProseMirror rendering.

**If the overlap test finds two nested spans instead of one merged span:** ProseMirror version differences can cause this. Keep the behaviour check but assert on the innermost `.mk-term` containing `绿`, and ledger a ruling. `markupIdsAt` already walks ancestors, so clicking works either way.

**If the real-mouse test fails in WebKit:** this is risk check M0.3's finding. Record it, and switch `readSelection` to read the selection on `selectionchange`. Do not weaken the test.

- [ ] **Step 7: Unit tests, type check, lint and commit**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

```bash
git add apps/client
git commit -m "feat(client): read-only ProseMirror article view with term, line and paragraph markups"
```

---

### Task 12: Side notes in the margin

**Files:**
- Create: `apps/client/src/article/margin.ts`, `apps/client/src/components/Margin.tsx`, `apps/client/e2e/notes.spec.ts`
- Modify: `apps/client/src/components/ArticlePane.tsx` (replace)
- Test: `apps/client/src/article/margin.test.ts`, `apps/client/e2e/notes.spec.ts`

**Interfaces:**
- Consumes: `listSideNotes`, `updateSideNote`, `deleteSideNote`, `createSideNote`, `SideNoteView` and `MarkupView`; `ArticleViewHandle` (Task 11).
- Produces:
  - `layoutMargin(items: { id; top; height }[], gap = 8): Map<string, number>`
  - `<Margin notes markups handle focusNoteId onFocusHandled onActivate />`
  - Test ID `side-note` (one per card). Each card contains a `textarea` and a delete button (`note-delete`).
  - A note is saved on blur, and deleted on blur when it is empty.

- [ ] **Step 1: Write the failing unit test**

`apps/client/src/article/margin.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { layoutMargin } from './margin';

describe('layoutMargin', () => {
  it('keeps cards at their anchors when they fit', () => {
    expect(layoutMargin([{ id: 'a', top: 0, height: 40 }, { id: 'b', top: 100, height: 40 }])).toEqual(
      new Map([['a', 0], ['b', 100]]),
    );
  });

  it('pushes overlapping cards down in anchor order, keeping a gap', () => {
    expect(layoutMargin([{ id: 'b', top: 10, height: 30 }, { id: 'a', top: 0, height: 40 }], 8)).toEqual(
      new Map([['a', 0], ['b', 48]]),
    );
  });

  it('breaks ties by id so the order is stable', () => {
    expect([...layoutMargin([{ id: 'y', top: 5, height: 10 }, { id: 'x', top: 5, height: 10 }], 0)]).toEqual([
      ['x', 5],
      ['y', 15],
    ]);
  });
});
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/article/margin.test.ts`
Expected: FAIL with `Cannot find module './margin'`.

- [ ] **Step 2: Implement `layoutMargin`**

`apps/client/src/article/margin.ts`:
```ts
export interface MarginItem {
  id: string;
  top: number;
  height: number;
}

/** Places each card at its anchor's height, pushing later cards down so none overlap. */
export function layoutMargin(items: readonly MarginItem[], gap = 8): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.top - b.top || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const tops = new Map<string, number>();
  let floor = -Infinity;
  for (const item of sorted) {
    const top = Math.max(item.top, floor);
    tops.set(item.id, top);
    floor = top + item.height + gap;
  }
  return tops;
}
```

Run: `docker compose run --rm -T -e NO_COLOR=1 dev pnpm vitest run apps/client/src/article/margin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Write the failing e2e test**

`apps/client/e2e/notes.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

const TEXT = ['春风又绿江南岸，明月何时照我还。他用比喻写春天。', '第二段。'].join('\n\n');

async function setup(page: Page, memory = true) {
  await openApp(page, { memory });
  await importText(page, '旁注', TEXT);
}

async function addNote(page: Page, needle: string, body: string) {
  await selectText(page, needle);
  await page.getByTestId('toolbar-note').click();
  const area = page.getByTestId('side-note').last().locator('textarea');
  await expect(area).toBeFocused();
  await area.fill(body);
  await page.getByTestId('article-title').click();
}

test('adds a side note beside its markup and saves it on blur', async ({ page }) => {
  await setup(page);
  await addNote(page, '比喻', '以春喻人');
  const note = page.getByTestId('side-note');
  await expect(note).toHaveCount(1);
  await expect(note.locator('textarea')).toHaveValue('以春喻人');
  const markupBox = await page.locator('.mk-term').boundingBox();
  const noteBox = await note.boundingBox();
  expect(Math.abs((noteBox?.y ?? 0) - (markupBox?.y ?? 0))).toBeLessThan(40);
});

test('removes a note left empty but keeps its markup', async ({ page }) => {
  await setup(page);
  await selectText(page, '比喻');
  await page.getByTestId('toolbar-note').click();
  await expect(page.getByTestId('side-note').locator('textarea')).toBeFocused();
  await page.getByTestId('article-title').click();
  await expect(page.getByTestId('side-note')).toHaveCount(0);
  await expect(page.locator('.mk-term')).toHaveCount(1);
});

test('stacks notes on the same line without overlapping', async ({ page }) => {
  await setup(page);
  await addNote(page, '春风', '第一条');
  await addNote(page, '明月', '第二条');
  const boxes = await page
    .getByTestId('side-note')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom })));
  boxes.sort((a, b) => a.top - b.top);
  expect(boxes).toHaveLength(2);
  expect(boxes[1].top).toBeGreaterThanOrEqual(boxes[0].bottom);
});

test('keeps notes after a reload', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'persistence needs OPFS, which Playwright WebKit lacks');
  await setup(page, false);
  await addNote(page, '比喻', '留下来');
  await expect(page.getByTestId('side-note').locator('textarea')).toHaveValue('留下来');
  await page.reload();
  await expect(page.getByTestId('side-note').locator('textarea')).toHaveValue('留下来', { timeout: 30_000 });
});
```

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e notes --project chromium`
Expected: FAIL because no `side-note` element appears.

- [ ] **Step 4: Implement the margin and wire it into the pane**

`apps/client/src/components/Margin.tsx`:
```tsx
import { deleteSideNote, updateSideNote, type MarkupView, type SideNoteView } from '@jot/db';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { layoutMargin } from '../article/margin';
import { useLibrary } from '../data/LibraryContext';
import type { ArticleViewHandle } from './ArticleView';

interface MarginProps {
  notes: SideNoteView[];
  markups: MarkupView[];
  handle: ArticleViewHandle | null;
  focusNoteId: string | null;
  onFocusHandled(): void;
  onActivate(markupId: string | null): void;
}

const sameTops = (a: Map<string, number>, b: Map<string, number>) =>
  a.size === b.size && [...a].every(([id, top]) => b.get(id) === top);

/** Side notes beside their markups: each card starts at its anchor's line and is pushed down to avoid overlap. */
export function Margin({ notes, markups, handle, focusNoteId, onFocusHandled, onActivate }: MarginProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [tops, setTops] = useState<Map<string, number>>(new Map());
  const [version, setVersion] = useState(0);
  const relayout = () => setVersion((v) => v + 1);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !handle) return;
    const base = root.getBoundingClientRect().top;
    const byId = new Map(markups.map((m) => [m.id, m] as const));
    const items = notes.flatMap((note) => {
      const markup = byId.get(note.markupId);
      const coords = markup && markup.status !== 'orphan' ? handle.coordsAtOffset(markup.start) : null;
      const card = cards.current.get(note.id);
      return coords && card ? [{ id: note.id, top: coords.top - base, height: card.offsetHeight }] : [];
    });
    const next = layoutMargin(items);
    setTops((prev) => (sameTops(prev, next) ? prev : next));
  }, [notes, markups, handle, version]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Reflow of the article (window resize, fonts) moves the anchors.
    const observer = new ResizeObserver(() => setVersion((v) => v + 1));
    observer.observe(root.parentElement ?? root);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="margin" ref={rootRef} data-testid="margin">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          top={tops.get(note.id)}
          autoFocus={note.id === focusNoteId}
          register={(el) => {
            if (el) cards.current.set(note.id, el);
            else cards.current.delete(note.id);
          }}
          onFocusHandled={onFocusHandled}
          onResize={relayout}
          onActivate={onActivate}
        />
      ))}
    </div>
  );
}

interface NoteCardProps {
  note: SideNoteView;
  top: number | undefined;
  autoFocus: boolean;
  register(el: HTMLElement | null): void;
  onFocusHandled(): void;
  onResize(): void;
  onActivate(markupId: string | null): void;
}

function NoteCard({ note, top, autoFocus, register, onFocusHandled, onResize, onActivate }: NoteCardProps) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [body, setBody] = useState(note.body);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBody(note.body);
  }, [note.body]);

  // Focus a freshly created note once it has been positioned (hidden elements cannot take focus).
  useEffect(() => {
    if (autoFocus && top !== undefined) {
      areaRef.current?.focus();
      onFocusHandled();
    }
  }, [autoFocus, top, onFocusHandled]);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight}px`;
    onResize();
  }, [body]);

  const save = async () => {
    onActivate(null);
    if (body.trim() === '') await deleteSideNote(lib, note.id);
    else if (body !== note.body) await updateSideNote(lib, note.id, body);
  };

  return (
    <div className="note" ref={register} style={{ top: top ?? 0, visibility: top === undefined ? 'hidden' : 'visible' }} data-testid="side-note">
      <textarea
        ref={areaRef}
        value={body}
        rows={1}
        placeholder={t('notes.placeholder')}
        aria-label={t('notes.placeholder')}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => onActivate(note.markupId)}
        onBlur={() => void save()}
      />
      <footer>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void deleteSideNote(lib, note.id)} data-testid="note-delete">
          {t('notes.delete')}
        </button>
      </footer>
    </div>
  );
}
```

Replace `apps/client/src/components/ArticlePane.tsx` with:
```tsx
import { captureAnchor } from '@jot/core';
import { createMarkup, createSideNote, getArticle, listMarkups, listSideNotes } from '@jot/db';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { markupRange, type ToolbarAction } from '../article/markupRange';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { ArticleView, type ArticleViewHandle, type SelectionInfo } from './ArticleView';
import { Margin } from './Margin';
import { SelectionToolbar } from './SelectionToolbar';

export function ArticlePane({ articleId }: { articleId: string }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const article = useLibraryQuery((l) => getArticle(l, articleId), [articleId]);
  const markups = useLibraryQuery((l) => listMarkups(l, articleId), [articleId]);
  const notes = useLibraryQuery((l) => listSideNotes(l, articleId), [articleId]);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [activeMarkupId, setActiveMarkupId] = useState<string | null>(null);
  const [handle, setHandle] = useState<ArticleViewHandle | null>(null);
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const clearFocus = useCallback(() => setFocusNoteId(null), []);

  const a = article.data;
  if (article.loading && !a) return <p className="empty">{t('article.loading')}</p>;
  if (!a) return <p className="empty">{t('article.missing')}</p>;

  const onAction = async (action: ToolbarAction) => {
    const sel = selection;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    if (!sel) return;
    const range = markupRange(action, a, sel);
    if (!range) return;
    const anchor = captureAnchor(a.text, range.start, range.end, action === 'paragraph' ? 'block' : 'range');
    const kind = action === 'note' ? 'term' : action;
    const { markupId } = await createMarkup(lib, { articleId, revisionId: a.revisionId, anchor, kind });
    setActiveMarkupId(markupId);
    if (action === 'note') setFocusNoteId(await createSideNote(lib, { markupId, articleId, body: '' }));
  };

  const box = layoutRef.current?.getBoundingClientRect();
  const toolbarAt = selection && box ? { top: selection.rect.top - box.top - 6, left: Math.max(0, selection.rect.left - box.left) } : null;

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
          onSelection={setSelection}
          onMarkupClick={(ids) => setActiveMarkupId(ids[0] ?? null)}
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
      />
      {toolbarAt && <SelectionToolbar top={toolbarAt.top} left={toolbarAt.left} onAction={(k) => void onAction(k)} />}
    </div>
  );
}
```

- [ ] **Step 5: Run the notes and annotate e2e on both browsers**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e notes annotate`
Expected:
- notes: chromium 4 passed; webkit 3 passed and 1 skipped
- annotate: unchanged from Task 11

- [ ] **Step 6: Unit tests, type check, lint and commit**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

```bash
git add apps/client
git commit -m "feat(client): side notes laid out beside their markups in the margin"
```

---

### Task 13: Markup popover: remove a markup or add a note

**Files:**
- Create: `apps/client/src/components/MarkupPopover.tsx`, `apps/client/e2e/popover.spec.ts`
- Modify: `apps/client/src/components/ArticlePane.tsx` (replace)
- Test: `apps/client/e2e/popover.spec.ts`

**Interfaces:**
- Consumes: `deleteMarkup`, `createSideNote` and `MarkupView`; `onMarkupClick(ids, rect)` (Task 11).
- Produces:
  - `<MarkupPopover markups top left onClose onRemove onAddNote />`
  - Test IDs: `markup-popover`, `popover-item`, `popover-remove`, `popover-add-note`
  - Clicking a highlight opens the popover, with one item per markup under the click. Clicking plain text, starting a new selection, or pressing Escape closes it.

- [ ] **Step 1: Write the failing e2e test**

`apps/client/e2e/popover.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importText, openApp, selectText } from './helpers';

async function setup(page: Page) {
  await openApp(page);
  await importText(page, '弹窗', '春风又绿江南岸，明月何时照我还。他用比喻写春天。');
}

async function term(page: Page, needle: string) {
  await selectText(page, needle);
  await page.getByTestId('toolbar-term').click();
}

test('removes a markup from its popover', async ({ page }) => {
  await setup(page);
  await term(page, '比喻');
  await page.locator('.mk-term').click();
  await expect(page.getByTestId('popover-item')).toHaveCount(1);
  await page.getByTestId('popover-remove').click();
  await expect(page.locator('.mk-term')).toHaveCount(0);
  await expect(page.getByTestId('markup-popover')).toHaveCount(0);
});

test('offers every markup under an overlapping click (Review Focus 3)', async ({ page }) => {
  await setup(page);
  await term(page, '春风又绿');
  await term(page, '绿江南');
  await page.locator('.mk-term').filter({ hasText: /^绿$/ }).click();
  await expect(page.getByTestId('popover-item')).toHaveCount(2);
});

test('adds a side note from the popover', async ({ page }) => {
  await setup(page);
  await term(page, '比喻');
  await page.locator('.mk-term').click();
  await page.getByTestId('popover-add-note').click();
  await expect(page.getByTestId('side-note').locator('textarea')).toBeFocused();
});

test('closes on Escape and on a click in plain text', async ({ page }) => {
  await setup(page);
  await term(page, '比喻');
  await page.locator('.mk-term').click();
  await expect(page.getByTestId('markup-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('markup-popover')).toHaveCount(0);
  await page.locator('.mk-term').click();
  await expect(page.getByTestId('markup-popover')).toBeVisible();
  await page.getByTestId('article-title').click();
  await page.locator('[data-testid="article-view"] p').click({ position: { x: 4, y: 10 } });
  await expect(page.getByTestId('markup-popover')).toHaveCount(0);
});
```

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e popover --project chromium`
Expected: FAIL because no `popover-item` appears.

- [ ] **Step 2: Implement**

`apps/client/src/components/MarkupPopover.tsx`:
```tsx
import type { MarkupView } from '@jot/db';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const excerpt = (text: string) => {
  const chars = [...text];
  return chars.length > 24 ? `${chars.slice(0, 24).join('')}…` : text;
};

interface Props {
  markups: MarkupView[];
  top: number;
  left: number;
  onClose(): void;
  onRemove(markup: MarkupView): void;
  onAddNote(markup: MarkupView): void;
}

export function MarkupPopover({ markups, top, left, onClose, onRemove, onAddNote }: Props) {
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
            <span className="muted">{t(`markup.kinds.${m.kind}`)}</span>
            <span className="excerpt">{excerpt(m.exact)}</span>
            <div className="actions">
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

Replace `apps/client/src/components/ArticlePane.tsx` with:
```tsx
import { captureAnchor } from '@jot/core';
import { createMarkup, createSideNote, deleteMarkup, getArticle, listMarkups, listSideNotes, type MarkupView } from '@jot/db';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { markupRange, type ToolbarAction } from '../article/markupRange';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
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
  const article = useLibraryQuery((l) => getArticle(l, articleId), [articleId]);
  const markups = useLibraryQuery((l) => listMarkups(l, articleId), [articleId]);
  const notes = useLibraryQuery((l) => listSideNotes(l, articleId), [articleId]);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [activeMarkupId, setActiveMarkupId] = useState<string | null>(null);
  const [handle, setHandle] = useState<ArticleViewHandle | null>(null);
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const clearFocus = useCallback(() => setFocusNoteId(null), []);
  const closePopover = useCallback(() => setPopover(null), []);

  const a = article.data;
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
    const range = markupRange(action, a, sel);
    if (!range) return;
    const anchor = captureAnchor(a.text, range.start, range.end, action === 'paragraph' ? 'block' : 'range');
    const kind = action === 'note' ? 'term' : action;
    const { markupId } = await createMarkup(lib, { articleId, revisionId: a.revisionId, anchor, kind });
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
      />
      {toolbarAt && <SelectionToolbar top={toolbarAt.top} left={toolbarAt.left} onAction={(k) => void onAction(k)} />}
      {popoverAt && popoverMarkups.length > 0 && (
        <MarkupPopover
          markups={popoverMarkups}
          top={popoverAt.top}
          left={popoverAt.left}
          onClose={closePopover}
          onRemove={(m) => {
            setPopover(null);
            setActiveMarkupId(null);
            void deleteMarkup(lib, m.id);
          }}
          onAddNote={(m) => {
            setPopover(null);
            void addNote(m.id);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run the popover, notes and annotate e2e on both browsers**

Run: `docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e popover notes annotate`
Expected:
- popover: 4 passed on each browser
- notes and annotate: unchanged from Tasks 11–12

- [ ] **Step 4: Unit tests, type check, lint and commit**

Run: `docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm test && pnpm typecheck && pnpm lint'`
Expected: every test passes, with no type or lint errors.

```bash
git add apps/client
git commit -m "feat(client): markup popover to remove markups or add side notes"
```

---

### Task 14: Desktop: Content-Security-Policy and a verified production build

**Files:**
- Create: `apps/desktop/scripts/screenshot.mjs`
- Modify: `apps/desktop/src-tauri/tauri.conf.json` (`app.security`), `.gitignore`
- Test: manual check through WSLg using the screenshot script, of both the dev run and the production build

**Interfaces:**
- Consumes: the `desktop` compose service with the WSLg override (plan 1 Task 1 ruling: `X11_SOCKET_DIR`).
- Produces:
  - a strict production CSP, and a separate dev-only CSP (`devCsp`) that allows Vite's HMR
  - `node apps/desktop/scripts/screenshot.mjs "<window title>" <out.png>` (run inside the `desktop` container)

- [ ] **Step 1: Add the screenshot script**

`apps/desktop/scripts/screenshot.mjs`:
```js
// Captures one window of the desktop container's X display as a PNG, so the Tauri app can be
// checked from Docker. Usage (inside the desktop container): node apps/desktop/scripts/screenshot.mjs "Jot" out.png
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const [title = 'Jot', out = '.screenshots/window.png'] = process.argv.slice(2);
const xwd = execFileSync('xwd', ['-name', title, '-silent'], { maxBuffer: 256 * 1024 * 1024 });
const field = (i) => xwd.readUInt32BE(i * 4);
const headerSize = field(0);
const [width, height, byteOrder, bitsPerPixel, bytesPerLine, colors] = [field(4), field(5), field(7), field(11), field(12), field(19)];
const pixels = headerSize + colors * 12;

const rows = [];
for (let y = 0; y < height; y++) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    const at = pixels + y * bytesPerLine + x * (bitsPerPixel / 8);
    const px = byteOrder === 0 ? xwd.readUInt32LE(at) : xwd.readUInt32BE(at);
    row[1 + x * 3] = (px >> 16) & 255;
    row[2 + x * 3] = (px >> 8) & 255;
    row[3 + x * 3] = px & 255;
  }
  rows.push(row);
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 2; // RGB
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
console.log(`${out} ${width}x${height}`);
```

Append to `.gitignore`:
```
.screenshots/
```

- [ ] **Step 2: Set the CSPs**

In `apps/desktop/src-tauri/tauri.conf.json`, replace `"security": { "csp": null }` with:
```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; worker-src 'self' blob:; object-src 'none'; base-uri 'none'",
  "devCsp": "default-src 'self' http://localhost:5173 ws://localhost:5173; script-src 'self' 'unsafe-inline' http://localhost:5173; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost http://localhost:5173 ws://localhost:5173; worker-src 'self' blob:; object-src 'none'"
}
```

- [ ] **Step 3: Check the dev run through WSLg**

Run: `docker compose up -d desktop`, then wait until `docker compose logs desktop` shows `Running /cargo-target/debug/jot-desktop`.
Run: `docker compose exec -T -u node desktop node apps/desktop/scripts/screenshot.mjs Jot .screenshots/desktop-dev.png`
Expected: `.screenshots/desktop-dev.png` shows the shell (library sidebar, "Choose an article…" or 从文库中选择, and the memo column) with no "Storage is unavailable" message. Open the PNG to check.
Then: `docker compose stop desktop`

- [ ] **Step 4: Check the production build (CSP enforced, assets embedded)**

Run:
```bash
docker compose run --rm desktop sh -c '
  pnpm --filter @jot/desktop tauri build --debug --no-bundle &&
  (timeout 20 dbus-run-session -- /cargo-target/debug/jot-desktop & sleep 12;
   node apps/desktop/scripts/screenshot.mjs Jot .screenshots/desktop-prod.png; wait)'
```
Expected: the build succeeds, and `.screenshots/desktop-prod.png` shows the same shell. Library UI rendered through IPC under the strict CSP proves that the CSP allows the app's own scripts and `ipc:`. A blank window, or "Storage is unavailable", means the CSP is blocking something: widen only the directive the failing resource needs, and ledger it.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop .gitignore
git commit -m "feat(desktop): strict production CSP, dev CSP for Vite, and a WSLg screenshot script"
```

---

### Task 15: CI and README

**Files:**
- Modify: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: every e2e spec (diagnostics, shell, import, annotate, notes, popover).
- Produces: CI that runs the full e2e suite on Chromium and WebKit (WebKit uses `?storage=memory`), and a README that describes the reader.

- [ ] **Step 1: Update CI**

In `.github/workflows/ci.yml`, rename the step `End-to-end (Chromium; WebKit skipped, no OPFS in Playwright WebKit)` to:
```yaml
      - name: End-to-end (Chromium with OPFS; WebKit with in-memory storage)
```
The command is unchanged; it already runs every spec.

- [ ] **Step 2: Update the README**

In `README.md`, replace the first paragraph (the two lines under `# Jot`) with:
```markdown
A library for writers who study model articles. Import an article (paste, `.txt`, `.md`), read it in a
calm two-column layout, mark up terms, lines and paragraphs, and keep side notes beside them in the margin.
Interface in 简体中文 and English. Desktop (Windows, macOS) and web.
```

In the `### Notes` list, add:
```markdown
- `?storage=memory` (dev server only) opens a throwaway in-memory library; the WebKit e2e project uses it.
- Check the desktop app from Docker: `docker compose exec -u node desktop node apps/desktop/scripts/screenshot.mjs Jot .screenshots/jot.png`.
```

- [ ] **Step 3: Run the complete verification**

Run:
```bash
docker compose run --rm -T -e NO_COLOR=1 dev sh -c 'pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test'
docker compose run --rm -T dev sh -c 'pnpm --filter @jot/client build && cd apps/desktop/src-tauri && cargo test'
docker compose up -d web && docker compose --profile e2e up -d playwright
docker compose exec -T -u node -e PW_WS=ws://localhost:3000/ web pnpm --filter @jot/client e2e
```
Expected: every command exits 0. The e2e summary shows no failures; the only skips are the WebKit OPFS and synthetic-paste tests.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "docs: describe the reader and dev storage flag; CI runs the full e2e suite"
```

---

## Done when

- A writer can, in the browser (`docker compose up web`) and in the desktop window:
  - import a Chinese article,
  - mark up a term, a line and a paragraph,
  - add side notes that sit beside their markups,
  - remove a markup,
  - reload and find everything still there.
- `pnpm typecheck && pnpm lint && pnpm test` and `cargo test` pass, and the e2e suite passes on Chromium and WebKit.
- The desktop production build runs under the strict CSP, shown by the Task 14 screenshots.
