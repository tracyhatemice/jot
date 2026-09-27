import { Clock, OP_VERSION, type Op } from '@jot/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import type { SqlDriver } from './driver';
import { migrate } from './migrate';
import { opStatements } from './ops';

const fresh = async () => {
  const d = createNodeDriver();
  await migrate(d);
  return d;
};
const apply = (d: SqlDriver, ops: Op[]) => d.batch(ops.flatMap(opStatements));
const op = (table: Op['table'], id: string, hlc: string, fields: Op['fields']): Op => ({ v: OP_VERSION, table, id, hlc, fields });
const readTag = async (d: SqlDriver, id: string) => {
  const [row] = await d.query<{ name: string; color: string | null; sort_key: string; deleted: number; hlc: string; fhlc: string }>(
    'SELECT name, color, sort_key, deleted, hlc, fhlc FROM tag WHERE id = ?',
    [id],
  );
  return row && { ...row, fhlc: JSON.parse(row.fhlc) as Record<string, string> };
};
const stamps = (n: number) => {
  const clock = new Clock('0000000000000001', null, () => 1000);
  return Array.from({ length: n }, () => clock.tick());
};

describe('opStatements', () => {
  it('inserts a row and records a clock per field', async () => {
    const d = await fresh();
    const [h] = stamps(1);
    await apply(d, [op('tag', 't1', h, { name: '比喻', color: null, sort_key: 'a0', created_at: 1 })]);
    expect(await readTag(d, 't1')).toEqual({
      name: '比喻', color: null, sort_key: 'a0', deleted: 0, hlc: h,
      fhlc: { name: h, color: h, sort_key: h, created_at: h },
    });
  });

  it('applies newer field writes and ignores older ones', async () => {
    const d = await fresh();
    const [h1, h2, h3] = stamps(3);
    await apply(d, [op('tag', 't1', h1, { name: 'a', color: null, sort_key: 'a0', created_at: 1 })]);
    await apply(d, [op('tag', 't1', h3, { name: 'new' })]);
    await apply(d, [op('tag', 't1', h2, { name: 'stale' })]);
    const row = await readTag(d, 't1');
    expect(row).toMatchObject({ name: 'new', hlc: h3 });
    expect(row?.fhlc.name).toBe(h3);
  });

  it('keeps concurrent edits to different fields', async () => {
    const d = await fresh();
    const [h1, h2, h3] = stamps(3);
    await apply(d, [op('tag', 't1', h1, { name: 'a', color: null, sort_key: 'a0', created_at: 1 })]);
    await apply(d, [op('tag', 't1', h3, { color: '#f00' })]);
    await apply(d, [op('tag', 't1', h2, { name: 'renamed' })]);
    expect(await readTag(d, 't1')).toMatchObject({ name: 'renamed', color: '#f00', hlc: h3 });
  });

  it('writes immutable rows exactly once', async () => {
    const d = await fresh();
    const [h1, h2] = stamps(2);
    const fields = { article_id: 'a1', parent_id: null, blocks: '[]', created_at: 1 };
    await apply(d, [op('article_revision', 'r1', h1, { ...fields, text: 'first' })]);
    await apply(d, [op('article_revision', 'r1', h2, { ...fields, text: 'second' })]);
    const rows = await d.query<{ text: string }>('SELECT text FROM article_revision');
    expect(rows).toEqual([{ text: 'first' }]);
  });

  it('handles reserved column names such as "end"', async () => {
    const d = await fresh();
    const [h] = stamps(1);
    await apply(d, [op('anchor', 'x1', h, {
      article_id: 'a1', revision_id: 'r1', start: 3, end: 5, exact: '比喻', prefix: '他用', suffix: '写春天', unit: 'range', created_at: 1,
    })]);
    expect(await d.query('SELECT start, "end" FROM anchor')).toEqual([{ start: 3, end: 5 }]);
  });

  it('converges no matter the order ops arrive in', async () => {
    const change = fc.oneof(
      fc.record({ field: fc.constant('name'), value: fc.string({ minLength: 1, maxLength: 5 }) }),
      fc.record({ field: fc.constant('color'), value: fc.option(fc.string({ maxLength: 5 })) }),
      fc.record({ field: fc.constant('deleted'), value: fc.constantFrom(0, 1) }),
    );
    const scenario = fc
      .array(change, { minLength: 1, maxLength: 8 })
      .chain((changes) =>
        fc.tuple(
          fc.constant(changes),
          fc.shuffledSubarray(changes.map((_, i) => i), { minLength: changes.length, maxLength: changes.length }),
        ),
      );
    await fc.assert(
      fc.asyncProperty(scenario, async ([changes, order]) => {
        const [base, ...hs] = stamps(changes.length + 1);
        const create = op('tag', 't1', base, { name: 'base', color: null, sort_key: 'a0', created_at: 1 });
        const ops = changes.map((c, i) => op('tag', 't1', hs[i], { [c.field]: c.value }));
        const [a, b] = [await fresh(), await fresh()];
        await apply(a, [create, ...ops]);
        await apply(b, [create, ...order.map((i) => ops[i])]);
        expect(await readTag(b, 't1')).toEqual(await readTag(a, 't1'));
      }),
      { numRuns: 50 },
    );
  });
});
