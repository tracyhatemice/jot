# Jot — Core App (Sub-project 1) Design

- **Status:** Draft for review
- **Date:** 2026-09-27
- **Scope:** The overall architecture of Jot, plus the detailed design of sub-project 1 (a local-first core app for desktop and web)

## 1. Purpose

Jot is a library for writers who learn by studying **model articles**, the exemplary texts they want to learn from. It is benchmarked against Obsidian and Logseq. A writer:

- imports model articles into a personal library,
- **marks up** terms, lines (sentences) and paragraphs in them, and attaches **side notes**,
- writes an **analysis memo** in a column beside the article, with **anchors** that jump to a markup, a side note, or any position in any article,
- creates **tags**, arranges them into tiers, and tags articles, markups, side notes and memos,
- **searches** the library by keyword, tag and item type.

Jot targets Windows, macOS and the web. It is built with TypeScript, React and Tauri 2.

### Success criteria for sub-project 1
- A writer can do the whole loop, on both the web build and the desktop build, fully offline:
  1. Import a Chinese or English article.
  2. Mark it up and annotate it.
  3. Link to those annotations from a memo.
  4. Tag everything.
  5. Find items again by keyword and tag.
- Search finds 1- and 2-character Chinese queries.
- Markups survive a fix-up edit of the article text, or are clearly flagged as orphaned.
- The data model and write path are ready for sync, so sub-project 2 adds a server without migrating existing data.

## 2. Decisions (agreed with the product owner)

| Topic | Decision |
|---|---|
| Web version | A hosted service with accounts. Each user's library syncs across their devices (sub-project 2). |
| Offline | Offline-first. Every device holds a full local copy, works without a connection, and syncs later. |
| Users | A public product. Libraries are private. No sharing or real-time collaboration between users. |
| Import (v1) | Paste, `.txt` and `.md`. `.docx` is deferred (decided with the product owner when plan 5 was reviewed). No URL clipping, PDF or EPUB. |
| Content language | Chinese and English. Search must match 1- and 2-character Chinese queries. |
| UI language | Simplified Chinese and English, switchable, with the translation setup in place from the first commit. |
| Article text | Read-only by default, with an explicit **fix-up edit** mode for typos and import errors. After an edit, markups reattach by matching their quoted text. Any that can't be matched are flagged as **orphaned**. |
| Memos | Notes that can cite any article. An article can have many memos. A memo can anchor into several articles. **Backlinks** show which memos cite a passage. |
| Tag targets | Articles, markups, side notes and memos. |
| Tag tiers | A **graph where a tag can have several parents**. Cycles are prevented. Searching a tag also finds everything under its child tags. |
| Tag inheritance in search | A toggle, **off by default**: "include items inside tagged articles". |
| Markups | **Underline, bold or highlight** any selection of any length: part of a sentence, several sentences, or across paragraphs. A markup covers exactly the selected text, trimmed of whitespace. Styles stack when markups overlap. (Revised with the user after plan 2. Term, line and paragraph markups saved earlier display as highlight, underline and highlight.) |
| Storage and sync | Local SQLite on every client, plus our own TypeScript sync server on Postgres (sub-project 2). Structured records use per-field latest-edit-wins, with edits ordered by a hybrid logical clock (HLC), a timestamp that stays consistent across devices. Memo bodies use Yjs, a merge-friendly format for rich text. |
| UI framework | React. The read-only article column uses ProseMirror directly, with a flat textblock schema. The memo column uses TipTap v3, which is built on ProseMirror. (Revised in plan 2.) |
| Dev environment | Docker for all toolchains and services. Nothing is installed on the host, and host Node 18 stays untouched. |

## 3. Roadmap

Each sub-project goes through its own spec, then implementation plan, then build.

1. **Core app, local-only (this spec).** Desktop and web builds with every feature: reading, markups, side notes, memos, anchors, tags, search, import, and export or backup. The data model is ready for sync (an outbox of changes, HLC values, soft deletes), but there is no server.
2. **Accounts + sync.**
   - Node 24, Hono and Postgres.
   - Better Auth: first-party cookies on the web; on desktop, a bearer token stored in the OS keychain through the Rust `keyring` crate.
   - Push/pull endpoints over a change log that the server orders per user.
   - Compaction of memo change history on the server.
   - A sync client that reuses the `applyOp` function from sub-project 1.
3. **Release hardening.** Web hosting as an installable offline web app (PWA), Windows code signing, macOS notarization, auto-update, account deletion and data export.

## 4. Architecture

### 4.1 Repository layout (pnpm workspaces)

| Path | Responsibility | Depends on |
|---|---|---|
| `packages/core` | Pure TypeScript domain logic with no I/O: IDs (UUIDv7), HLC, anchoring, Chinese search normalizer and query builder, tag-graph logic, op types, the article block model | nothing (small libraries only) |
| `packages/db` | SQLite schema and migrations, the `SqlDriver` interface, repositories, `applyOp`, search indexing, and a driver test suite that every driver must pass | `core` |
| `packages/driver-web` | A `SqlDriver` backed by `@sqlite.org/sqlite-wasm` with the `opfs-sahpool` storage backend, running in a Web Worker | `db` (interface only) |
| `apps/client` | The React + Vite UI shared by the web and desktop builds. Platform services (SQL driver, file I/O, export target) are injected at startup | `core`, `db` |
| `apps/desktop` | The Tauri 2 shell. Hosts `apps/client` and provides a native `SqlDriver` through custom `rusqlite` commands | `client` |
| `apps/server` | Placeholder. Built in sub-project 2 | — |

### 4.2 The `SqlDriver` interface

```ts
interface SqlDriver {
  query<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  batch(stmts: { sql: string; params?: SqlValue[] }[]): Promise<void>; // one transaction
}
```

- Every driver runs over a message boundary: Tauri's bridge to Rust on desktop, a worker message on the web. So the interface has **no interactive transactions**.
- A batch always runs as a single transaction.
- Anything that must read and then write (for example the tag cycle check) is serialized with an async lock in TypeScript.

**Drivers**

