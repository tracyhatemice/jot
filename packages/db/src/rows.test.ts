import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { Library } from './library';
import type { RowImage } from './ops';
import { createTag, renameTag } from './tags';

const stamp = (ms: number) => `${String(ms).padStart(15, '0')}-0000-00000000000000aa`;
const TAG_FIELDS = { name: 'x', color: null, sort_key: 'a0', created_at: 1, deleted: 0 };
/** A tag row whose every field was edited at `ms`, unless `over` says otherwise. */
const tagRow = (id: string, ms = 2000, over: Partial<RowImage> = {}): RowImage => ({
  table: 'tag',
  id,
  hlc: stamp(ms),
  fhlc: Object.fromEntries(Object.keys(TAG_FIELDS).map((k) => [k, stamp(ms)])),
  fields: { ...TAG_FIELDS },
  ...over,
});
const tagState = async (lib: Library, id: string) =>
  (await lib.driver.query<{ name: string; color: string | null; fhlc: string }>('SELECT name, color, fhlc FROM tag WHERE id = ?', [id]))[0];

describe('Library.applyRows', () => {
  it('inserts a missing row whole, keeping each field’s own clock and leaving unedited fields unstamped', async () => {
    const lib = await Library.open(createNodeDriver(), { now: () => 1000 });
    const fhlc = { name: stamp(3000), color: stamp(2500), sort_key: stamp(3000), created_at: stamp(3000) };
    await lib.applyRows([tagRow('t1', 3000, { fhlc })]);
    const row = await tagState(lib, 't1');
    expect(row.name).toBe('x');
    expect(JSON.parse(row.fhlc)).toEqual(fhlc);
  });

  it('never lets an unstamped field override a value', async () => {
    const lib = await Library.open(createNodeDriver(), { now: () => 5000 });
    const id = await createTag(lib, { name: 'local' });
    await lib.driver.batch([{ sql: 'UPDATE tag SET deleted = 1 WHERE id = ?', params: [id] }]);
    await lib.applyRows([tagRow(id, 9000, { fhlc: { name: stamp(9000) }, fields: { ...TAG_FIELDS, name: 'newer', deleted: 0 } })]);
    const [row] = await lib.driver.query<{ name: string; deleted: number }>('SELECT name, deleted FROM tag WHERE id = ?', [id]);
    expect(row).toEqual({ name: 'newer', deleted: 1 });
  });

  it('merges field by field: each field keeps whichever side edited it last (Review Focus 1)', async () => {
    const lib = await Library.open(createNodeDriver(), { now: () => 5000 });
    const id = await createTag(lib, { name: 'local' });
    await lib.applyRows([
      tagRow(id, 9000, {
        fhlc: { name: stamp(4000), color: stamp(9000), sort_key: stamp(4000), created_at: stamp(4000), deleted: stamp(4000) },
        fields: { name: 'older', color: '#c00', sort_key: 'zz', created_at: 1, deleted: 0 },
      }),
    ]);
    const row = await tagState(lib, id);
    expect([row.name, row.color]).toEqual(['local', '#c00']);
  });

  it('changes nothing when the same rows arrive twice', async () => {
    const lib = await Library.open(createNodeDriver());
    const rows = [tagRow('t1'), tagRow('t2', 2000, { fields: { ...TAG_FIELDS, name: 'y', sort_key: 'a1' } })];
    await lib.applyRows(rows);
    const once = await lib.driver.query('SELECT * FROM tag ORDER BY id');
    await lib.applyRows(rows);
    expect(await lib.driver.query('SELECT * FROM tag ORDER BY id')).toEqual(once);
  });

  it('lets later local edits win, even over rows stamped by a clock that ran ahead (Review Focus 2)', async () => {
    const lib = await Library.open(createNodeDriver(), { now: () => 1000 });
    await lib.applyRows([tagRow('t1', 9_000_000)]);
    await renameTag(lib, 't1', 'mine');
    expect((await tagState(lib, 't1')).name).toBe('mine');
  });

  it('writes nothing to the outbox, and tells subscribers', async () => {
    const lib = await Library.open(createNodeDriver());
    const seen: string[] = [];
    lib.subscribe((ops) => seen.push(...ops.map((o) => o.table)));
    await lib.applyRows([tagRow('t1')]);
    expect(await lib.driver.query('SELECT seq FROM outbox')).toEqual([]);
    expect(seen).toEqual(['tag']);
    lib.announce(['memo']);
    expect(seen).toEqual(['tag', 'memo']);
  });
});
