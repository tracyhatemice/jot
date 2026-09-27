import { describe, expect, it } from 'vitest';
import { markupRange } from './markupRange';

// '他来了。她走了。' [0,8) · '\n\n' · '第二段  有空格。' [10,19)
const text = '他来了。她走了。\n\n第二段  有空格。';

describe('markupRange', () => {
  it('marks exactly the selection, trimmed of surrounding whitespace', () => {
    expect(markupRange(text, { start: 8, end: 12 })).toEqual({ start: 10, end: 12 });
  });

  it('keeps selections of any length, across sentences and paragraphs', () => {
    expect(markupRange(text, { start: 1, end: 6 })).toEqual({ start: 1, end: 6 });
    expect(markupRange(text, { start: 2, end: 16 })).toEqual({ start: 2, end: 16 });
  });

  it('refuses whitespace-only selections (Review Focus 2)', () => {
    expect(markupRange(text, { start: 13, end: 15 })).toBeNull();
    expect(markupRange(text, { start: 8, end: 10 })).toBeNull();
  });
});
