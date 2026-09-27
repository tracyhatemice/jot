import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlValue, Stmt } from '../src/driver';

/** Test driver backed by Node's built-in SQLite (compiled with FTS5 in official Node builds). */
export function createNodeDriver(filename = ':memory:'): SqlDriver {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  const run = (sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...params).map((row) => ({ ...row }));
  return {
    async query<T>(sql: string, params?: SqlValue[]) {
      return run(sql, params) as T[];
    },
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const s of stmts) run(s.sql, s.params);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
