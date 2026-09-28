/** Reading settings for the article and memo columns (spec §6.10), kept on this device. */
export type Typeface = 'song' | 'hei' | 'kai';
export type ReadingKind = 'article' | 'memo';

export interface ReadingStyle {
  typeface: Typeface;
  /** Font size in px. */
  size: number;
  lineHeight: number;
  /** Line width in em; 0 means the full column. */
  width: number;
}

export const DEFAULT_STYLE: Record<ReadingKind, ReadingStyle> = {
  article: { typeface: 'song', size: 18, lineHeight: 1.9, width: 40 },
  memo: { typeface: 'song', size: 16, lineHeight: 1.8, width: 0 },
};

export const LIMITS = {
  size: { min: 14, max: 26, step: 1 },
  lineHeight: { min: 1.4, max: 2.6, step: 0.1 },
  width: { min: 30, max: 50, step: 5 },
} as const;

const FONT_STACK: Record<Typeface, string> = {
  song: 'var(--font-read)',
  hei: 'var(--font-ui)',
  kai: "'Kaiti SC', 'STKaiti', 'KaiTi', 'BiauKai', 'AR PL UKai CN', var(--font-read)",
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A stored style, repaired: unknown or missing values fall back to the defaults, numbers are kept in range. */
export function parseStyle(raw: unknown, kind: ReadingKind): ReadingStyle {
  const d = DEFAULT_STYLE[kind];
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const typeface = o.typeface === 'song' || o.typeface === 'hei' || o.typeface === 'kai' ? o.typeface : d.typeface;
  const width = num(o.width, d.width);
  return {
    typeface,
    size: clamp(Math.round(num(o.size, d.size)), LIMITS.size.min, LIMITS.size.max),
    lineHeight: round1(clamp(num(o.lineHeight, d.lineHeight), LIMITS.lineHeight.min, LIMITS.lineHeight.max)),
    width: width === 0 ? 0 : clamp(Math.round(width / LIMITS.width.step) * LIMITS.width.step, LIMITS.width.min, LIMITS.width.max),
  };
}

/** One step up or down; the width steps from its widest setting to the full column and back. */
export function stepStyle(style: ReadingStyle, field: 'size' | 'lineHeight' | 'width', direction: 1 | -1): ReadingStyle {
  if (field === 'width') {
    if (style.width === 0) return direction === -1 ? { ...style, width: LIMITS.width.max } : style;
    const next = style.width + direction * LIMITS.width.step;
    return { ...style, width: next > LIMITS.width.max ? 0 : clamp(next, LIMITS.width.min, LIMITS.width.max) };
  }
  if (field === 'lineHeight') {
    return { ...style, lineHeight: round1(clamp(style.lineHeight + direction * LIMITS.lineHeight.step, LIMITS.lineHeight.min, LIMITS.lineHeight.max)) };
  }
  return { ...style, size: clamp(style.size + direction * LIMITS.size.step, LIMITS.size.min, LIMITS.size.max) };
}

/** The CSS custom properties a column reads: `--read-*` for articles, `--memo-*` for memos. */
export function styleVars(style: ReadingStyle, kind: ReadingKind): Record<string, string> {
  const p = kind === 'article' ? '--read' : '--memo';
  return {
    [`${p}-font`]: FONT_STACK[style.typeface],
    [`${p}-size`]: `${style.size}px`,
    [`${p}-line`]: String(style.lineHeight),
    [`${p}-width`]: style.width === 0 ? (kind === 'article' ? '1fr' : 'none') : `${style.width}em`,
  };
}
