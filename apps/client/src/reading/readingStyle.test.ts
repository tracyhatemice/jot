import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, parseStyle, stepStyle, styleVars } from './readingStyle';

describe('reading styles', () => {
  it('repairs damaged or out-of-range stored settings (Review Focus 1)', () => {
    expect(parseStyle(null, 'article')).toEqual(DEFAULT_STYLE.article);
    expect(parseStyle('nonsense', 'memo')).toEqual(DEFAULT_STYLE.memo);
    expect(parseStyle({ typeface: 'comic', size: 99, lineHeight: 0.2, width: 43 }, 'article')).toEqual({
      typeface: 'song',
      size: 26,
      lineHeight: 1.4,
      width: 45,
    });
    expect(parseStyle({ typeface: 'kai', size: 20, lineHeight: 2.04, width: 0 }, 'article')).toEqual({
      typeface: 'kai',
      size: 20,
      lineHeight: 2,
      width: 0,
    });
  });

  it('steps within the limits; width goes from 50 em to the full column and back', () => {
    const s = DEFAULT_STYLE.article;
    expect(stepStyle(s, 'size', 1).size).toBe(19);
    expect(stepStyle({ ...s, size: 26 }, 'size', 1).size).toBe(26);
    expect(stepStyle(s, 'lineHeight', 1).lineHeight).toBe(2);
    expect(stepStyle({ ...s, lineHeight: 1.4 }, 'lineHeight', -1).lineHeight).toBe(1.4);
    expect(stepStyle({ ...s, width: 50 }, 'width', 1).width).toBe(0);
    expect(stepStyle({ ...s, width: 0 }, 'width', -1).width).toBe(50);
    expect(stepStyle({ ...s, width: 30 }, 'width', -1).width).toBe(30);
  });

  it('turns a style into the CSS variables its column reads', () => {
    expect(styleVars(DEFAULT_STYLE.article, 'article')).toEqual({
      '--read-font': 'var(--font-read)',
      '--read-size': '18px',
      '--read-line': '1.9',
      '--read-width': '40em',
    });
    expect(styleVars({ ...DEFAULT_STYLE.memo, typeface: 'hei' }, 'memo')).toEqual({
      '--memo-font': 'var(--font-ui)',
      '--memo-size': '16px',
      '--memo-line': '1.8',
      '--memo-width': 'none',
    });
    expect(styleVars({ ...DEFAULT_STYLE.article, width: 0 }, 'article')['--read-width']).toBe('1fr');
  });
});
