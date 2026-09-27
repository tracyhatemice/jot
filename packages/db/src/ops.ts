import { assertValidOp, encodeOp, IMMUTABLE_TABLES, OP_VERSION, type Op, type SqlValue, type SyncedTable } from '@jot/core';
import type { Stmt } from './driver';

/** Only ever applied to names from SYNCED_COLUMNS (checked by assertValidOp). */
const ident = (name: string) => `"${name}"`;

/** Collects positional parameters; call `bind` in the same order the `?`s appear in the SQL text. */
function paramList() {
  const params: SqlValue[] = [];
  const bind = (value: SqlValue) => {
    params.push(value);
    return '?';
  };
  return { params, bind };
}

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

export function outboxStatement(op: Op, createdAt: number): Stmt {
  return { sql: 'INSERT INTO outbox (op, created_at) VALUES (?, ?)', params: [encodeOp(op), createdAt] };
}

/** Persists the clock high-water mark; never lowers it, even if commits reach the database out of order. */
export function hlcLastStatement(hlc: string): Stmt {
  return {
    sql: "INSERT INTO kv (k, v) VALUES ('hlc_last', ?) ON CONFLICT (k) DO UPDATE SET v = max(v, excluded.v)",
    params: [hlc],
  };
}

export function kvSetStatement(key: string, value: string): Stmt {
  return { sql: 'INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', params: [key, value] };
}
