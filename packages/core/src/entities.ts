/** Kinds of library items that can carry tags and appear in search results. */
export const ENTITY_TYPES = ['article', 'markup', 'side_note', 'memo'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}
