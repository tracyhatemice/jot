import type { Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { markupRange } from './markupRange';

// '他来了。她走了。' [0,8) · '\n\n' · '第二段  有空格。' [10,19)
const blocks: Block[] = [
  { k: 'p', runs: [{ t: '他来了。她走了。' }] },
  { k: 'p', runs: [{ t: '第二段  有空格。' }] },
];
const article = { text: '他来了。她走了。\n\n第二段  有空格。', blocks, lang: 'zh' };

describe('markupRange', () => {
  it('uses the trimmed selection for terms and notes', () => {
    expect(markupRange('term', article, { start: 8, end: 12 })).toEqual({ start: 10, end: 12 });
    expect(markupRange('note', article, { start: 12, end: 16 })).toEqual({ start: 12, end: 16 });
  });

  it('refuses whitespace-only selections (Review Focus 2)', () => {
    expect(markupRange('term', article, { start: 13, end: 15 })).toBeNull();
    expect(markupRange('paragraph', article, { start: 8, end: 10 })).toBeNull();
  });

  it('extends lines to whole sentences', () => {
    expect(markupRange('line', article, { start: 5, end: 6 })).toEqual({ start: 4, end: 8 });
  });

  it('snaps paragraphs to whole blocks', () => {
    expect(markupRange('paragraph', article, { start: 1, end: 2 })).toEqual({ start: 0, end: 8 });
    expect(markupRange('paragraph', article, { start: 6, end: 11 })).toEqual({ start: 0, end: 19 });
  });
});
