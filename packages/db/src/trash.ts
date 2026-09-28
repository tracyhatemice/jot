import { parseHlc, type SqlValue, type SyncedTable } from '@jot/core';
import type { RowRef } from './exchange';
import type { Library, OpInput } from './library';

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

/** An entry and everything deleted with it — what `restoreRows` brings back. Empty when it isn't in the Trash. */
export async function trashEntryRows(lib: Library, kind: TrashKind, id: string): Promise<RowRef[]> {
  const clock = await deletedClock(lib, kind, id);
  if (clock === null) return [];
  return [{ table: TABLE[kind], id }, ...(await deletedWith(lib, kind, id, clock))];
}

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
 * Erases rows that belong to an erased article or tag but aren't erased themselves — a file from another
 * library can bring such rows (its markups, notes and taggings were never here to erase). A fresh edit, like
 * any erase; runs after every import (spec §6.9).
 */
export async function eraseLeftovers(lib: Library): Promise<void> {
  const rows = await lib.driver.query<{ tbl: SyncedTable; id: string }>(
    `WITH ea AS (SELECT id FROM article WHERE deleted = 2), et AS (SELECT id FROM tag WHERE deleted = 2)
     SELECT 'markup' AS tbl, id FROM markup WHERE deleted <> 2 AND article_id IN (SELECT id FROM ea)
     UNION ALL SELECT 'anchor', id FROM anchor WHERE deleted <> 2 AND article_id IN (SELECT id FROM ea)
     UNION ALL SELECT 'side_note', id FROM side_note WHERE deleted <> 2 AND article_id IN (SELECT id FROM ea)
     UNION ALL SELECT 'tagging', id FROM tagging WHERE deleted <> 2
       AND (article_id IN (SELECT id FROM ea) OR (entity_type = 'article' AND entity_id IN (SELECT id FROM ea)) OR tag_id IN (SELECT id FROM et))
     UNION ALL SELECT 'tag_edge', id FROM tag_edge WHERE deleted <> 2 AND (parent_id IN (SELECT id FROM et) OR child_id IN (SELECT id FROM et))`,
  );
  if (rows.length === 0) return;
  await lib.commit(rows.map((r): OpInput => ({ table: r.tbl, id: r.id, fields: { ...BLANK[r.tbl], deleted: 2 } })));
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
