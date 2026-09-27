import type { Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { articleSchema, blocksToDoc, docToBlocks } from './schema';

describe('docToBlocks', () => {
  it('turns an edited document back into the blocks it was made from', () => {
    const blocks: Block[] = [
      { k: 'h2', runs: [{ t: '其一' }] },
      { k: 'p', runs: [{ t: '春风' }, { t: '又绿', b: true }, { t: '江南岸', i: true }, { t: '。' }] },
      { k: 'quote', runs: [{ t: '明月何时照我还' }] },
      { k: 'li', runs: [{ t: '一条' }] },
    ];
    expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks);
  });

  it('keeps an emptied paragraph as an empty block (normalizing drops it later)', () => {
    const doc = articleSchema.nodes.doc.create(null, [articleSchema.nodes.paragraph.create()]);
    expect(docToBlocks(doc)).toEqual([{ k: 'p', runs: [] }]);
  });
});
