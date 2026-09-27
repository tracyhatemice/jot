import type { Row, SqlDriver, SqlValue, Stmt } from '@jot/db';
import type { DistributiveOmit, WorkerRequest, WorkerResponse } from './protocol';

export class DatabaseLockedError extends Error {
  constructor() {
    super('Jot is already open in another tab');
    this.name = 'DatabaseLockedError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

/** Holds a Web Lock for the page's lifetime so only one tab opens the OPFS database. */
function acquireTabLock(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    void navigator.locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return;
      }
      resolve(true);
      return new Promise<void>(() => {}); // never released
    });
  });
}

/** The web build's driver: SQLite in a module worker, stored in OPFS. */
export async function createWebDriver(filename = '/jot.sqlite3'): Promise<SqlDriver> {
  if (!('locks' in navigator) || typeof navigator.storage?.getDirectory !== 'function') {
    throw new StorageUnavailableError('This browser does not support the storage Jot needs (OPFS and Web Locks).');
  }
  if (!(await acquireTabLock('jot-db'))) throw new DatabaseLockedError();
  void navigator.storage.persist?.();

  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let nextId = 1;
  const pending = new Map<number, { resolve(rows: Row[] | null): void; reject(err: Error): void }>();
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    const waiter = pending.get(res.id);
    if (!waiter) return;
    pending.delete(res.id);
    if (res.ok) waiter.resolve(res.result);
    else waiter.reject(new Error(res.error));
  });
  const call = (req: DistributiveOmit<WorkerRequest, 'id'>) =>
    new Promise<Row[] | null>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...req, id });
    });

  try {
    await call({ method: 'open', filename });
  } catch (err) {
    worker.terminate();
    throw new StorageUnavailableError(err instanceof Error ? err.message : String(err));
  }

  return {
    async query<T>(sql: string, params?: SqlValue[]) {
      return ((await call({ method: 'query', sql, params })) ?? []) as T[];
    },
    async batch(stmts: Stmt[]) {
      await call({ method: 'batch', stmts });
    },
  };
}
