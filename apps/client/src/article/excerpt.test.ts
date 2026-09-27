import { describe, expect, it } from 'vitest';
import { excerpt } from './excerpt';

describe('excerpt', () => {
  it('keeps short text and cuts long text with an ellipsis', () => {
    expect(excerpt('比喻')).toBe('比喻');
    expect(excerpt('春'.repeat(30))).toBe(`${'春'.repeat(24)}…`);
  });

  it('never splits an emoji (Review Focus 5)', () => {
    expect(excerpt('😀'.repeat(30), 3)).toBe('😀😀😀…');
  });

  it('collapses whitespace so labels stay on one line', () => {
    expect(excerpt('第一段。\n\n第二段。')).toBe('第一段。 第二段。');
  });
});
