import type { TagRow } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { matchTags } from './match';

const tag = (id: string, name: string, sort: string): TagRow => ({ id, name, color: null, sort_key: sort });
const tags = [tag('1', 'Craft', 'a1'), tag('2', '手法', 'a2'), tag('3', 'Aircraft', 'a3'), tag('4', 'crafting', 'a4')];
const names = (list: TagRow[]) => list.map((t) => t.name);

describe('matchTags', () => {
  it('lists names starting with the query before names containing it', () => {
    expect(names(matchTags(tags, 'craft').matches)).toEqual(['Craft', 'crafting', 'Aircraft']);
  });

  it('finds the existing tag for a name that differs only by case, width or spacing (Review Focus 3)', () => {
    for (const query of ['CRAFT', 'ＣＲＡＦＴ', '  craft ']) {
      const found = matchTags(tags, query);
      expect(found.exact?.id).toBe('1');
      expect(found.canCreate).toBe(false);
    }
    expect(matchTags(tags, '比喻')).toMatchObject({ exact: null, canCreate: true, matches: [] });
  });

  it('offers nothing to create for a blank query', () => {
    expect(matchTags(tags, '  ')).toMatchObject({ exact: null, canCreate: false });
    expect(matchTags(tags, '').matches).toHaveLength(4);
  });

  it('leaves out excluded tags but still reports an exact match among them', () => {
    const found = matchTags(tags, 'craft', new Set(['1']));
    expect(names(found.matches)).toEqual(['crafting', 'Aircraft']);
    expect(found.exact?.id).toBe('1');
    expect(found.canCreate).toBe(false);
  });
});
