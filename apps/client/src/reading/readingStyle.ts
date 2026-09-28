/** Text styles for the article and memo columns (spec §6.11), kept on this device. */
export type LatinFace =
  | 'literata' | 'piazzolla' | 'source-serif' | 'atkinson' | 'inter' | 'ibm-plex-sans' | 'public-sans' | 'source-sans' | 'opendyslexic';
export type HanFace = 'song' | 'hei' | 'kai' | 'fangsong';
export type LineWidth = 'narrow' | 'medium' | 'wide' | 'full';
export type ReadingKind = 'article' | 'memo';

export interface ReadingStyle {
  /** The English typeface: Latin letters. */
  latin: LatinFace;
  /** The Chinese typeface: Chinese characters. */
  han: HanFace;
  /** Font size in px. */
  size: number;
  lineHeight: number;
  width: LineWidth;
}

/** Bundled from Fontsource (OFL-1.1); `family` is the CSS family name its package declares. */
export const LATIN_FACES: readonly { id: LatinFace; name: string; family: string; group: 'serif' | 'sans' }[] = [
  { id: 'literata', name: 'Literata', family: "'Literata'", group: 'serif' },
  { id: 'piazzolla', name: 'Piazzolla', family: "'Piazzolla'", group: 'serif' },
  { id: 'source-serif', name: 'Source Serif', family: "'Source Serif 4'", group: 'serif' },
  { id: 'atkinson', name: 'Atkinson Hyperlegible', family: "'Atkinson Hyperlegible'", group: 'sans' },
  { id: 'inter', name: 'Inter', family: "'Inter'", group: 'sans' },
  { id: 'ibm-plex-sans', name: 'IBM Plex Sans', family: "'IBM Plex Sans'", group: 'sans' },
  { id: 'public-sans', name: 'Public Sans', family: "'Public Sans'", group: 'sans' },
  { id: 'source-sans', name: 'Source Sans', family: "'Source Sans 3'", group: 'sans' },
  { id: 'opendyslexic', name: 'OpenDyslexic', family: "'OpenDyslexic'", group: 'sans' },
];

const SONG = "'Songti SC', 'STSong', 'SimSun', 'Noto Serif CJK SC', 'Source Han Serif SC', serif";

/** The computer's own Chinese fonts (macOS, Windows, Linux); a missing one falls back to 宋体 (spec §6.11). */
export const HAN_FACES: readonly { id: HanFace; family: string }[] = [
  { id: 'song', family: SONG },
  { id: 'hei', family: "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif" },
  { id: 'kai', family: `'Kaiti SC', 'STKaiti', 'KaiTi', 'BiauKai', 'AR PL UKai CN', ${SONG}` },
  { id: 'fangsong', family: `'STFangsong', 'FangSong', 'FangSong_GB2312', ${SONG}` },
];

export const WIDTHS: readonly LineWidth[] = ['narrow', 'medium', 'wide', 'full'];

/** Line widths in the text's own ems (spec §6.11). */
const WIDTH_EM: Record<Exclude<LineWidth, 'full'>, number> = { narrow: 28, medium: 34, wide: 42 };

export const DEFAULT_STYLE: Record<ReadingKind, ReadingStyle> = {
  article: { latin: 'source-serif', han: 'song', size: 18, lineHeight: 1.9, width: 'medium' },
  memo: { latin: 'source-serif', han: 'song', size: 16, lineHeight: 1.8, width: 'full' },
};

export const LIMITS = {
  size: { min: 14, max: 26, step: 1 },
  lineHeight: { min: 1.4, max: 2.6, step: 0.1 },
} as const;

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isLatin = (v: unknown): v is LatinFace => LATIN_FACES.some((f) => f.id === v);
const isHan = (v: unknown): v is HanFace => HAN_FACES.some((f) => f.id === v);
const isWidth = (v: unknown): v is LineWidth => WIDTHS.includes(v as LineWidth);

/**
 * The named width nearest a plan 8 width in em (0 = full). Plan 8's article ems were of the 15 px
 * interface font; its memo ems were of the memo text. A width outside plan 8's own range is damaged.
 */
function widthFromEm(em: number, kind: ReadingKind, size: number): LineWidth {
  if (em === 0) return 'full';
  if (em < 30 || em > 50) return DEFAULT_STYLE[kind].width;
  const textEms = (em * (kind === 'article' ? 15 : size)) / size;
  let best: LineWidth = 'medium';
  let gap = Number.POSITIVE_INFINITY;
  for (const w of ['narrow', 'medium', 'wide'] as const) {
    const d = Math.abs(WIDTH_EM[w] - textEms);
    if (d < gap) {
      gap = d;
      best = w;
    }
  }
  return best;
}

/** A stored style, repaired: unknown or missing values fall back to the defaults; plan 8's settings carry over. */
export function parseStyle(raw: unknown, kind: ReadingKind): ReadingStyle {
  const d = DEFAULT_STYLE[kind];
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const size = clamp(Math.round(num(o.size, d.size)), LIMITS.size.min, LIMITS.size.max);
  // Plan 8 stored `typeface` (song, hei or kai) and a numeric `width`.
  const han = isHan(o.han) ? o.han : isHan(o.typeface) ? o.typeface : d.han;
  const width = isWidth(o.width) ? o.width : typeof o.width === 'number' && Number.isFinite(o.width) ? widthFromEm(o.width, kind, size) : d.width;
  return {
    latin: isLatin(o.latin) ? o.latin : d.latin,
    han,
    size,
    lineHeight: round1(clamp(num(o.lineHeight, d.lineHeight), LIMITS.lineHeight.min, LIMITS.lineHeight.max)),
    width,
  };
}

/** One step up or down; the width steps through its names. */
export function stepStyle(style: ReadingStyle, field: 'size' | 'lineHeight' | 'width', direction: 1 | -1): ReadingStyle {
  if (field === 'width') return { ...style, width: WIDTHS[clamp(WIDTHS.indexOf(style.width) + direction, 0, WIDTHS.length - 1)] };
  if (field === 'lineHeight') {
    return { ...style, lineHeight: round1(clamp(style.lineHeight + direction * LIMITS.lineHeight.step, LIMITS.lineHeight.min, LIMITS.lineHeight.max)) };
  }
  return { ...style, size: clamp(style.size + direction * LIMITS.size.step, LIMITS.size.min, LIMITS.size.max) };
}

/** The CSS font-family of a style: the English face for Latin letters, then the Chinese one (spec §6.11). */
export function fontStack(style: ReadingStyle): string {
  const latin = LATIN_FACES.find((f) => f.id === style.latin) ?? LATIN_FACES[2];
  const han = HAN_FACES.find((f) => f.id === style.han) ?? HAN_FACES[0];
  return `${latin.family}, ${han.family}`;
}

/** The CSS custom properties a column reads: `--read-*` for articles, `--memo-*` for memos. */
export function styleVars(style: ReadingStyle, kind: ReadingKind): Record<string, string> {
  const p = kind === 'article' ? '--read' : '--memo';
  return {
    [`${p}-font`]: fontStack(style),
    [`${p}-size`]: `${style.size}px`,
    [`${p}-line`]: String(style.lineHeight),
    [`${p}-width`]: style.width === 'full' ? (kind === 'article' ? '1fr' : 'none') : `${WIDTH_EM[style.width] * style.size}px`,
  };
}
