import { assertValidOp, encodeOp, IMMUTABLE_TABLES, type Op, type SqlValue } from '@jot/core';
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

/**
 * SQL that applies one op. Mutable tables use per-field latest-edit-wins: a field changes only if
 * the op's HLC is newer than the HLC recorded for that field in `fhlc`. Immutable tables insert once.
 *
 * Not an `INSERT … ON CONFLICT DO UPDATE`: SQLite checks NOT NULL before resolving the conflict, so a
 * partial op (e.g. `{ deleted: 1 }`) would fail. Instead: UPDATE the row if present, then INSERT it only
 * if absent — both in the caller's transaction.
 */
export function opStatements(op: Op): Stmt[] {
  assertValidOp(op);
  const cols = Object.keys(op.fields);
  if (cols.length === 0) return [];
  const table = ident(op.table);
  const colList = cols.map(ident).join(', ');

  if (IMMUTABLE_TABLES.has(op.table)) {
    const ins = paramList();
    const values = [ins.bind(op.id), ...cols.map((c) => ins.bind(op.fields[c] ?? null)), ins.bind(op.hlc)].join(', ');
    return [{ sql: `INSERT INTO ${table} (id, ${colList}, hlc) VALUES (${values}) ON CONFLICT (id) DO NOTHING`, params: ins.params }];
  }

  // Each fragment is built left to right so binds happen in textual order.
  const up = paramList();
  const fieldClock = (c: string) => `coalesce(json_extract(fhlc, ${up.bind(`$."${c}"`)}), '')`;
  const assignments = cols.map(
    (c) => `${ident(c)} = CASE WHEN ${up.bind(op.hlc)} > ${fieldClock(c)} THEN ${up.bind(op.fields[c] ?? null)} ELSE ${ident(c)} END`,
  );
  const clockUpdates = cols.map(
    (c) => `${up.bind(`$."${c}"`)}, CASE WHEN ${up.bind(op.hlc)} > ${fieldClock(c)} THEN ${up.bind(op.hlc)} ELSE ${fieldClock(c)} END`,
  );
  const update =
    `UPDATE ${table} SET ${assignments.join(', ')}, ` +
    `fhlc = json_set(fhlc, ${clockUpdates.join(', ')}), ` +
    `hlc = max(hlc, ${up.bind(op.hlc)}) WHERE id = ${up.bind(op.id)}`;

  const ins = paramList();
  const values = [
    ins.bind(op.id),
    ...cols.map((c) => ins.bind(op.fields[c] ?? null)),
    ins.bind(op.hlc),
    `json_object(${cols.map((c) => `${ins.bind(c)}, ${ins.bind(op.hlc)}`).join(', ')})`,
  ].join(', ');
  const insert =
    `INSERT INTO ${table} (id, ${colList}, hlc, fhlc) SELECT ${values} ` +
    `WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ${ins.bind(op.id)})`;

  return [
    { sql: update, params: up.params },
    { sql: insert, params: ins.params },
  ];
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