- **Desktop (`apps/desktop/src-tauri/src/db.rs`).** Custom `async` Tauri commands `db_query` and `db_batch` over `rusqlite` with `features = ["bundled"]`. The bundled SQLite includes FTS5.
  - One writer connection behind a `Mutex`.
  - `PRAGMA journal_mode=WAL`, `busy_timeout`, and `foreign_keys` set explicitly.
  - `db_batch` wraps its statements in `BEGIN IMMEDIATE … COMMIT`.
  - BLOBs cross the bridge as base64.
  - `tauri-plugin-sql` is **not** used: it doesn't support transactions ([plugins-workspace#886](https://github.com/tauri-apps/plugins-workspace/issues/886)). Its SQLite library would also clash with `rusqlite`'s.
- **Web (`packages/driver-web`).** sqlite-wasm in a dedicated worker with the `opfs-sahpool` storage backend.
  - It needs no COOP/COEP headers, so hosting stays plain static files.
  - Only one tab can hold the database. A lock through `navigator.locks` detects a second tab, which shows "Jot is open in another tab".
  - The app calls `navigator.storage.persist()` so the browser is less likely to evict the data.
  - Vite needs `optimizeDeps.exclude` for the package.
- **Tests (Node).** `node:sqlite`, which is built with FTS5 in the official Node builds, and sqlite-wasm running in Node, in memory. Both run the shared driver test suite.

The desktop build deliberately does **not** reuse sqlite-wasm/OPFS inside the webview:
- OPFS inside WKWebView and WebKitGTK is unverified.
- Webview storage can be evicted.
- A native `.sqlite` file can be backed up by the user.

### 4.3 Write path

Every change the user makes becomes an **op** (for example `{v:1, table:'markup', id, fields:{…}, hlc}`). `applyOp(op)` builds one `batch`:

1. It upserts the row with per-field latest-edit-wins: the conditional upsert updates a field only when the incoming HLC for that field is newer than the one stored in `fhlc`.
2. It appends the op to `outbox`.
3. It updates the local-only derived tables: search index, anchor positions, memo links.

Sub-project 2 sends remote ops through the same `applyOp`, without step 2.

## 5. Data model

### 5.1 Conventions
- Every **synced** table has:
  - `id TEXT PRIMARY KEY` (UUIDv7, or a deterministic ID where noted)
  - `hlc TEXT` (the newest HLC on the row)
  - `fhlc TEXT` (JSON: the HLC for each field)
  - `deleted INTEGER` (a soft-delete flag that also follows latest-edit-wins): `0` live, `1` deleted (in the Trash, §6.9), `2` erased
- HLC format: fixed-width `ms-counter-deviceId`, so comparing the strings orders them correctly.
- **Synced tables have no foreign keys.** Rows can arrive out of order, and deletes are soft.
- **All text offsets are UTF-16 code units**, the same unit ProseMirror uses. They are computed only in TypeScript, never with SQL `substr` or `length`.
- Relationship rows use **deterministic IDs**, so if two devices create the same relationship, the rows merge.
- Migrations are ordered `.sql` files applied through `PRAGMA user_version`, shared by all drivers.
- At startup every driver checks that `sqlite_version()` is ≥ 3.43, which contentless-delete FTS5 tables need.

### 5.2 Schema

```sql
-- ===== Synced =====
CREATE TABLE article(
  id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, source TEXT, lang TEXT,
  import_kind TEXT NOT NULL,                 -- paste|txt|md|docx
  current_revision_id TEXT NOT NULL,         -- latest edit wins
  created_at INTEGER NOT NULL,
  hlc TEXT NOT NULL, fhlc TEXT NOT NULL DEFAULT '{}', deleted INTEGER NOT NULL DEFAULT 0);

CREATE TABLE article_revision(               -- immutable once written
  id TEXT PRIMARY KEY, article_id TEXT NOT NULL, parent_id TEXT,
  blocks TEXT NOT NULL,   -- JSON: [{k:'p'|'h1'|'h2'|'h3'|'quote'|'li', runs:[{t, b?, i?}]}], flat
  text TEXT NOT NULL,     -- normalized to NFC; blocks joined by "\n\n"; no list markers
  created_at INTEGER NOT NULL, hlc TEXT NOT NULL);

CREATE TABLE anchor(                          -- never changes after creation
  id TEXT PRIMARY KEY, article_id TEXT NOT NULL, revision_id TEXT NOT NULL,
  start INTEGER NOT NULL, "end" INTEGER NOT NULL,
  exact TEXT NOT NULL, prefix TEXT NOT NULL, suffix TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'range' CHECK(unit IN ('range','block')),
  created_at INTEGER NOT NULL, hlc TEXT NOT NULL, fhlc TEXT NOT NULL DEFAULT '{}', deleted INTEGER NOT NULL DEFAULT 0);

CREATE TABLE markup(
  id TEXT PRIMARY KEY, article_id TEXT NOT NULL, anchor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('term','line','paragraph')),
  style TEXT NOT NULL DEFAULT 'default',   -- 'underline' | 'bold' | 'highlight'; 'default' only on markups saved before styles
  created_at INTEGER NOT NULL, hlc TEXT NOT NULL, fhlc TEXT NOT NULL DEFAULT '{}', deleted INTEGER NOT NULL DEFAULT 0);

CREATE TABLE side_note(
  id TEXT PRIMARY KEY, markup_id TEXT NOT NULL, article_id TEXT NOT NULL,
  body TEXT NOT NULL,                        -- plain text in v1
  sort_key TEXT NOT NULL,                    -- sortable string; a new note can sit between two others without renumbering
  created_at INTEGER NOT NULL, hlc TEXT NOT NULL, fhlc TEXT NOT NULL DEFAULT '{}', deleted INTEGER NOT NULL DEFAULT 0);

CREATE TABLE memo(
  id TEXT PRIMARY KEY, title TEXT NOT NULL, home_article_id TEXT,
  created_at INTEGER NOT NULL, hlc TEXT NOT NULL, fhlc TEXT NOT NULL DEFAULT '{}', deleted INTEGER NOT NULL DEFAULT 0);

CREATE TABLE memo_update(                     -- only ever appended; Yjs update bytes
  id TEXT PRIMARY KEY, memo_id TEXT NOT NULL, data BLOB NOT NULL,
  created_at INTEGER NOT NULL, hlc TEXT NOT NULL);

CREATE TABLE tag(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, sort_key TEXT NOT NULL,
  created_at INTEGER NOT NULL, hlc TEXT NOT NULL, fhlc TEXT NOT NULL DEFAULT '{}', deleted INTEGER NOT NULL DEFAULT 0);

CREATE TABLE tag_edge(                         -- id = 'e:' || parent_id || ':' || child_id
  id TEXT PRIMARY KEY, parent_id TEXT NOT NULL, child_id TEXT NOT NULL,
  hlc TEXT NOT NULL, fhlc TEXT NOT NULL DEFAULT '{}', deleted INTEGER NOT NULL DEFAULT 0);

CREATE TABLE tagging(                          -- id = 't:' || tag_id || ':' || entity_type || ':' || entity_id
  id TEXT PRIMARY KEY, tag_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('article','markup','side_note','memo')),
  entity_id TEXT NOT NULL,
  article_id TEXT,                             -- the article this item belongs to (for the inheritance toggle)
  created_at INTEGER NOT NULL, hlc TEXT NOT NULL, fhlc TEXT NOT NULL DEFAULT '{}', deleted INTEGER NOT NULL DEFAULT 0);

-- ===== Sync plumbing (written now; sent to a server in sub-project 2) =====
CREATE TABLE outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE kv(k TEXT PRIMARY KEY, v TEXT NOT NULL);   -- device_id, hlc_last, pull_cursor, ...

-- ===== Local-only derived tables (rebuildable; never synced) =====
CREATE TABLE anchor_res(
  anchor_id TEXT PRIMARY KEY, revision_id TEXT NOT NULL, start INTEGER, "end" INTEGER,
  status TEXT NOT NULL CHECK(status IN ('exact','mapped','fuzzy','orphan')), score REAL);
CREATE TABLE memo_link(
  memo_id TEXT NOT NULL, node_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('anchor','markup','side_note')),
  target_id TEXT NOT NULL, article_id TEXT NOT NULL,
  PRIMARY KEY(memo_id, node_id));
CREATE TABLE memo_cache(memo_id TEXT PRIMARY KEY, text TEXT NOT NULL, snapshot BLOB, snapshot_hlc TEXT);
CREATE TABLE search_doc(
  rowid INTEGER PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, article_id TEXT,
  UNIQUE(entity_type, entity_id));
CREATE VIRTUAL TABLE search_fts USING fts5(
  title, body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2');
```

