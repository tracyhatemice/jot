import { describe, expect, it } from 'vitest';
import { ENTITY_TYPES, isEntityType } from './entities';

describe('entity types', () => {
  it('lists the four taggable, searchable kinds', () => {
    expect(ENTITY_TYPES).toEqual(['article', 'markup', 'side_note', 'memo']);
  });

  it('recognizes only those kinds', () => {
    expect(isEntityType('markup')).toBe(true);
    expect(isEntityType('tag')).toBe(false);
  });
});
