import { describe, expect, it } from 'vitest';
import { makeSnippet } from './snippet';

describe('makeSnippet', () => {
  it('cuts a window around the first match and marks the matches in it', () => {
    const text = `${'甲'.repeat(50)}他用比喻写春天${'乙'.repeat(50)}`;
    expect(makeSnippet(text, [{ start: 52, end: 54 }], 4)).toEqual({
      parts: [
        { text: '甲甲他用', hit: false },
        { text: '比喻', hit: true },
        { text: '写春天乙', hit: false },
      ],
      cutStart: true,
      cutEnd: true,
    });
  });

  it('starts at the beginning when nothing is highlighted, and collapses whitespace', () => {
    expect(makeSnippet('第一段。\n\n第二段。', [], 40)).toEqual({
      parts: [{ text: '第一段。 第二段。', hit: false }],
      cutStart: false,
      cutEnd: false,
    });
  });

  it('never cuts inside an emoji', () => {
    const text = `${'😀'.repeat(10)}比喻`;
    expect(makeSnippet(text, [{ start: 20, end: 22 }], 3).parts[0]).toEqual({ text: '😀😀', hit: false });
  });

  it('marks every match inside the window, and an infinite radius keeps the whole text', () => {
    expect(makeSnippet('比喻和比喻', [{ start: 0, end: 2 }, { start: 3, end: 5 }], Infinity)).toEqual({
      parts: [
        { text: '比喻', hit: true },
        { text: '和', hit: false },
        { text: '比喻', hit: true },
      ],
      cutStart: false,
      cutEnd: false,
    });
  });
});
