import { describe, expect, it } from 'vitest';
import { layoutMargin } from './margin';

describe('layoutMargin', () => {
  it('keeps cards at their anchors when they fit', () => {
    expect(layoutMargin([{ id: 'a', top: 0, height: 40 }, { id: 'b', top: 100, height: 40 }])).toEqual(
      new Map([['a', 0], ['b', 100]]),
    );
  });

  it('pushes overlapping cards down in anchor order, keeping a gap', () => {
    expect(layoutMargin([{ id: 'b', top: 10, height: 30 }, { id: 'a', top: 0, height: 40 }], 8)).toEqual(
      new Map([['a', 0], ['b', 48]]),
    );
  });

  it('breaks ties by id so the order is stable', () => {
    expect([...layoutMargin([{ id: 'y', top: 5, height: 10 }, { id: 'x', top: 5, height: 10 }], 0)]).toEqual([
      ['x', 5],
      ['y', 15],
    ]);
  });
});