**Indexes:**
- `anchor(article_id)`, `markup(article_id)`, `side_note(markup_id)`, `memo_update(memo_id, hlc)`
- `tag_edge(parent_id)` and `tag_edge(child_id)`, both `WHERE deleted=0`
- `tagging(tag_id) WHERE deleted=0`, `tagging(entity_type, entity_id)`
- `memo_link(target_type, target_id)`, `memo_link(article_id)`

### 5.3 Why positions are resolved locally
The `anchor` row that is synced never changes. Each device works out where an anchor sits in the **current** revision and caches the result in `anchor_res`. The process is deterministic, so every device reaches the same result without syncing it. This avoids two problems:
- a flood of writes whenever a revision changes,
- conflicts when an offline fix-up edit loses the race to become the current revision.

The same rule applies to the search index, memo links and memo plain text: all are derived and local.

## 6. Key mechanisms

### 6.1 Article content model and import
- **Normalized blocks:** headings h1–h3, paragraphs, quotes, and list items (flat, with no nesting in v1), with inline bold and italic runs. Everything else is dropped on import.
- **Canonical text:** the blocks' text, normalized to NFC and joined with `\n\n`. Every offset is measured against this text.
- **One normalizer.** Every source becomes HTML, and one normalizer turns HTML into blocks:
  - pasted HTML is used as is;
  - Markdown is rendered to HTML;
  - `.docx` import is deferred (decided when plan 5 was reviewed). When it comes, it will go through mammoth (BSD-2) into this same normalizer.
- **Plain-text rules** (for `.txt` and plain paste):
  - Split paragraphs on blank lines.
  - If the text has no blank lines (common in Chinese text), split on single newlines instead.
  - Strip leading full-width indents (`　　`).
- **File input:** files are chosen through `<input type=file>` on both platforms, so no Tauri dialog plugin is needed in v1.

### 6.2 Anchoring
**Capture.** A selection in the article column becomes `start`/`end` offsets plus `exact`, a 32-character `prefix` and a 32-character `suffix`.
- Markups (underline, bold or highlight) take exactly the selection, trimmed of surrounding whitespace. New markups are stored with `kind='term'`, `unit='range'`, and their look in `style`.
- The earlier paragraph snapping (`unit='block'`) and sentence expansion are no longer used for new markups. Markups saved with them keep their ranges.
- A **point link** (a memo link to a position rather than a range) has `start = end`, an empty `exact`, and is found again from its prefix and suffix.

**Reattaching** an anchor to a newer revision (`core/anchoring/reanchor.ts`):
1. If the anchor's revision is the current one, or the text at its offsets still equals `exact`, the status is **exact**.
2. Otherwise diff the old revision's text against the new one with `diff-match-patch` (`diff_main`) and move the offsets through the diff. If the text at the new offsets equals `exact`, the status is **mapped**.
3. Otherwise search near the expected position with `approx-string-match` (the library Hypothesis uses). Score each candidate by prefix and suffix similarity and by distance from the old offset. `diff-match-patch`'s own fuzzy match is not used, because it only handles patterns of 32 characters or fewer. If the best score passes a threshold, the status is **fuzzy**.
4. Otherwise the status is **orphan**. The markup appears in an "Orphaned markups" panel, where the writer can re-attach it by selecting new text.

**As built (plan 5).**
- Each anchor is re-attached from the revision it was captured on to the new current revision. A series of fix-ups therefore ends where a single edit would, on every device. Only the local `anchor_res` changes.
- Re-attaching an orphaned markup by hand (select new words, then **Attach here**) creates a new anchor on the current revision, points the markup at it, and tombstones the old anchor. Side notes and memo links follow the markup.
- A memo link or search result that leads to an orphan explains that the passage can't be found since the text was fixed.

**Edge cases**

| Case | Handling |
|---|---|
| Overlapping markups | Allowed. Each is drawn as its own highlight (CSS class `mk-<id>`; when highlights overlap, their classes combine). Margin notes are stacked by position and pushed down so they don't collide. |
| Range that crosses blocks | The canonical text includes the `\n\n` separators. ProseMirror splits the highlight across the paragraphs automatically. |
| Markup saved as a whole paragraph (before styles) | Drawn as an inline highlight over the paragraph's text. |
| The same quote appears more than once | Decided by the prefix/suffix score and the distance from the old offset. |
| Deleted article or markup | A memo link to it shows as "missing". |

