import { Clock, createLock, newDeviceId, OP_VERSION, type Lock, type Op, type SqlValue, type SyncedTable } from '@jot/core';
import type { SqlDriver, Stmt } from './driver';
import { migrate } from './migrate';
import { kvSetStatement, opStatements, outboxStatement } from './ops';

export interface OpInput {
  table: SyncedTable;
  id: string;
  fields: Record<string, SqlValue>;
}

export interface LibraryOptions {
  now?: () => number;
}

/** An open library: the one write path (`commit`) plus the device identity and clock. */
export class Library {
  /** Serializes read-then-write sequences such as the tag cycle check. */
  readonly lock: Lock = createLock();

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
      kvSetStatement('hlc_last', this.clock.last()),
    ]);
    return ops;
  }
}
