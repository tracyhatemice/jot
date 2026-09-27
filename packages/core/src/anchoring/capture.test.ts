import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CONTEXT_LENGTH, captureAnchor, sentenceRange, sentenceSpan, snapToBlocks, trimRange } from './capture';

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('captureAnchor', () => {
  it('records the quote and its context', () => {
    expect(captureAnchor('The quick brown fox', 4, 9)).toEqual({
      start: 4,
      end: 9,
      exact: 'quick',
      prefix: 'The ',
      suffix: ' brown fox',
      unit: 'range',
    });
  });

  it('limits context to 32 code units', () => {
    const text = 'x'.repeat(100) + 'TARGET' + 'y'.repeat(100);
    const a = captureAnchor(text, 100, 106);
    expect(a.prefix).toHaveLength(CONTEXT_LENGTH);
    expect(a.suffix).toHaveLength(CONTEXT_LENGTH);
  });

  it('supports point anchors', () => {
    const a = captureAnchor('Hello world', 5, 5);
    expect(a).toMatchObject({ start: 5, end: 5, exact: '', prefix: 'Hello', suffix: ' world' });
  });

  it('rejects invalid ranges', () => {
    expect(() => captureAnchor('abc', 2, 1)).toThrow(RangeError);
    expect(() => captureAnchor('abc', -1, 1)).toThrow(RangeError);
    expect(() => captureAnchor('abc', 0, 4)).toThrow(RangeError);
  });

  it('widens a selection that starts inside a surrogate pair', () => {
    expect(captureAnchor('a😀b', 2, 3)).toMatchObject({ start: 1, end: 3, exact: '😀' });
  });

  it('never leaves a lone surrogate in exact, prefix or suffix (Review Focus 2)', () => {
    const text = fc.array(fc.constantFrom('a', '中', '😀', '𠀀', ' ', '。'), { minLength: 1, maxLength: 80 }).map((a) => a.join(''));
    fc.assert(
      fc.property(text, fc.nat(), fc.nat(), (t, x, y) => {
        const start = x % (t.length + 1);
        const end = start + (y % (t.length - start + 1));
        const a = captureAnchor(t, start, end);
        for (const part of [a.exact, a.prefix, a.suffix]) expect(part).not.toMatch(LONE_SURROGATE);
        expect(t.slice(a.start, a.end)).toBe(a.exact);
      }),
    );
  });
});

describe('snapToBlocks', () => {
  const ranges = [
    { start: 0, end: 5 },
    { start: 7, end: 12 },
  ];

  it('expands to every block the selection touches', () => {
    expect(snapToBlocks(ranges, 2, 3)).toEqual({ start: 0, end: 5 });
    expect(snapToBlocks(ranges, 3, 9)).toEqual({ start: 0, end: 12 });
  });

  it('treats a point by the block that contains it', () => {
    expect(snapToBlocks(ranges, 7, 7)).toEqual({ start: 7, end: 12 });
  });

  it('does not grab the next block when the selection ends at its start', () => {
    expect(snapToBlocks(ranges, 2, 7)).toEqual({ start: 0, end: 5 });
  });
});

describe('sentenceRange', () => {
  it('finds the Chinese sentence around an offset', () => {
    expect(sentenceRange('他来了。她走了。', 5)).toEqual({ start: 4, end: 8 });
  });

  it('trims trailing whitespace from English sentences', () => {
    expect(sentenceRange('One. Two three.', 6)).toEqual({ start: 5, end: 15 });
    expect(sentenceRange('One. Two three.', 1)).toEqual({ start: 0, end: 4 });
  });
});

describe('trimRange', () => {
  it('drops surrounding whitespace, including full-width spaces', () => {
    expect(trimRange('  比喻 ', 0, 5)).toEqual({ start: 2, end: 4 });
    expect(trimRange('\u{3000}\u{3000}第一段', 0, 5)).toEqual({ start: 2, end: 5 });
  });

  it('collapses an all-whitespace range', () => {
    const r = trimRange('a   b', 1, 4);
    expect(r.start).toBe(r.end);
  });
});

describe('sentenceSpan', () => {
  it('extends a selection to the whole sentences it touches', () => {
    expect(sentenceSpan('他来了。她走了。我也走了。', 5, 10)).toEqual({ start: 4, end: 13 });
    expect(sentenceSpan('One. Two three. Four.', 6, 11, 'en')).toEqual({ start: 5, end: 15 });
  });

  it('never shrinks the selection', () => {
    expect(sentenceSpan('abc', 0, 3)).toEqual({ start: 0, end: 3 });
  });
});
