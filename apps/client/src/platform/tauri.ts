import { invoke } from '@tauri-apps/api/core';
import type { SqlDriver, SqlValue, Stmt } from '@jot/db';
import { fromWireRow, toWire, type WireValue } from './wire';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Native SQLite through the Rust commands in apps/desktop/src-tauri/src/db.rs. */
export function createTauriDriver(): SqlDriver {
  return {
    async query<T>(sql: string, params: SqlValue[] = []) {
      const rows = await invoke<Record<string, WireValue>[]>('db_query', { sql, params: params.map(toWire) });
      return rows.map(fromWireRow) as T[];
    },
    async batch(stmts: Stmt[]) {
      await invoke('db_batch', { stmts: stmts.map((s) => ({ sql: s.sql, params: (s.params ?? []).map(toWire) })) });
    },
  };
}