### 6.3 Chinese and English search
The built-in SQLite tokenizers don't fit:
- `unicode61` treats an unbroken run of Chinese characters as one token.
- The `trigram` tokenizer doesn't match substrings shorter than 3 characters ([FTS5 docs](https://www.sqlite.org/fts5.html)).

So both the indexed text and the query go through the **same TypeScript normalizer**:

```ts
const normalize = (s: string) =>
  s.normalize('NFKC').replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ' $& ');
```

Every CJK character becomes its own token.
- A Chinese query becomes a **phrase of single characters** (`"比 喻"`), so 1- and 2-character queries use the index.
- An English word becomes a quoted **prefix search** (`"writ"*`).
- The query builder **always wraps each token in double quotes**, so user input can never inject FTS syntax such as `AND`, `NEAR`, `-`, `:` or `^`.

**What is indexed** (one row per item):
- an article's title and current text,
- a markup's quoted text,
- a side note's body,
- a memo's title and plain text.

**Snippets and highlights** are computed in TypeScript from the original text, through a map from normalized offsets back to original ones. FTS5's `snippet()` would return the spaced-out text.

**Filtering and ranking**
- Tag filters look up everything under each chosen tag with a recursive query. Repeating that per tag gives an AND across tags.
- The optional **inherit** toggle widens the match to items whose article carries the tag, via `tagging.article_id`.
- Results are ranked with `bm25`.

```sql
WITH RECURSIVE scope(id) AS (
  SELECT :tag UNION
  SELECT e.child_id FROM tag_edge e JOIN scope s ON e.parent_id = s.id WHERE e.deleted = 0)
SELECT d.entity_type, d.entity_id, d.article_id, bm25(search_fts, 5.0, 1.0) AS rank
FROM search_fts JOIN search_doc d ON d.rowid = search_fts.rowid
WHERE search_fts MATCH :fts
  AND d.entity_type IN (SELECT value FROM json_each(:types))
  AND EXISTS (SELECT 1 FROM tagging t
              WHERE t.deleted = 0 AND t.tag_id IN (SELECT id FROM scope)
                AND ((t.entity_type = d.entity_type AND t.entity_id = d.entity_id)
                     OR (:inherit AND t.entity_type = 'article' AND t.entity_id = d.article_id)))
ORDER BY rank LIMIT 50;
```

A search by tag only, with no keyword, drops the `MATCH` clause.

**Not in v1:** folding Traditional and Simplified Chinese together.

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

### 6.4 Tag graph
- **Storage:** an edge table plus recursive queries. The recursive queries use `UNION`, which drops rows already seen, so they can't loop forever even if a cycle slips in. There is no closure table, which would itself have to be recomputed after every sync.
- **Adding parent P over child C.** Refuse if P is already under C:
  ```sql
  WITH RECURSIVE d(id) AS (SELECT :C UNION SELECT e.child_id FROM tag_edge e JOIN d ON e.parent_id = d.id WHERE e.deleted = 0)
  SELECT 1 FROM d WHERE id = :P;
  ```
  The check and the insert are serialized by the async lock described in §4.2.
- **Repairs after sync.** These already exist in sub-project 1 and run after a JSON import:
  - *Cycle:* delete the edge with the highest HLC. Every device picks the same edge.
  - *Duplicate names:* merge the tags into the one with the smaller `id`, moving its edges and taggings across. The merged-away tag is erased (§6.9), not deleted, so it never shows in the Trash.
- **Display (plan 4):** a tree in the sidebar, in which a tag with several parents appears under each parent.
  - Dragging a tag onto another moves it there. Alt-drag adds that tag as a further parent. Dropping a tag on the "Tags" heading takes it out of its parent.
  - Each row's menu offers the same changes without dragging: rename, add parent…, take out of the parent, and delete.
  - Clicking a tag lists everything that carries it or one of its subtags.
  - Every taggable item shows its tags as chips, with a search-as-you-type picker. A name that differs from an existing tag only by case, width or spacing picks that existing tag.

### 6.5 Memos
- **Editor:** TipTap v3 (MIT) with the `Collaboration` extension on a bare `Y.Doc`.
  - There is no network provider and no `y-indexeddb`.
  - StarterKit's `undoRedo` is turned off, because Collaboration brings its own undo history.
- **Persistence:**
  - Every `ydoc.on('update')` appends a `memo_update` row.
  - Loading applies the saved snapshot (`memo_cache.snapshot`), if there is one, and then only the `memo_update` rows newer than the snapshot. `memo_cache` also records the newest update HLC the snapshot covers. Applying a Yjs update twice is harmless, so this is only an optimization.
  - Edits are saved after a 500 ms pause in typing (and when the page is hidden or the memo closes), as one merged update per save.
  - When opening a memo applies 50 or more updates, they are merged into a fresh snapshot. This is local-only: synced `memo_update` rows are never deleted on the client, and merging them on the server comes in sub-project 2.
- **Anchor links:** a custom inline node `anchorLink {linkId, targetType: 'anchor'|'markup'|'side_note', targetId, articleId, label}`, shown as a chip. A writer creates one with:
  - **Quote** (引用) in the selection toolbar, which creates an `anchor` row for the selection;
  - **Link in memo** (插入札记) in a markup's menu;
  - **Quote in memo** (引用) on a side-note card.

  With no memo open, a new one is created for the current article. Drag-and-drop and copy-link-then-paste were dropped (plan 3). Typing `[[`, or `【【` (what the `[` key types with a Chinese input method), then part of a passage offers matching highlights and side notes; choosing one inserts a chip (plan 4). Point links are deferred.
- **Memo column:** the current article's memos (`home_article_id`) are shown as tabs. A memo opened from elsewhere (a link, the sidebar's memo list), or still being written when the writer switches articles, stays open as a closable tab.
- **Memos outlive their article:** deleting an article leaves its memos live. The sidebar's memo list (§6.9) keeps every memo reachable.
- **Following a link:** clicking it opens the target article in the left column (switching articles if needed), scrolls to the target, and briefly flashes it. A link whose target was deleted says so instead.
- **Backlinks:** after each save, `memo_link` and `memo_cache.text` are recomputed. Passages cited by a memo get a dotted underline; clicking one lists the citing memos, each with an **Open** button.

