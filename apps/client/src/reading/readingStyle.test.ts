import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, parseStyle, stepStyle, styleVars } from './readingStyle';

describe('text styles', () => {
  it('repairs damaged or out-of-range settings (Review Focus 1)', () => {
    expect(parseStyle(null, 'article')).toEqual(DEFAULT_STYLE.article);
    expect(parseStyle('nonsense', 'memo')).toEqual(DEFAULT_STYLE.memo);
    expect(parseStyle({ latin: 'comic', han: 'wingdings', size: 99, lineHeight: 0.2, width: 'huge' }, 'article')).toEqual({
      ...DEFAULT_STYLE.article,
      size: 26,
      lineHeight: 1.4,
    });
  });

  it('carries plan 8 settings over: its typeface becomes the Chinese face, its width the nearest named width (Review Focus 1)', () => {
    expect(parseStyle({ typeface: 'kai', size: 18, lineHeight: 2, width: 40 }, 'article')).toEqual({
      latin: 'source-serif',
      han: 'kai',
      size: 18,
      lineHeight: 2,
      width: 'medium',
    });
    expect(parseStyle({ typeface: 'hei', size: 18, width: 50 }, 'article').width).toBe('wide');
    expect(parseStyle({ typeface: 'song', size: 18, width: 30 }, 'article').width).toBe('narrow');
    expect(parseStyle({ typeface: 'song', size: 16, width: 0 }, 'memo').width).toBe('full');
  });

  it('steps within the limits, and through the named widths', () => {
    const s = DEFAULT_STYLE.article;
    expect(stepStyle(s, 'size', 1).size).toBe(19);
    expect(stepStyle({ ...s, size: 26 }, 'size', 1).size).toBe(26);
    expect(stepStyle(s, 'lineHeight', 1).lineHeight).toBe(2);
    expect(stepStyle(s, 'width', 1).width).toBe('wide');
    expect(stepStyle({ ...s, width: 'wide' }, 'width', 1).width).toBe('full');
    expect(stepStyle({ ...s, width: 'full' }, 'width', 1).width).toBe('full');
    expect(stepStyle({ ...s, width: 'narrow' }, 'width', -1).width).toBe('narrow');
  });

  it('turns a style into its column’s variables, the width in the text’s own size', () => {
    const article = styleVars(DEFAULT_STYLE.article, 'article');
    expect(article['--read-font'].startsWith("'Source Serif 4', 'Songti SC'")).toBe(true);
    expect([article['--read-size'], article['--read-line'], article['--read-width']]).toEqual(['18px', '1.9', '612px']);
    const memo = styleVars({ ...DEFAULT_STYLE.memo, latin: 'inter', han: 'hei' }, 'memo');
    expect(memo['--memo-font'].startsWith("'Inter', 'PingFang SC'")).toBe(true);
    expect(memo['--memo-width']).toBe('none');
    expect(styleVars({ ...DEFAULT_STYLE.article, width: 'full' }, 'article')['--read-width']).toBe('1fr');
  });
});
