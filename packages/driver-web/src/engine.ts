import type { Row, SqlValue, Stmt } from '@jot/db';

/** The slice of sqlite-wasm's `oo1.DB` the engine uses. */
export interface Oo1Database {
  exec(options: { sql: string; bind?: SqlValue[]; rowMode: 'object'; returnValue: 'resultRows' }): unknown;
}

export interface Engine {
  query(sql: string, params?: SqlValue[]): Row[];
  batch(stmts: Stmt[]): void;
}

const MIN = BigInt(Number.MIN_SAFE_INTEGER);
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
/** sqlite-wasm may return 64-bit integers as bigint; other drivers return numbers when safe. */
const normalize = (v: SqlValue): SqlValue => (typeof v === 'bigint' && v >= MIN && v <= MAX ? Number(v) : v);

export function createEngine(db: Oo1Database): Engine {
  const run = (sql: string, params: SqlValue[] = []): Row[] => {
    const rows = db.exec({
      sql,
      ...(params.length > 0 ? { bind: params } : {}),
      rowMode: 'object',
      returnValue: 'resultRows',
    }) as Row[];
    return rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, normalize(v)])));
  };
  run('PRAGMA foreign_keys = ON');
  return {
    query: run,
    batch(stmts) {
      run('BEGIN IMMEDIATE');
      try {
        for (const s of stmts) run(s.sql, s.params);
        run('COMMIT');
      } catch (err) {
        run('ROLLBACK');
        throw err;
      }
    },
  };
}
