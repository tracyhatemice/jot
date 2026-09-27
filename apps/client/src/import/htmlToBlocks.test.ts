// @vitest-environment happy-dom
import { blockText } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { htmlToBlocks } from './htmlToBlocks';

const kinds = (html: string) => htmlToBlocks(html).map((b) => [b.k, blockText(b)]);

describe('htmlToBlocks', () => {
  it('keeps paragraphs, headings, quotes and list items', () => {
    expect(
      kinds('<h1>题目</h1><p>第一段。</p><h4>小节</h4><blockquote><p>引文</p></blockquote><ul><li>甲</li><li>乙</li></ul>'),
    ).toEqual([
      ['h1', '题目'],
      ['p', '第一段。'],
      ['h3', '小节'],
      ['quote', '引文'],
      ['li', '甲'],
      ['li', '乙'],
    ]);
  });

  it('keeps bold and italic as run marks', () => {
    expect(htmlToBlocks('<p>a <strong>b</strong> <em>c</em></p>')).toEqual([
      { k: 'p', runs: [{ t: 'a ' }, { t: 'b', b: true }, { t: ' ' }, { t: 'c', i: true }] },
    ]);
  });

  it('splits on <br> and flattens nested containers', () => {
    expect(kinds('<div><div>第一行<br>第二行</div><section><p>第三行</p></section></div>')).toEqual([
      ['p', '第一行'],
      ['p', '第二行'],
      ['p', '第三行'],
    ]);
  });

  it('joins wrapped CJK source lines without adding spaces', () => {
    expect(kinds('<p>第一行\n第二行</p><p>Hello\nworld</p>')).toEqual([
      ['p', '第一行第二行'],
      ['p', 'Hello world'],
    ]);
  });

  it('drops scripts, styles and embedded content without running anything (Review Focus 1)', () => {
    const w = window as unknown as { __pwned?: number };
    const blocks = htmlToBlocks(
      '<p>安全</p><script>window.__pwned = 1</script><style>p{}</style>' +
        '<img src="x" onerror="window.__pwned = 1"><iframe src="javascript:window.__pwned=1"></iframe>',
    );
    expect(blocks.map(blockText)).toEqual(['安全']);
    expect(w.__pwned).toBeUndefined();
  });

  it('ignores whitespace between blocks and returns nothing for empty input', () => {
    expect(kinds('<p>a</p>\n  \n<p>b</p>')).toEqual([
      ['p', 'a'],
      ['p', 'b'],
    ]);
    expect(htmlToBlocks('')).toEqual([]);
    expect(htmlToBlocks('<p>   </p>')).toEqual([]);
  });

  it('survives deeply nested markup', () => {
    expect(kinds(`${'<div>'.repeat(2000)}深${'</div>'.repeat(2000)}`)).toEqual([['p', '深']]);
  });
});
