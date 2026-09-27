import { Clock, createLock, newDeviceId, OP_VERSION, SYNCED_COLUMNS, type Lock, type Op, type SqlValue, type SyncedTable } from '@jot/core';
import type { SqlDriver, Stmt } from './driver';
import { migrate } from './migrate';
import { hlcLastStatement, kvSetStatement, opStatements, outboxStatement, rowStatements, type RowImage } from './ops';

export interface OpInput {
  table: SyncedTable;
  id: string;
  fields: Record<string, SqlValue>;
}

export interface LibraryOptions {
  now?: () => number;
}

export type ChangeListener = (ops: Op[]) => void;

/** An open library: the one write path (`commit`) plus the device identity and clock. */
export class Library {
  /** Serializes read-then-write sequences such as the tag cycle check. */
  readonly lock: Lock = createLock();

  private readonly listeners = new Set<ChangeListener>();

  /** Called after every successful commit (UI refresh); returns an unsubscribe function. */
  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private constructor(
    readonly driver: SqlDriver,
    readonly deviceId: string,
    private readonly clock: Clock,
    readonly now: () => number,
  ) {}

  static async open(driver: SqlDriver, options: LibraryOptions = {}): Promise<Library> {
    const now = options.now ?? Date.now;
    await migrate(driver);
    const rows = await driver.query<{ k: string; v: string }>("SELECT k, v FROM kv WHERE k IN ('device_id', 'hlc_last')");
    const kv = new Map(rows.map((r) => [r.k, r.v] as const));
    let deviceId = kv.get('device_id');
    if (!deviceId) {
      deviceId = newDeviceId();
      await driver.batch([kvSetStatement('device_id', deviceId)]);
    }
    return new Library(driver, deviceId, new Clock(deviceId, kv.get('hlc_last') ?? null, now), now);
  }

  /**
   * Stamps each input with a fresh HLC and writes rows, outbox entries, `extra` derived statements
   * (search index, caches) and the persisted clock in ONE transaction.
   */
  async commit(inputs: OpInput[], extra: Stmt[] | ((ops: Op[]) => Stmt[]) = []): Promise<Op[]> {
    const ops: Op[] = inputs.map((input) => ({
      v: OP_VERSION,
      table: input.table,
      id: input.id,
      hlc: this.clock.tick(),
      fields: input.fields,
    }));
    const createdAt = this.now();
    await this.driver.batch([
      ...ops.flatMap((op) => opStatements(op)),
      ...ops.map((op) => outboxStatement(op, createdAt)),
      ...(typeof extra === 'function' ? extra(ops) : extra),
      hlcLastStatement(this.clock.last()),
    ]);
    this.emit(ops);
    return ops;
  }

  /**
   * Merges rows made elsewhere (an imported library now; sync later) with their own clocks: the same
   * per-field latest-edit-wins as local edits, but no new stamps and no outbox (spec §4.3). The clock
   * receives every incoming stamp, so later local edits sort after them.
   */
  async applyRows(rows: RowImage[]): Promise<void> {
    if (rows.length === 0) return;
    for (const row of rows) {
      this.clock.receive(row.hlc);
      for (const stamp of Object.values(row.fhlc)) this.clock.receive(stamp);
    }
    await this.driver.batch([...rows.flatMap((row) => rowStatements(row)), hlcLastStatement(this.clock.last())]);
    this.emit(rows.map((row): Op => ({ v: OP_VERSION, table: row.table, id: row.id, hlc: row.hlc, fields: row.fields })));
  }

  /** Tells subscribers that data of these tables changed without a commit (for example, derived tables were rebuilt). */
  announce(tables: readonly SyncedTable[] = Object.keys(SYNCED_COLUMNS) as SyncedTable[]): void {
    this.emit(tables.map((table): Op => ({ v: OP_VERSION, table, id: '', hlc: '', fields: {} })));
  }

  private emit(ops: Op[]): void {
    for (const listener of this.listeners) {
      try {
        listener(ops);
      } catch (err) {
        console.error('Library change listener failed', err);
      }
    }
  }
}
