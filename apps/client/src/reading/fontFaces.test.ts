import { describe, expect, it } from 'vitest';
import { CJK_PUNCTUATION, chineseFamily, fontFaces, withoutCodePoints } from './fontFaces';
import { LATIN_FACES } from './readingStyle';

/** Whether a CSS unicode-range covers a code point. */
const covers = (range: string, cp: number) =>
  range.split(',').some((part) => {
    const [lo, hi = lo] = part.replace('U+', '').split('-').map((h) => parseInt(h, 16));
    return cp >= lo && cp <= hi;
  });

describe('bundled typefaces', () => {
  it('ships woff2 files for Latin and Latin Extended letters only: 400, 700 and 400 italic of every face (review M5)', () => {
    const plain = fontFaces().filter((f) => !f.chinese);
    expect(plain).toHaveLength(51);
    expect(plain.every((f) => f.url.endsWith('.woff2'))).toBe(true);
    for (const face of LATIN_FACES) {
      const mine = plain.filter((f) => f.family === face.family);
      expect(new Set(mine.map((f) => `${f.weight} ${f.style}`)), face.id).toEqual(new Set(['400 normal', '700 normal', '400 italic']));
      expect(mine, face.id).toHaveLength(face.id === 'opendyslexic' ? 3 : 6);
    }
  });

  it('gives each face a twin for Chinese text that leaves the shared punctuation to the Chinese face (review M6)', () => {
    const faces = fontFaces();
    const twins = faces.filter((f) => f.chinese);
    expect(twins).toHaveLength(51);
    for (const twin of twins) {
      const plain = faces.find((f) => !f.chinese && f.url === twin.url && f.weight === twin.weight && f.style === twin.style);
      expect(plain).toBeDefined();
      expect(twin.family).toBe(chineseFamily(plain?.family ?? ''));
      for (const cp of CJK_PUNCTUATION) expect(covers(twin.unicodeRange, cp), cp.toString(16)).toBe(false);
      // Letters and the rest of the punctuation stay with the English face.
      for (const cp of [0x41, 0x61, 0x2c, 0x2013]) expect(covers(twin.unicodeRange, cp)).toBe(covers(plain?.unicodeRange ?? '', cp));
    }
    expect(faces.filter((f) => !f.chinese).some((f) => covers(f.unicodeRange, 0x201c))).toBe(true);
  });

  it('keeps every letter of a face that declares no character sets, like OpenDyslexic’s single file (review I1)', () => {
    const faces = fontFaces();
    const plain = faces.filter((f) => f.family === 'OpenDyslexic');
    const twin = faces.filter((f) => f.family === chineseFamily('OpenDyslexic'));
    // ł, ā and ǎ (pinyin): Latin Extended letters its file draws.
    for (const cp of [0x142, 0x101, 0x1ce]) {
      expect(plain.every((f) => covers(f.unicodeRange, cp))).toBe(true);
      expect(twin.every((f) => covers(f.unicodeRange, cp))).toBe(true);
    }
    expect(twin.some((f) => covers(f.unicodeRange, 0x201c))).toBe(false);
  });

  it('cuts code points out of a unicode-range', () => {
    expect(withoutCodePoints('U+0000-00FF,U+0131,U+2000-206F,U+FFFD', [0xb7, 0x2014, 0x2015, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026])).toBe(
      'U+0000-00B6,U+00B8-00FF,U+0131,U+2000-2013,U+2016-2017,U+201A-201B,U+201E-2025,U+2027-206F,U+FFFD',
    );
    expect(withoutCodePoints('U+0131', [0x131])).toBe('');
  });
});
