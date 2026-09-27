import { describe, expect, it } from 'vitest';
import { decodeText } from './decode';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('decodeText', () => {
  it('reads UTF-8, with or without a byte-order mark', () => {
    expect(decodeText(utf8('春天来了'))).toBe('春天来了');
    expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('春天')]))).toBe('春天');
  });

  it('reads GBK / GB18030 text files, common for Chinese files saved on Windows', () => {
    expect(decodeText(Uint8Array.from([0xb4, 0xba, 0xcc, 0xec, 0xc0, 0xb4, 0xc1, 0xcb]))).toBe('春天来了');
  });

  it('reads UTF-16 files that start with a byte-order mark', () => {
    const le = Uint8Array.from([0xff, 0xfe, 0x25, 0x66, 0x29, 0x59]); // 春天
    const be = Uint8Array.from([0xfe, 0xff, 0x66, 0x25, 0x59, 0x29]);
    expect(decodeText(le)).toBe('春天');
    expect(decodeText(be)).toBe('春天');
  });
});
