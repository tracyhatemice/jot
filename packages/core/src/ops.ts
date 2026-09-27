import type { SqlValue } from './sql';
import { base64ToBytes, bytesToBase64 } from './util/base64';

/** Bumped whenever the op wire format changes (sync, sub-project 2). */
export const OP_VERSION = 1;

/**
 * Columns an op may write on each synced table, besides `id`, `hlc` and `fhlc`.
 * Also the SQL-injection guard: `opStatements` only interpolates names found here.
 */
export const SYNCED_COLUMNS = {
  article: ['title', 'author', 'source', 'lang', 'import_kind', 'current_revision_id', 'created_at', 'deleted'],
  article_revision: ['article_id', 'parent_id', 'blocks', 'text', 'created_at'],
  anchor: ['article_id', 'revision_id', 'start', 'end', 'exact', 'prefix', 'suffix', 'unit', 'created_at', 'deleted'],
  markup: ['article_id', 'anchor_id', 'kind', 'style', 'created_at', 'deleted'],
  side_note: ['markup_id', 'article_id', 'body', 'sort_key', 'created_at', 'deleted'],
  memo: ['title', 'home_article_id', 'created_at', 'deleted'],
  memo_update: ['memo_id', 'data', 'created_at'],
  tag: ['name', 'color', 'sort_key', 'created_at', 'deleted'],
  tag_edge: ['parent_id', 'child_id', 'deleted'],
  tagging: ['tag_id', 'entity_type', 'entity_id', 'article_id', 'created_at', 'deleted'],
} as const satisfies Record<string, readonly string[]>;

export type SyncedTable = keyof typeof SYNCED_COLUMNS;

/** Rows in these tables are written once and never change. */
export const IMMUTABLE_TABLES: ReadonlySet<SyncedTable> = new Set<SyncedTable>(['article_revision', 'memo_update']);

export interface Op {
  v: number;
  table: SyncedTable;
  id: string;
  hlc: string;
  fields: Record<string, SqlValue>;
}

export function assertValidOp(op: Op): void {
  const columns = (SYNCED_COLUMNS as Record<string, readonly string[] | undefined>)[op.table];
  if (!columns) throw new Error(`unknown synced table: ${op.table}`);
  for (const field of Object.keys(op.fields)) {
    if (!columns.includes(field)) throw new Error(`column "${field}" is not writable on ${op.table}`);
  }
}

export function encodeOp(op: Op): string {
  return JSON.stringify(op, (_key, value: unknown) => {
    if (value instanceof Uint8Array) return { $blob: bytesToBase64(value) };
    if (typeof value === 'bigint') throw new TypeError('bigint values cannot be stored in ops');
    return value;
  });
}

export function decodeOp(json: string): Op {
  return JSON.parse(json, (_key, value: unknown) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const blob = (value as { $blob?: unknown }).$blob;
      if (Object.keys(value).length === 1 && typeof blob === 'string') return base64ToBytes(blob);
    }
    return value;
  }) as Op;
}
