import { newId, type ResolutionStatus, type TextAnchor } from '@jot/core';
import type { Stmt } from './driver';
import type { Library, OpInput } from './library';
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
      ...indexStatements({ entityType: 'memo', entityId: id, articleId: null, title, body: '' }),
    ],
  );
  return id;
}

export async function renameMemo(lib: Library, id: string, title: string): Promise<void> {
  const clean = cleanTitle(title);
  const [row] = await lib.driver.query<{ text: string }>(
    `SELECT coalesce(c.text, '') AS text
     FROM memo m LEFT JOIN memo_cache c ON c.memo_id = m.id WHERE m.id = ? AND m.deleted = 0`,
    [id],
  );
  if (!row) return;
  await lib.commit(
    [{ table: 'memo', id, fields: { title: clean } }],
    indexStatements({ entityType: 'memo', entityId: id, articleId: null, title: clean, body: row.text }),
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

/**
 * Appends one merged Yjs update and rewrites the memo's local derived data in the same transaction.
 * A save that lands after the memo was deleted (an editor flushing as it closes) is still stored, but
 * the memo stays out of search and backlinks.
 */
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

export async function appendMemoUpdate(lib: Library, memoId: string, data: Uint8Array, derived: MemoDerived): Promise<void> {
  const [memo] = await lib.driver.query<{ title: string; deleted: number }>('SELECT title, deleted FROM memo WHERE id = ?', [memoId]);
  if (!memo) throw new Error(`Memo ${memoId} does not exist`);
  const update: OpInput = { table: 'memo_update', id: newId(), fields: { memo_id: memoId, data, created_at: lib.now() } };
  if (memo.deleted) {
    await lib.commit([update]);
    return;
  }
  await lib.commit([update], memoDerivedStatements(memoId, memo.title, derived));
}

/** Rewrites a memo's links, text and search entry from its document (after an import). A deleted memo is left alone. */
export async function refreshMemoDerived(lib: Library, memoId: string, derived: MemoDerived): Promise<void> {
  const [memo] = await lib.driver.query<{ title: string; deleted: number }>('SELECT title, deleted FROM memo WHERE id = ?', [memoId]);
  if (!memo || memo.deleted) return;
  await lib.driver.batch(memoDerivedStatements(memoId, memo.title, derived));
}

export async function liveMemoIds(lib: Library): Promise<string[]> {
  return (await lib.driver.query<{ id: string }>('SELECT id FROM memo WHERE deleted = 0 ORDER BY id')).map((r) => r.id);
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
