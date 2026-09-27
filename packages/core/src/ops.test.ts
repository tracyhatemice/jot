import { describe, expect, it } from 'vitest';
import { assertValidOp, decodeOp, encodeOp, IMMUTABLE_TABLES, OP_VERSION, SYNCED_COLUMNS, type Op } from './ops';
import { base64ToBytes, bytesToBase64 } from './util/base64';

const HLC = '001727430000123-0000-a1b2c3d4e5f60718';

describe('base64', () => {
  it('round-trips arbitrary bytes, including large buffers', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 31) % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(bytesToBase64(new Uint8Array([0, 1, 254, 255]))).toBe('AAH+/w==');
  });
});

describe('ops', () => {
  it('round-trips through JSON, including blobs', () => {
    const op: Op = {
      v: OP_VERSION,
      table: 'memo_update',
      id: 'u1',
      hlc: HLC,
      fields: { memo_id: 'm1', data: new Uint8Array([1, 2, 3]), created_at: 1 },
    };
    const back = decodeOp(encodeOp(op));
    expect(back).toEqual(op);
    expect(back.fields.data).toBeInstanceOf(Uint8Array);
  });

  it('accepts whitelisted columns', () => {
    expect(() => assertValidOp({ v: 1, table: 'tag', id: 't', hlc: HLC, fields: { name: 'x', deleted: 0 } })).not.toThrow();
  });

  it('rejects columns outside the whitelist (SQL injection guard)', () => {
    expect(() =>
      assertValidOp({ v: 1, table: 'tag', id: 't', hlc: HLC, fields: { 'name" = 1; DROP TABLE tag; --': 'x' } }),
    ).toThrow(/not writable/);
    expect(() => assertValidOp({ v: 1, table: 'tag', id: 't', hlc: HLC, fields: { hlc: 'x' } })).toThrow(/not writable/);
  });

  it('rejects unknown tables', () => {
    expect(() => assertValidOp({ v: 1, table: 'nope' as never, id: 't', hlc: HLC, fields: {} })).toThrow(/unknown synced table/);
  });

  it('marks revisions and memo updates as immutable', () => {
    expect([...IMMUTABLE_TABLES].sort()).toEqual(['article_revision', 'memo_update']);
    expect(Object.keys(SYNCED_COLUMNS)).toHaveLength(10);
  });
});
