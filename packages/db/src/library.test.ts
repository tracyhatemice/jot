import { decodeOp } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { Library } from './library';

const tagFields = (name: string) => ({ name, color: null, sort_key: 'a0', created_at: 1 });

describe('Library', () => {
  it('creates a device id once and keeps it', async () => {
    const d = createNodeDriver();
    const first = await Library.open(d);
    const second = await Library.open(d);
    expect(first.deviceId).toMatch(/^[0-9a-f]{16}$/);
    expect(second.deviceId).toBe(first.deviceId);
  });

  it('commits rows and their outbox entries together', async () => {
    const lib = await Library.open(createNodeDriver(), { now: () => 1000 });
    const [op] = await lib.commit([{ table: 'tag', id: 't1', fields: tagFields('比喻') }]);
    expect(op).toMatchObject({ v: 1, table: 'tag', id: 't1', fields: tagFields('比喻') });
    const outbox = await lib.driver.query<{ op: string; created_at: number }>('SELECT op, created_at FROM outbox');
    expect(outbox.map((r) => decodeOp(r.op))).toEqual([op]);
    expect(outbox[0].created_at).toBe(1000);
    expect(await lib.driver.query('SELECT name FROM tag')).toEqual([{ name: '比喻' }]);
  });

  it('passes stamped ops to a derived-statement builder in the same transaction', async () => {
    const lib = await Library.open(createNodeDriver());
    const [op] = await lib.commit([{ table: 'tag', id: 't1', fields: tagFields('x') }], (ops) => [
      { sql: "INSERT INTO kv (k, v) VALUES ('probe', ?)", params: [ops[0].hlc] },
    ]);
    expect(await lib.driver.query("SELECT v FROM kv WHERE k = 'probe'")).toEqual([{ v: op.hlc }]);
  });

  it('rolls back rows and outbox when a derived statement fails', async () => {
    const lib = await Library.open(createNodeDriver());
    await expect(
      lib.commit([{ table: 'tag', id: 't1', fields: tagFields('x') }], [{ sql: 'INSERT INTO no_such_table VALUES (1)' }]),
    ).rejects.toThrow();
    expect(await lib.driver.query('SELECT id FROM tag')).toEqual([]);
    expect(await lib.driver.query('SELECT seq FROM outbox')).toEqual([]);
  });

  it('stamps later commits after earlier ones across restarts, even if the clock went backwards (Review Focus 4)', async () => {
    const d = createNodeDriver();
    const before = await Library.open(d, { now: () => 5_000_000 });
    const [a] = await before.commit([{ table: 'tag', id: 't1', fields: tagFields('x') }]);
    const after = await Library.open(d, { now: () => 0 });
    const [b] = await after.commit([{ table: 'tag', id: 't1', fields: { name: 'y' } }]);
    expect(b.hlc > a.hlc).toBe(true);
    expect(await d.query('SELECT name FROM tag')).toEqual([{ name: 'y' }]);
  });
});