### 6.6 Article column
- A ProseMirror view, used directly rather than through TipTap (decided in plan 2), and read-only by default.
  - The schema is flat textblocks only: paragraph, heading, quote, list item, plus strong and em marks.
  - So a document position is always `canonicalOffset + 1`: the `\n\n` between blocks counts 2, the same as one block's close token plus the next block's open token.
  - Markups are drawn as ProseMirror decorations over the positions stored in `anchor_res`, with classes `mk mk-<style> mk-id-<id>`. Overlapping highlights share one span that lists every id. Passages cited by memos (`cited cite-m-<memoId>`) and a followed link's target (`flash`) are decorations too.
- **Capturing a selection:** from the DOM selection (`window.getSelection()` → `view.posAtDOM`). This works whether or not the view is editable. Empty or whitespace-only selections, and selections that reach outside the article, show no toolbar.
- **Selection toolbar:** Underline, Bold, Highlight, Note (highlights the selection and adds a side note), and Quote (inserts a link to the selection into the memo; plan 3).
- **Margin:** side notes line up with their anchors and are pushed down so they never overlap. (Passages cited by memos are marked in the text itself; see §6.5.)
- **Fix-up edit mode:**
  - **Fix text** makes the text editable in place, using the same flat schema, with undo, and bold and italic keys. Markups, side notes and the selection toolbar are hidden while editing.
  - Saving stores a new immutable `article_revision`, sets `current_revision_id`, and runs reattachment (§6.2). A notice then says how many markups were found in place, adjusted to small changes, or not found. Markups that weren't found are listed in the orphaned-markups panel above the text.
  - Saving an unchanged text writes nothing and says so. A text left empty is refused, and the editor stays open.
  - Leaving without saving (**Discard changes**, or opening another article) discards the changes.

### 6.7 Export and backup
Until sync exists, web data lives only in the browser's private storage (OPFS). So sub-project 1 ships:
- **JSON export and import:** every synced table, versioned (`format: 'jot-library'`, `version: 1`).
  - An export holds every row, tombstones included, with its per-field clocks.
  - An import merges rows by per-field latest-edit-wins without the outbox, so importing twice, or into a library with newer edits, changes nothing it shouldn't.
  - After an import, the derived tables are rebuilt (memo links from the memo documents) and the tag graph is repaired (§6.4).
  - Files that aren't valid exports are refused before anything is written.
  - Items live in the file but deleted in the library (the deletion being the newer edit) stay deleted, and the writer is asked whether to bring them back. Restoring is a fresh edit, so it wins and syncs like any other.
  - The import notice reports what changed in the library, not what the file holds.
- **Desktop `.sqlite` backup:** SQLite's online backup of the open database into the Downloads folder.
- **Desktop file writes** go only into Downloads, under names the app validates, and never overwrite a file.

### 6.8 UI shell and translation

```
┌ Sidebar ──────────┬ Article column ──────────────┬ Margin ──────┬ Memo column ──────────┐
│ Library list      │ title / meta / tags          │ side notes   │ memo tabs             │
│ Memo list         │ reflowed text with markup    │ aligned to   │ TipTap editor with    │
│ Tag graph tree    │ highlights; selection        │ anchors      │ link chips that jump  │
│ Search + filters  │ toolbar: underline/bold/     │              │ back to the passage   │
│ Settings · Trash  │   highlight/note/quote       │              │                       │
│ (collapsible)     │ (or the Trash view)          │              │                       │
└───────────────────┴──────────────────────────────┴──────────────┴───────────────────────┘
```

- The panes are resizable, and the sidebar can be collapsed. §6.10 details the sidebar sections, the section pages and the column bars.
- Every user-facing string goes through `i18next`, with `zh-CN` and `en` resources from the first commit.
- Font stacks cover CJK text.

### 6.9 Trash, erasing and the memo list
Deleting keeps the item, so a writer can change their mind; erasing is the only way content leaves the device.

**Deletion states** (`deleted`, §5.1). Every change is an ordinary edit with its own clock, so the newest one wins and sync carries it later.
- `0` live.
- `1` deleted. Articles, memos and tags then sit in the Trash. A markup or side note deleted on its own is simply removed; it never appears in the Trash.
- `2` erased (**Delete forever**).

**What the Trash holds:** deleted articles, memos and tags, newest deletion first. The deletion time is the millisecond part of the clock of the `deleted` field.
- **An article** comes with its markups, anchors and side notes. Its memos stay live (§6.5).
- **A tag** comes with its tree links (`tag_edge`) and taggings.
- **"Deleted with it"** is read from the clocks: a child belongs to the entry when its own `deleted` clock is not older than the entry's. Deleting commits the entry first and its children after it, so they carry newer clocks. A markup removed a week before its article keeps an older clock, so restoring the article does not bring it back.

