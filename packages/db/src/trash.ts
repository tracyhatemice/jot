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
  return entries.map((e): TrashEntry => ({ kind: e.kind, id: e.id, title: e.title, deletedAt: e.deletedAt, markups: e.markups, sideNotes: e.sideNotes, taggings: e.taggings }));
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
