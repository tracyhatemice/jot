import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createEngine, type Engine, type Oo1Database } from './engine';
import type { WorkerRequest, WorkerResponse } from './protocol';

let engine: Promise<Engine> | null = null;

async function open(filename: string): Promise<Engine> {
  const sqlite3 = await sqlite3InitModule();
  // opfs-sahpool needs no COOP/COEP headers and is the fastest OPFS VFS; it allows one connection (one tab).
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'jot' });
  return createEngine(new pool.OpfsSAHPoolDb(filename) as unknown as Oo1Database);
}

const post = (message: WorkerResponse) => (self as unknown as { postMessage(m: WorkerResponse): void }).postMessage(message);

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.method === 'open') {
      engine = open(req.filename);
      await engine;
      post({ id: req.id, ok: true, result: null });
      return;
    }
    if (!engine) throw new Error('database is not open');
    const e = await engine;
    if (req.method === 'query') {
      post({ id: req.id, ok: true, result: e.query(req.sql, req.params) });
    } else {
      e.batch(req.stmts);
      post({ id: req.id, ok: true, result: null });
    }
  } catch (err) {
    post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
