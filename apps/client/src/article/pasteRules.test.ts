// @vitest-environment happy-dom
import { DOMParser } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { articleSchema, docToBlocks } from './schema';

/** How the fix-up editor reads pasted HTML (its own copy-and-paste included). */
const parse = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return docToBlocks(DOMParser.fromSchema(articleSchema).parse(host));
};

describe('article schema parsing (paste into the fix-up editor)', () => {
  it('keeps headings, quotes, list items, bold and italic', () => {
    expect(
      parse('<h2>标题</h2><p>正<strong>文</strong><em>斜</em></p><blockquote>引</blockquote><ul><li>项</li></ul><div class="li">项二</div>'),
    ).toEqual([
      { k: 'h2', runs: [{ t: '标题' }] },
      { k: 'p', runs: [{ t: '正' }, { t: '文', b: true }, { t: '斜', i: true }] },
      { k: 'quote', runs: [{ t: '引' }] },
      { k: 'li', runs: [{ t: '项' }] },
      { k: 'li', runs: [{ t: '项二' }] },
    ]);
  });

  it('reads Google Docs’ normal-weight <b> wrapper as plain text', () => {
    expect(parse('<p><b style="font-weight:normal">正文</b></p>')).toEqual([{ k: 'p', runs: [{ t: '正文' }] }]);
  });
});
