import { describe, expect, it } from 'vitest';
import { fromWireRow, toWire } from './wire';

describe('Tauri wire format', () => {
  it('encodes blobs as base64 objects and passes scalars through', () => {
    expect(toWire(new Uint8Array([0, 1, 254, 255]))).toEqual({ $blob: 'AAH+/w==' });
    expect(toWire('中文')).toBe('中文');
    expect(toWire(null)).toBeNull();
    expect(toWire(1.5)).toBe(1.5);
    expect(toWire(12n)).toBe(12);
  });

  it('rejects integers the JSON bridge cannot carry exactly', () => {
    expect(() => toWire(2n ** 60n)).toThrow(RangeError);
  });

  it('decodes rows', () => {
    expect(fromWireRow({ a: 1, b: 'x', c: null, d: { $blob: 'AAH+/w==' } })).toEqual({
      a: 1,
      b: 'x',
      c: null,
      d: new Uint8Array([0, 1, 254, 255]),
    });
  });
});
