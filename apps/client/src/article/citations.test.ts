import type { Backlink } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { citationsOf } from './citations';

const link = (memoId: string, start: number, end: number, status: Backlink['status'] = 'exact'): Backlink => ({
  memoId,
  memoTitle: memoId,
  targetType: 'anchor',
  targetId: `${start}`,
  start,
  end,
  status,
});

describe('citationsOf', () => {
  it('groups memos by cited range, listing each memo once', () => {
    expect(citationsOf([link('m1', 2, 4), link('m2', 2, 4), link('m1', 2, 4), link('m1', 8, 9)])).toEqual([
      { start: 2, end: 4, memoIds: ['m1', 'm2'] },
      { start: 8, end: 9, memoIds: ['m1'] },
    ]);
  });

  it('skips ranges whose anchor is orphaned', () => {
    expect(citationsOf([link('m1', 2, 4, 'orphan')])).toEqual([]);
  });
});
