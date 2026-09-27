// @vitest-environment happy-dom
import { blockText } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { markdownToBlocks } from './markdown';

describe('markdownToBlocks', () => {
  it('converts headings, emphasis and lists', () => {
    expect(markdownToBlocks('# 题目\n\n正文 **重点** *强调*\n\n- 甲\n- 乙\n')).toEqual([
      { k: 'h1', runs: [{ t: '题目' }] },
      { k: 'p', runs: [{ t: '正文 ' }, { t: '重点', b: true }, { t: ' ' }, { t: '强调', i: true }] },
      { k: 'li', runs: [{ t: '甲' }] },
      { k: 'li', runs: [{ t: '乙' }] },
    ]);
  });

  it('shows raw HTML in Markdown as text instead of rendering it (Review Focus 1)', () => {
    expect(markdownToBlocks('<b>x</b> and <script>alert(1)</script>').map(blockText)).toEqual([
      '<b>x</b> and <script>alert(1)</script>',
    ]);
  });
});
