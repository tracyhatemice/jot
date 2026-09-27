import { invoke } from '@tauri-apps/api/core';
import { createLock } from '@jot/core';
import type { SqlDriver, SqlValue, Stmt } from '@jot/db';
import { fromWireRow, toWire, type WireValue } from './wire';

export type InvokeFn = <T>(cmd: string, args: Record<string, unknown>) => Promise<T>;

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Native SQLite through the Rust commands in apps/desktop/src-tauri/src/db.rs.
 * Tauri runs each async command as its own task, so concurrent calls could reach the database in
 * any order; calls are queued here to keep the call order the other drivers guarantee.
 */
export function createTauriDriver(call: InvokeFn = invoke): SqlDriver {
  const queue = createLock();
  return {
    async query<T>(sql: string, params: SqlValue[] = []) {
      const rows = await queue.run(() => call<Record<string, WireValue>[]>('db_query', { sql, params: params.map(toWire) }));
      return rows.map(fromWireRow) as T[];
    },
    async batch(stmts: Stmt[]) {
      const wire = stmts.map((s) => ({ sql: s.sql, params: (s.params ?? []).map(toWire) }));
      await queue.run(() => call('db_batch', { stmts: wire }));
    },
  };
}