**Restore** sets `deleted: 0` on the entry and everything deleted with it, as a fresh edit (the same `restoreRows` as an import's restore, §6.7). Then the derived tables are rebuilt, the tag graph is repaired (§6.4: a restored tag whose name is now taken merges into the other one) and memo links are refreshed.

**Delete forever** (with a confirmation) erases an entry and everything that belongs to it, whatever its deletion state (for an article, all its markups, anchors and side notes, and the taggings on any of them; for a tag, its tree links and taggings).
- A fresh edit sets `deleted: 2` and blanks the text fields: the article's title, author and source; each anchor's `exact`, `prefix` and `suffix`; side-note bodies; the memo's title; the tag's name.
- Rows that can't be edited are removed on this device: the article's revisions, the memo's updates, its cache and links, plus the search entries and anchor positions of everything erased.
- **Empty Trash** erases every entry after one confirmation.
- The same removal runs after every import, so a file can't bring erased content back: its rows merge as usual, the erase is the newer edit, and the content rows are removed again. Erased items are never offered for restoring.
- An export holds only the bare erased rows. Erasing on other devices and on the server comes with sync (sub-project 2).

**Links into the Trash:** following a memo link whose target is in the Trash says so ("in the Trash"); one whose target was erased says it was deleted. Search never shows deleted or erased items.

**UI:**
- A **Trash** button at the bottom of the sidebar, next to the settings gear, opens the Trash view (`#/trash`) in the article column. (It showed a count until §6.10 removed it.)
- Each entry shows its kind, title, deletion time, and what comes back with it (for example "with 3 markups and 2 side notes"), with **Restore** and **Delete forever**. **Empty Trash** sits at the top.
- Deleting an article, memo or tag asks "Move … to the Trash?"; the article's question adds that its memos stay.

**Memo list:** the sidebar shows Library, **Memos**, then Tags. The Memos section lists every live memo, most recently edited first (the newest of the memo row's clock and its updates' clocks), with its home article's title, or "No article" when the home article is deleted, erased or unset. Clicking one opens it as a tab in the memo column, as following a link does.

### 6.10 Workspace layout and reading controls
The second UI round (plan 8), from the product owner's review of plans 1–7.

**Sidebar**
- The top keeps **Jot**, the collapse button and the search box. The Import button moves to the Library section.
- **Library**, **Memos** and **Tags** sections, each with:
  - a fold arrow, so a long section can be collapsed (remembered on this device);
  - a heading that opens the section's page (below);
  - Library has a **+** that imports; Tags keeps its **+** that creates a tag. The new-tag input lines up with the tag rows.
- Article rows have no delete button: deleting happens from the article's **☰** menu or the Library page.
- The footer holds the settings gear and the Trash icon, without a count.

**Section pages** (`#/library`, `#/memos`, `#/tags`), in the main column at full width:
- **Library:** every article, newest first, with its author and the date it was added. Clicking a row opens the article. Row **☰**: Open, Edit details…, Delete.
- **Memos:** every memo, most recently edited first, with its home article or "No article". Clicking a row opens the memo in the memo column, and its home article when it has one. Row **☰**: Open, Move to article…, Delete.
- **Tags:** every tag with its path (for example `技巧 › 修辞`) and the number of items it is on. Clicking a row searches that tag, as the tag tree does. Row **☰**: Rename, Delete.
- Deleting always moves the item to the Trash (§6.9).

**Article column**
- A slim bar at the top of the column: **Aa** on the left, **☰** on the right with **Fix text** (修订原文), **Edit details…** and **Delete**.
  - It hides while the writer scrolls down and comes back when they scroll up, or when the pointer reaches the top of the column. It stays while one of its panels is open.
  - The title, author and tags scroll with the text.
- **Edit details…** edits the title (required), author and source. Saving is an edit like any other, and the title is re-indexed for search.
- **Fix-up mode:** the Save / Cancel bar and its notices float at the bottom of the column, over the text, so nothing on the page shifts.

**Reading controls (Aa):** typeface (宋体 serif, 黑体 sans, 楷体 kai), font size (14–26 px), line spacing (1.4–2.6), line width (30–50 em, or the full column) and **Reset**. §6.11 redesigns this panel.
- Articles and memos have separate settings. Article defaults: 宋体, 18 px, 1.9, 40 em. Memo defaults: 宋体, 16 px, 1.8, full width. The defaults match the look before plan 8.
- Settings stay on this device (local storage). They are not synced or exported.

**Memo column**
- No heading. A tab strip runs across the top:
  - tabs take the strip's full height;
  - the active tab has the memo page's colour, on a strip of a different colour;
  - the strip scrolls sideways when the tabs don't fit;
  - a **+** icon at its end creates a memo for the open article.
- Under the tabs, the same slim bar as the article column: **Aa** (the memo settings) and **☰** with **Move to article…** and **Delete**.
- **Move to article…** picks an article from a searchable list and makes it the memo's home; the memo then shows among that article's tabs. It works for any memo, including one whose article is deleted or erased.

**Layout:** the side-note margin belongs to the article view. The memo column and its splitter show only while an article is open or a memo is open; otherwise (the Trash, the section pages) the main column takes the full width.

### 6.11 Sidebar polish, scrollbars, memo formatting and text styles
The third UI round (plan 9), from the product owner's review of plan 8, plus the small items plan 8's review deferred.

**Sidebar**
- **An empty section** shows one muted line at the item text size, starting where item text starts, so it sits in balance with the other sections.
- **Tag names** start at the same left edge as article and memo titles. The fold arrow of a tag with children sits in the space to its left.
- **Memos** gets a **+** that creates a standalone memo (no article) and opens it in the memo column. Standalone memos are numbered among themselves. A double click on this **+**, or on the memo column's, makes one memo.
- **Folded sections at the end** stack at the bottom, just above the footer. A folded section in the middle stays in place, and the open sections use the space above.

**Scrollbars** (sidebar, article column, memo column, memo tab strip, section pages) are thin and rounded, with a muted thumb and no track. They show only while the pointer is over the area or it is scrolling. Each is drawn over the edge of its area and takes no room from the content: the tabs keep their full height when they overflow, and the columns keep their full width. The thumb can be dragged.

**Memo column**
- **A bubble menu** appears over a text selection in a memo. It offers bold, italic, strikethrough, headings 1–3, bullet list, numbered list and quote, each showing whether it is on.
- **Tabs of memos that don't belong to the open article** (their home is another article, or none) have their own tint, active and inactive. The tab's tooltip names the home article, or says "No article". Their titles are italic where the face has an italic; Chinese characters stay upright.
- **Ctrl/Cmd+Home and Ctrl/Cmd+End** reach the start and end of a memo, also one that starts with a link chip. With Shift they extend the selection.

**Text styles (Aa)** replace §6.10's reading controls, for articles and memos separately:
- **The panel**, titled **Text styles**, has four rows, each with an icon:
  - **Typeface** shows the current choice, with **›**;
  - **Font size** (14–26 px) with **−** and **+**;
  - **Line spacing** (1.4–2.6) with **−** and **+**;
  - **Line width** (Narrow, Medium, Wide, Full) with **−** and **+**.
  - **Reset** is at the bottom.
- **The Typeface page** (with **‹** back) lists two groups, each with one choice (radio buttons), and each name is shown in its own typeface. Tab reaches a group's current choice, and the arrow keys pick the next one:
  - **English**: Serif (Literata, Piazzolla, Source Serif) and Sans Serif (Atkinson Hyperlegible, Inter, IBM Plex Sans, Public Sans, Source Sans, OpenDyslexic);
  - **Chinese**: 宋体, 黑体, 楷体, 仿宋.
- **Text uses both choices:** Latin letters in the English typeface, Chinese characters in the Chinese one.
- **In Chinese text, punctuation it shares with English** (· — ― ‘ ’ “ ” …) comes from the Chinese typeface, so —— and …… are full-width. English text keeps the English typeface's own. An article's language is the one detected when it was imported; a memo's is detected the same way from its own text as it is written.
- **The English typefaces are bundled** (Fontsource packages, OFL-1.1) and loaded only when used, so Jot stays offline. Only their Latin and Latin Extended letters ship, as woff2 files; Greek, Cyrillic and Vietnamese letters use the computer's fonts.
- **The Chinese typefaces are the computer's own:**
  - Windows: 宋体 (SimSun), 微软雅黑 (Microsoft YaHei), 楷体 (KaiTi), 仿宋 (FangSong);
  - macOS: 宋体-简 (Songti SC), 苹方 (PingFang SC), 楷体-简 (Kaiti SC), 华文仿宋 (STFangsong);
  - Linux: Noto Serif/Sans CJK.
  - A missing one falls back to 宋体, or for 黑体 to the computer's sans-serif; bundling them would add about 60 MB to every installer.
- **Line widths are measured in the text's own size:** Narrow 28 em, Medium 34 em, Wide 42 em, or Full.
- **Defaults:** Source Serif with 宋体. Articles use 18 px, 1.9 and Medium; memos use 16 px, 1.8 and Full.
- **Settings stored by plan 8 carry over:** its 宋体 / 黑体 / 楷体 choice becomes the Chinese typeface, and its width becomes the nearest named width. A width outside plan 8's own range (30–50 em, or full) counts as damaged and becomes the default.
- **The ☰ menus and the Text styles panel work from the keyboard:** arrow keys move between items, and opening the panel moves focus into it.
- **The panel stays under Aa:** also when it opens while the bar slides in, and when the window is resized.

## 7. Development environment (Docker only)

Nothing is installed on the host. Host Node 18 stays as it is.

**Image `docker/dev.Dockerfile`**
- Based on `node:24-trixie`. Node 24 is the Active LTS and is supported until 2028-04-30.
- Rust stable, installed via `rustup`. Tauri 2.12 needs Rust 1.90 or newer.
- Tauri's Linux dependencies: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.
- Also `fonts-noto-cjk fonts-noto-color-emoji sqlite3 gosu dbus`.
- Sets `IN_JOT_CONTAINER=1`.
- The container runs as the host UID/GID (1000:1000), so files it creates in the repo are owned by the host user.

**`compose.yaml`**

| Service | Profile | Purpose |
|---|---|---|
| `dev` | default | An idle shell container, also the VS Code Dev Container target |
| `web` | default | The Vite dev server, published on `127.0.0.1:5173` and opened in a Windows browser. `localhost` counts as a secure origin, so OPFS works. |
| `desktop` | `desktop` | Runs `dbus-run-session -- pnpm --filter @jot/desktop tauri dev` |
| `playwright` | `e2e` | Runs `mcr.microsoft.com/playwright:v1.63.0-noble` as a browser server, with `network_mode: service:web` so tests reach `localhost:5173` |
| `postgres`, `server` | `sync` | Stubs for sub-project 2 |

- The repo is bind-mounted at `/work`.
- Every `node_modules` directory, the pnpm store, the cargo registry and cargo's `target` directory live in **named volumes**, not on the host.

**`compose.wslg.yaml`** is an override for the `desktop` service that shows the Tauri window through WSLg.
- This host runs Docker Desktop, where the WSLg files are at `/run/desktop/mnt/host/wslg` ([docker/for-win#14403](https://github.com/docker/for-win/issues/14403)). The path is configurable through `WSLG_ROOT`; with plain Docker Engine it would be `/mnt/wslg`.
- Environment:
  - `DISPLAY=:0`
  - `GDK_BACKEND=x11`
  - `XDG_RUNTIME_DIR=/mnt/wslg/runtime-dir`
  - `PULSE_SERVER=unix:/mnt/wslg/PulseServer`
  - `WEBKIT_DISABLE_DMABUF_RENDERER=1`
  - `WEBKIT_DISABLE_COMPOSITING_MODE=1`
  - `NO_AT_BRIDGE=1`

**Guards and helpers**
- Root `package.json` sets `engines.node >=24` and `packageManager`.
- `.npmrc` sets `engine-strict=true`.
- A `preinstall` script fails unless `IN_JOT_CONTAINER=1`, so host Node can't install anything by accident.
- `scripts/bootstrap.sh` creates the mount-point directories as the host user, because Docker would otherwise create them owned by root.

**Everyday commands**

```sh
cp .env.example .env && scripts/bootstrap.sh && docker compose build
docker compose run --rm dev pnpm install
docker compose up web                                   # main loop; open http://localhost:5173
docker compose run --rm dev pnpm test                   # also: typecheck, lint
docker compose --profile e2e up -d playwright && docker compose exec web pnpm e2e
docker compose --profile desktop up desktop             # Tauri window through WSLg
```

**CI (GitHub Actions)**
- `ci.yml` runs the same containers: typecheck, lint, Vitest, and Playwright on Chromium (stand-in for WebView2) and WebKit (stand-in for WKWebView).
- `desktop.yml` runs `tauri-apps/tauri-action@v1` on `windows-latest` and `macos-latest` (aarch64 and x86_64) and uploads **unsigned** builds.
- Windows and macOS binaries can't be built in Linux Docker, so these CI builds are the way to get them.

**Desktop builds (plan 6):** `.github/workflows/desktop.yml` builds unsigned Windows and macOS (arm64 and x64) bundles with `tauri-apps/tauri-action@v1`. It runs manually or on `v*` tags, and keeps the bundles as workflow artifacts. Installing needs no administrator rights: Windows gets a per-user NSIS installer (`installMode: currentUser`, no MSI), and macOS gets the app in a `.dmg`, ad-hoc signed (`signingIdentity: "-"`) so Apple silicon runs it.

## 8. Testing strategy

| Layer | Tooling | Focus |
|---|---|---|
| `core` | Vitest + fast-check | HLC ordering; normalizer and query builder (including quoting of hostile input); reattachment property test (random edits → the anchor ends up exact, mapped, fuzzy with the correct text, or orphaned, never at a wrong spot); tag cycle check and repairs |
| `db` | Vitest; one driver test suite run on `node:sqlite` and on sqlite-wasm in Node | migrations; per-field latest-edit-wins upserts (applying ops in any order gives the same result); outbox; search indexing; 1- and 2-character Chinese queries; tag filters and the inherit toggle |
| `client` | Vitest + happy-dom; ProseMirror plugin state tested without a rendered view | building decorations; the anchor-link node; import normalizer (HTML, Markdown, Chinese plain-text rules; .docx fixtures when .docx import lands) |
| End to end | Playwright on Chromium + WebKit, in Docker | the full loop in §9, including persistence in OPFS across reloads and the single-tab lock |
| Desktop | manual run through WSLg; CI builds for Windows and macOS | the native driver, and the same loop as e2e |

## 9. Milestones

Each milestone can be demoed or tested on its own.

- **M0 — Dev environment + risk checks.** Each check below must pass before the milestones that depend on it:
  1. A Tauri window opens from Docker through WSLg, and files created in the container are owned by the host user.
  2. SQLite gives the same results in all four drivers (`node:sqlite`, sqlite-wasm in Node, `opfs-sahpool` in Chromium and WebKit, `rusqlite`). Checked: version ≥ 3.43, FTS5 with contentless delete, JSON functions, and 1- and 2-character Chinese phrase queries.
  3. The read-only ProseMirror article view: capturing a selection, overlapping highlights, and Chinese input in fix-up mode (Chromium and WebKitGTK).
  4. TipTap Collaboration on a bare Y.Doc saved to SQLite, with an inline node and undo.
- **M1 — `core`:** IDs, HLC, Chinese normalizer and query builder, anchor capture and reattachment, tag-graph logic.
- **M2 — `db`:** migrations, the driver test suite, repositories, `applyOp` + outbox, search indexing.
- **M3 — Walking skeleton (web and desktop):** paste, `.txt` and `.md` import, the library list, the read-only article view.
- **M4 — Markups and side notes:** the selection toolbar, margin layout, overlapping markups.
- **M5 — Memos:** Yjs persistence, anchor links, click to scroll and flash, backlinks.
- **M6 — Tags:** create, rename and delete; the graph editor with cycle prevention; tagging every item type.
- **M7 — Search UI:** keyword, tag and type filters, the inherit toggle, snippets and highlights.
- **M8 — Fix-up editing:** fix-up edit mode, reattachment, the orphaned-markups panel. (`.docx` import is deferred.)
- **M9 — Export and builds:** JSON export and import, desktop `.sqlite` backup, CI desktop builds.
- **M10 — Trash and memo list:** the Trash with restore, delete forever and empty; the sidebar memo list (§6.9).
- **M11 — Workspace layout and reading controls:** the sidebar sections and section pages, the article and memo bars with **Aa** and **☰**, editing an article's details, moving a memo to another article (§6.10).
- **M12 — Sidebar polish, scrollbars, memo formatting and text styles:** §6.11.

## 10. Acceptance test (sub-project 1 is done when this passes on web, and manually on desktop)
1. Import a Chinese article by pasting it, and an English one from `.md`.
2. Underline, bold and highlight passages, including one that spans two paragraphs, and add a side note.
3. Quote a passage, a highlight and the side note into a memo, and click each link to jump back to its target.
4. Create tags `技巧 > 修辞 > 比喻` and give `比喻` a second parent. Tag the side note `比喻`. Search tag `技巧` with the 2-character query `比喻` and find the note. Confirm the inherit toggle behaves as specified.
5. Make a fix-up edit. Markups next to the edit reattach. A markup whose text was deleted appears in the orphaned-markups panel.
6. Reload the app, confirm everything persisted, then export to JSON and import the file into a fresh library.
7. Delete the article: its memo stays in the Memos list and still opens. Find the article in the Trash, restore it with its markups and side notes, delete it again, then delete it forever: the Trash is empty and search no longer finds its words.
8. Move that memo to another article with **Move to article…**; it shows among that article's tabs. Change the article's and the memo's **Aa** settings and reload: they stay. Open the Library, Memos and Tags pages and act on a row from its **☰** menu.

## 11. Out of scope for sub-project 1
- Sync, accounts and the server (sub-project 2), including erasing content on other devices and on the server.
- More than one open tab on the web.
- OS keychain storage.
- Rich text in side notes.
- Folding Traditional and Simplified Chinese together in search.
- URL clipping, PDF and EPUB import.
- Code signing, notarization and auto-update (sub-project 3).

## 12. Risks

| Risk | Mitigation |
|---|---|
| Selection behaviour in read-only ProseMirror differs between browser engines | Risk check M0.3, and the `posAtDOM` fallback |
| OPFS is unavailable (for example Safari private browsing) | Detect it and show a clear message; export is always available |
| A second tab opens the web app | Detected through `navigator.locks`; show a message |
| Blank Tauri window in Docker | Rendering switches off in the WSLg override (`WEBKIT_DISABLE_*`), and `GDK_BACKEND=x11` |
| Library versions move fast (Node 24→26 LTS, TypeScript 7) | Pin versions; confirm TS 7 works with the other tools before adopting it |

## 13. References
- [Tauri plugins-workspace#886](https://github.com/tauri-apps/plugins-workspace/issues/886): `tauri-plugin-sql` has no transactions
- [SQLite WASM persistence](https://sqlite.org/wasm/doc/trunk/persistence.md): `opfs` vs `opfs-sahpool`
- [SQLite FTS5](https://www.sqlite.org/fts5.html): the `unicode61` and `trigram` tokenizers, `contentless_delete`
- [TipTap Collaboration](https://tiptap.dev/docs/editor/extensions/functionality/collaboration) and [TipTap Conversion (Pro)](https://tiptap.dev/docs/conversion/getting-started/overview)
- [Better Auth + Hono](https://better-auth.com/docs/integrations/hono) and the [bearer plugin](https://better-auth.com/docs/plugins/bearer) (sub-project 2)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) and [Linux graphics debugging](https://v2.tauri.app/develop/debug/linux-graphics/)
- [WSLg containers sample](https://github.com/microsoft/wslg/blob/main/samples/container/Containers.md), [docker/for-win#14403](https://github.com/docker/for-win/issues/14403)
- [tauri-action](https://github.com/tauri-apps/tauri-action)
- [Playwright in Docker](https://playwright.dev/docs/docker)
