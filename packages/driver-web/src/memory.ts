import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { SqlDriver, SqlValue, Stmt } from '@jot/db';
import { createEngine, type Oo1Database } from './engine';

let sqlite3: ReturnType<typeof sqlite3InitModule> | null = null;

/** In-memory sqlite-wasm driver: the web build's exact SQLite, runnable in Node tests. */
export async function createMemoryDriver(): Promise<SqlDriver> {
  sqlite3 ??= sqlite3InitModule();
  const s = await sqlite3;
  const engine = createEngine(new s.oo1.DB(':memory:', 'c') as unknown as Oo1Database);
  return {
    async query<T>(sql: string, params?: SqlValue[]) {
      return engine.query(sql, params) as T[];
    },
    async batch(stmts: Stmt[]) {
      engine.batch(stmts);
    },
  };
}
