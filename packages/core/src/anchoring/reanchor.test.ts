import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { captureAnchor } from './capture';
import { levenshtein } from './distance';
import { reanchor } from './reanchor';

const anchorOn = (text: string, quote: string, occurrence = 0) => {
  let i = -1;
  for (let k = 0; k <= occurrence; k++) i = text.indexOf(quote, i + 1);
  if (i < 0) throw new Error(`"${quote}" not in text`);
  return captureAnchor(text, i, i + quote.length);
};

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('比喻', '比喻')).toBe(0);
  });
});

describe('reanchor', () => {
  const old = 'The quick brown fox jumps over the lazy dog. The moon hung low over the harbour that night.';

  it('keeps an anchor whose text did not change', () => {
    const a = anchorOn(old, 'brown fox');
    expect(reanchor(a, old, old)).toEqual({ status: 'exact', start: a.start, end: a.end, score: 1 });
  });

  it('keeps offsets when the edit is far after the anchor', () => {
    const a = anchorOn(old, 'quick');
    const next = old.replace('night', 'evening');
    expect(reanchor(a, old, next)).toMatchObject({ status: 'exact', start: a.start });
  });

  it('maps offsets through an insertion before the anchor', () => {
    const a = anchorOn(old, 'brown fox');
    const next = 'Look! ' + old;
    const r = reanchor(a, old, next);
    expect(r).toMatchObject({ status: 'mapped', start: a.start + 6, end: a.end + 6 });
  });

  it('fuzzy-matches a long quote with a small correction inside it', () => {
    const a = anchorOn(old, 'The moon hung low over the harbour');
    const next = old.replace('harbour', 'harbor');
    const r = reanchor(a, old, next);
    expect(r.status).toBe('fuzzy');
    expect(next.slice(r.start, r.end)).toBe('The moon hung low over the harbor');
  });

  it('orphans an anchor whose text was deleted', () => {
    const a = anchorOn(old, 'The moon hung low over the harbour that night.');
    const next = 'The quick brown fox jumps over the lazy dog.';
    expect(reanchor(a, old, next).status).toBe('orphan');
  });

  it('does not re-attach a deleted short term to another occurrence with different context', () => {
    const filler = '中间有很多别的文字，'.repeat(6);
    const oldText = `A段：他用比喻写春天。${filler}B段：讨论比喻的作用。`;
    const a = anchorOn(oldText, '比喻', 0);
    const newText = `A段：${filler}B段：讨论比喻的作用。`;
    expect(reanchor(a, oldText, newText).status).toBe('orphan');
  });

  it('does not slide an anchor onto identical text inserted right after it', () => {
    // diff-match-patch shifts the insertion "。a" left across the equal "a", which used to map 0 → 2.
    const text = 'aaaaaaaaaa';
    const a = captureAnchor(text, 0, 1);
    const next = 'a。a' + text.slice(1);
    expect(reanchor(a, text, next)).toMatchObject({ start: 0, end: 1 });
  });

  it('shifts an anchor by exactly the inserted length when the edit is entirely before it', () => {
    const text = 'xyz aaaa';
    const a = captureAnchor(text, 4, 8);
    const next = 'aa ' + text;
    expect(reanchor(a, text, next)).toMatchObject({ status: 'mapped', start: 7, end: 11 });
  });

  it('maps a point anchor through an insertion before it', () => {
    const text = 'Hello world. Second sentence.';
    const a = captureAnchor(text, 13, 13);
    const next = 'Intro. ' + text;
    expect(reanchor(a, text, next)).toMatchObject({ status: 'mapped', start: 20, end: 20 });
  });

  it('stays fast on a very long article (Review Focus 5)', () => {
    const text = Array.from({ length: 8000 }, (_, i) => `第${i}段：春风又绿江南岸，明月何时照我还。`).join('\n\n');
    const a = anchorOn(text, '第6000段：春风又绿江南岸');
    const cut = Math.floor(text.length / 3);
    const next = text.slice(0, cut) + '（补注）' + text.slice(cut);
    const t0 = performance.now();
    const r = reanchor(a, text, next);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(next.slice(r.start, r.end)).toBe(a.exact);
  });

  const alphabet = fc.constantFrom('a', 'b', ' ', '中', '文', '。', '😀');
  const textArb = fc.array(alphabet, { minLength: 10, maxLength: 120 }).map((a) => a.join(''));
  const insertArb = fc.array(alphabet, { minLength: 1, maxLength: 10 }).map((a) => a.join(''));
  const pickAnchor = (text: string, x: number, y: number) => {
    const start = x % text.length;
    return captureAnchor(text, start, start + 1 + (y % (text.length - start)));
  };

  it('property: an insertion at or after the anchor end keeps it at the same offsets', () => {
    fc.assert(
      fc.property(textArb, fc.nat(), fc.nat(), fc.nat(), insertArb, (text, x, y, z, insert) => {
        const a = pickAnchor(text, x, y);
        let p = a.end + (z % (text.length - a.end + 1));
        if (p < text.length && /[\uDC00-\uDFFF]/.test(text[p])) p -= 1; // stay on a code-point boundary
        fc.pre(p >= a.end);
        const next = text.slice(0, p) + insert + text.slice(p);
        const r = reanchor(a, text, next);
        expect(['exact', 'mapped']).toContain(r.status);
        expect(r.start).toBe(a.start);
        expect(next.slice(r.start, r.end)).toBe(a.exact);
      }),
    );
  });

  it('property: any edit yields an orphan or a spot resembling the quote (never a wrong spot)', () => {
    fc.assert(
      fc.property(textArb, fc.nat(), fc.nat(), fc.nat(), fc.nat(), insertArb, (text, x, y, s, l, insert) => {
        const a = pickAnchor(text, x, y);
        const from = s % text.length;
        const to = Math.min(text.length, from + (l % 20));
        const next = text.slice(0, from) + insert + text.slice(to);
        const r = reanchor(a, text, next);
        if (r.status !== 'orphan') {
          expect(levenshtein(next.slice(r.start, r.end), a.exact)).toBeLessThanOrEqual(Math.floor(a.exact.length * 0.25));
        }
      }),
    );
  });
});
