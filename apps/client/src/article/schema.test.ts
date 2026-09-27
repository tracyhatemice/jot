import { blockRanges, canonicalText, normalizeBlocks, type Block } from '@jot/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blocksToDoc, offsetToPos, posToOffset } from './schema';

const blocks: Block[] = [
  { k: 'h1', runs: [{ t: '题目' }] },
  { k: 'p', runs: [{ t: '他用' }, { t: '比喻', b: true }, { t: '写春天。', i: true }] },
  { k: 'quote', runs: [{ t: '引文😀' }] },
  { k: 'li', runs: [{ t: '甲' }] },
];

describe('blocksToDoc', () => {
  it('maps block kinds and inline marks', () => {
    const doc = blocksToDoc(blocks);
    expect(doc.childCount).toBe(4);
    expect([doc.child(0).type.name, doc.child(0).attrs.level]).toEqual(['heading', 1]);
    expect(doc.child(1).child(1).marks.map((m) => m.type.name)).toEqual(['strong']);
    expect(doc.child(1).child(2).marks.map((m) => m.type.name)).toEqual(['em']);
    expect(doc.child(2).type.name).toBe('quote');
    expect(doc.child(3).type.name).toBe('list_item');
  });

  it('reproduces the canonical text', () => {
    const doc = blocksToDoc(blocks);
    expect(doc.textBetween(0, doc.content.size, '\n\n')).toBe(canonicalText(blocks));
  });

  it('property: every in-block offset maps to the same place in the same block', () => {
    const run = fc.record({
      t: fc.array(fc.constantFrom('a', '中', '😀', ' '), { minLength: 1, maxLength: 6 }).map((a) => a.join('')),
      b: fc.option(fc.constant(true as const), { nil: undefined }),
    });
    const block = fc.record({
      k: fc.constantFrom('p' as const, 'h1' as const, 'h2' as const, 'h3' as const, 'quote' as const, 'li' as const),
      runs: fc.array(run, { minLength: 1, maxLength: 4 }),
    });
    fc.assert(
      fc.property(fc.array(block, { minLength: 1, maxLength: 6 }), (raw) => {
        const bs = normalizeBlocks(raw as Block[]);
        fc.pre(bs.length > 0);
        const doc = blocksToDoc(bs);
        blockRanges(bs).forEach((r, i) => {
          for (let o = r.start; o <= r.end; o++) {
            const $pos = doc.resolve(offsetToPos(o));
            expect($pos.index(0)).toBe(i);
            expect($pos.parentOffset).toBe(o - r.start);
            expect(posToOffset(offsetToPos(o))).toBe(o);
          }
        });
      }),
    );
  });
});
