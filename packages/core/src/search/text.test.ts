import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildFtsQuery, findHighlights, normalizeForIndex, queryTerms } from './text';

describe('normalizeForIndex', () => {
  it('makes every CJK character its own token', () => {
    expect(normalizeForIndex('我爱写作')).toBe(' 我  爱  写  作 ');
    expect(normalizeForIndex('Hello世界')).toBe('Hello 世  界 ');
  });

  it('folds compatibility forms (full-width Latin) with NFKC', () => {
    expect(normalizeForIndex('ＡＢＣ')).toBe('ABC');
  });

  it('keeps astral CJK characters (Extension B) whole', () => {
    expect(normalizeForIndex('𠀀字')).toBe(' 𠀀  字 ');
  });
});

describe('queryTerms', () => {
  it('splits CJK runs from words', () => {
    expect(queryTerms('比喻 writing')).toEqual([
      { kind: 'cjk', text: '比喻' },
      { kind: 'word', text: 'writing' },
    ]);
    expect(queryTerms('AI写作')).toEqual([
      { kind: 'word', text: 'AI' },
      { kind: 'cjk', text: '写作' },
    ]);
  });
});

describe('buildFtsQuery', () => {
  it('builds single-character phrases for CJK and prefix queries for words', () => {
    expect(buildFtsQuery('比喻')).toBe('"比 喻"');
    expect(buildFtsQuery('喻')).toBe('"喻"');
    expect(buildFtsQuery('writ')).toBe('"writ"*');
    expect(buildFtsQuery('比喻 writ')).toBe('"比 喻" "writ"*');
  });

  it('neutralizes FTS syntax in user input', () => {
    expect(buildFtsQuery('"AND NEAR( -x:y ^z *')).toBe('"AND"* "NEAR"* "x"* "y"* "z"*');
  });

  it('returns null when nothing is searchable', () => {
    expect(buildFtsQuery('')).toBeNull();
    expect(buildFtsQuery('   ')).toBeNull();
    expect(buildFtsQuery('。，！')).toBeNull();
    expect(buildFtsQuery('\uD800')).toBeNull();
  });

  it('always produces a well-formed query for arbitrary input (Review Focus 1)', () => {
    const wellFormed = /^"(?:[^"]|"")*"\*?(?: "(?:[^"]|"")*"\*?)*$/;
    const hostile = fc.array(fc.constantFrom('"', '*', '(', ')', ':', '-', '^', 'AND', 'NEAR', ' ', 'a', '中', '😀', '\uD800', '\uDC00'), { maxLength: 30 }).map((a) => a.join(''));
    fc.assert(
      fc.property(fc.oneof(fc.string(), hostile), (input) => {
        const q = buildFtsQuery(input);
        if (q !== null) expect(q).toMatch(wellFormed);
      }),
    );
  });
});

describe('findHighlights', () => {
  it('finds CJK terms anywhere and word terms at word starts', () => {
    expect(findHighlights('他用了比喻。', '比喻')).toEqual([{ start: 3, end: 5 }]);
    expect(findHighlights('Rewrite writers', 'writ')).toEqual([{ start: 8, end: 12 }]);
  });

  it('ignores case and diacritics and maps back to original offsets', () => {
    expect(findHighlights('Café CAFE', 'cafe')).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
    ]);
  });

  it('merges overlapping hits', () => {
    expect(findHighlights('比喻', '比 比喻')).toEqual([{ start: 0, end: 2 }]);
  });
});
