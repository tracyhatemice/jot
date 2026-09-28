import { chineseFamily, LATIN_FACES } from './readingStyle';

export { chineseFamily };

/**
 * The bundled English typefaces' files (spec §6.11): Fontsource, OFL-1.1. Only woff2 files for Latin and Latin
 * Extended letters ship; other scripts use the computer's own fonts.
 */
const FILES = import.meta.glob<string>(
  '../../node_modules/@fontsource/*/files/*-{latin,latin-ext}-{400-normal,700-normal,400-italic}.woff2',
  { query: '?url', import: 'default', eager: true },
);

/** Fontsource's unicode ranges for the two character sets. */
const RANGES = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
} as const;

/** Punctuation Chinese text shares with Latin fonts (· — ― ‘ ’ “ ” …): in Chinese text the Chinese face draws it, full-width. */
export const CJK_PUNCTUATION: readonly number[] = [0xb7, 0x2014, 0x2015, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026];

export interface FontFaceSpec {
  family: string;
  url: string;
  weight: '400' | '700';
  style: 'normal' | 'italic';
  unicodeRange: string;
  /** The twin for Chinese text, which leaves CJK_PUNCTUATION to the Chinese face. */
  chinese: boolean;
}

const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
const span = (lo: number, hi: number) => (lo === hi ? `U+${hex(lo)}` : `U+${hex(lo)}-${hex(hi)}`);

/** A CSS unicode-range without the given code points. */
export function withoutCodePoints(range: string, codePoints: readonly number[]): string {
  const out: string[] = [];
  for (const part of range.split(',')) {
    const [lo, hi = lo] = part.replace('U+', '').split('-').map((h) => parseInt(h, 16));
    let start = lo;
    for (const cp of codePoints.filter((c) => c >= lo && c <= hi).sort((a, b) => a - b)) {
      if (cp > start) out.push(span(start, cp - 1));
      start = cp + 1;
    }
    if (start <= hi) out.push(span(start, hi));
  }
  return out.join(',');
}

/** Every bundled face, and its twin for Chinese text. */
export function fontFaces(): FontFaceSpec[] {
  const out: FontFaceSpec[] = [];
  for (const [path, url] of Object.entries(FILES)) {
    const m = /@fontsource\/([^/]+)\/files\/\1-(latin|latin-ext)-(400|700)-(normal|italic)\.woff2$/.exec(path);
    const face = m && LATIN_FACES.find((f) => f.pkg === m[1]);
    if (!m || !face) continue;
    const range = RANGES[m[2] as keyof typeof RANGES];
    const base = { url, weight: m[3] as FontFaceSpec['weight'], style: m[4] as FontFaceSpec['style'] };
    out.push({ ...base, family: face.family, unicodeRange: range, chinese: false });
    out.push({ ...base, family: chineseFamily(face.family), unicodeRange: withoutCodePoints(range, CJK_PUNCTUATION), chinese: true });
  }
  return out;
}
