import type { SqlValue } from '@jot/core';

export type { SqlValue };
export type Row = Record<string, SqlValue>;

export interface Stmt {
  sql: string;
  params?: SqlValue[];
}

/**
 * The only way Jot talks to SQLite. Drivers sit behind a message boundary (Tauri IPC, a Web Worker),
 * so there are no interactive transactions: read-then-write sequences use `Library.lock` instead.
 */
export interface SqlDriver {
  /** Runs one statement and returns its rows as objects keyed by column name. */
  query<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs statements in one transaction; if any fails, none take effect. */
  batch(stmts: Stmt[]): Promise<void>;
}
