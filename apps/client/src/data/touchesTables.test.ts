import type { Op } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { touchesTables } from './LibraryContext';

const op = (table: Op['table']): Op => ({ v: 1, table, id: 'x', hlc: '000000000000001-0000-0000000000000001', fields: {} });

describe('touchesTables', () => {
  it('matches a commit that writes one of the tables', () => {
    expect(touchesTables([op('memo_update'), op('markup')], ['markup', 'anchor'])).toBe(true);
  });

  it('ignores commits to other tables', () => {
    expect(touchesTables([op('memo_update')], ['article', 'article_revision'])).toBe(false);
  });

  it('treats a missing filter as "every commit"', () => {
    expect(touchesTables([op('tag')], undefined)).toBe(true);
  });
});
