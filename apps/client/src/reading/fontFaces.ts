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

/**
 * Each package's own character sets and their unicode ranges. A package that declares none (OpenDyslexic) ships
 * one file for its whole font.
 */
const SUBSETS = import.meta.glob<Record<string, string>>('../../node_modules/@fontsource/*/unicode.json', {
  import: 'default',
  eager: true,
});
const WHOLE_FONT = 'U+0000-10FFFF';

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
    const range = SUBSETS[`../../node_modules/@fontsource/${m[1]}/unicode.json`]?.[m[2]] ?? WHOLE_FONT;
    const base = { url, weight: m[3] as FontFaceSpec['weight'], style: m[4] as FontFaceSpec['style'] };
    out.push({ ...base, family: face.family, unicodeRange: range, chinese: false });
    out.push({ ...base, family: chineseFamily(face.family), unicodeRange: withoutCodePoints(range, CJK_PUNCTUATION), chinese: true });
  }
  return out;
}
