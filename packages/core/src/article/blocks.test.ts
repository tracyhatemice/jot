import { describe, expect, it } from 'vitest';
import { blockRanges, blockText, canonicalText, normalizeBlocks, plainTextToBlocks, type Block } from './blocks';

const texts = (blocks: Block[]) => blocks.map(blockText);

describe('plainTextToBlocks', () => {
  it('splits on blank lines and joins wrapped Latin lines with a space', () => {
    expect(texts(plainTextToBlocks('Para one\nstill one\n\nPara two'))).toEqual(['Para one still one', 'Para two']);
  });

  it('joins wrapped CJK lines without a space', () => {
    expect(texts(plainTextToBlocks('第一行\n第二行\n\n下一段'))).toEqual(['第一行第二行', '下一段']);
  });

  it('splits on single newlines when there are no blank lines, stripping full-width indents', () => {
    expect(texts(plainTextToBlocks('　　第一段。\n　　第二段。'))).toEqual(['第一段。', '第二段。']);
  });

  it('handles CRLF', () => {
    expect(texts(plainTextToBlocks('a\r\n\r\nb'))).toEqual(['a', 'b']);
  });

  it('returns no blocks for empty or whitespace-only input (Review Focus 3)', () => {
    expect(plainTextToBlocks('')).toEqual([]);
    expect(plainTextToBlocks(' \n　\n\t ')).toEqual([]);
  });

  it('produces paragraphs', () => {
    expect(plainTextToBlocks('x')).toEqual([{ k: 'p', runs: [{ t: 'x' }] }]);
  });
});

describe('normalizeBlocks', () => {
  it('applies NFC, merges runs with equal marks and drops empties', () => {
    const blocks: Block[] = [
      { k: 'p', runs: [{ t: ' é', b: true }, { t: 'x', b: true }, { t: '' }, { t: 'y ' }] },
      { k: 'p', runs: [{ t: '   ' }] },
    ];
    expect(normalizeBlocks(blocks)).toEqual([{ k: 'p', runs: [{ t: 'éx', b: true }, { t: 'y' }] }]);
  });
});

describe('canonical text', () => {
  it('joins blocks with a blank line and reports each block range', () => {
    const blocks = plainTextToBlocks('Hello\n\n世界\n\nEnd');
    const text = canonicalText(blocks);
    expect(text).toBe('Hello\n\n世界\n\nEnd');
    const ranges = blockRanges(blocks);
    expect(ranges).toEqual([
      { start: 0, end: 5 },
      { start: 7, end: 9 },
      { start: 11, end: 14 },
    ]);
    ranges.forEach((r, i) => expect(text.slice(r.start, r.end)).toBe(blockText(blocks[i])));
  });
});
