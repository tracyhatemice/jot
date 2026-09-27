import type { TextRange } from '../text-range';

/** How much surrounding text an anchor remembers on each side, in UTF-16 code units. */
export const CONTEXT_LENGTH = 32;

export type AnchorUnit = 'range' | 'block';

export interface TextAnchor {
  start: number;
  end: number;
  exact: string;
  prefix: string;
  suffix: string;
  unit: AnchorUnit;
}

const isHighSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** If `offset` falls between the two halves of a surrogate pair, move it one unit in `direction`. */
export function snapOffset(text: string, offset: number, direction: -1 | 1): number {
  const inPair =
    offset > 0 &&
    offset < text.length &&
    isLowSurrogate(text.charCodeAt(offset)) &&
    isHighSurrogate(text.charCodeAt(offset - 1));
  return inPair ? offset + direction : offset;
}

export function captureAnchor(text: string, start: number, end: number, unit: AnchorUnit = 'range'): TextAnchor {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length) {
    throw new RangeError(`invalid range ${start}..${end} for text of length ${text.length}`);
  }
  const s = snapOffset(text, start, -1);
  const e = start === end ? s : snapOffset(text, end, 1);
  const prefixStart = snapOffset(text, Math.max(0, s - CONTEXT_LENGTH), 1);
  const suffixEnd = snapOffset(text, Math.min(text.length, e + CONTEXT_LENGTH), -1);
  return {
    start: s,
    end: e,
    exact: text.slice(s, e),
    prefix: text.slice(prefixStart, s),
    suffix: text.slice(e, suffixEnd),
    unit,
  };
}

/** Expands [start, end) to cover every block it touches (paragraph markups). */
export function snapToBlocks(ranges: TextRange[], start: number, end: number): TextRange {
  const hit = ranges.filter((r) => (start === end ? r.start <= start && start <= r.end : r.start < end && start < r.end));
  if (hit.length === 0) return { start, end };
  return { start: hit[0].start, end: hit[hit.length - 1].end };
}

/** The sentence containing `offset`, without trailing whitespace ("line" markups). */
export function sentenceRange(text: string, offset: number, locale = 'zh'): TextRange {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
  for (const { index, segment } of segmenter.segment(text)) {
    if (offset >= index && offset < index + segment.length) {
      return { start: index, end: index + segment.trimEnd().length };
    }
  }
  return { start: offset, end: offset };
}
