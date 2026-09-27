import type { TagEdgeRow, TagRow } from '@jot/db';

export interface TagNode {
  tag: TagRow;
  /** The parent this occurrence sits under; null at the top level. */
  parentId: string | null;
  /** Unique per occurrence: a tag with two parents appears twice. */
  key: string;
  depth: number;
  children: TagNode[];
}

const bySortKey = (a: TagRow, b: TagRow) =>
  a.sort_key < b.sort_key ? -1 : a.sort_key > b.sort_key ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * The tag graph as a tree (spec §6.4): a tag with several parents appears under each of them, and tags
 * without a parent are at the top level. A cycle that arrived from another device (before it is
 * repaired) can neither hide its tags nor loop: a branch stops at a tag already on its path.
 */
export function buildTagTree(tags: readonly TagRow[], edges: readonly TagEdgeRow[]): TagNode[] {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const childrenOf = new Map<string, TagRow[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    const child = byId.get(e.child_id);
    if (!child || !byId.has(e.parent_id)) continue;
    hasParent.add(child.id);
    childrenOf.set(e.parent_id, [...(childrenOf.get(e.parent_id) ?? []), child]);
  }
  const seen = new Set<string>();
  const build = (tag: TagRow, parentId: string | null, depth: number, path: ReadonlySet<string>, prefix: string): TagNode => {
    seen.add(tag.id);
    const key = `${prefix}/${tag.id}`;
    const onPath = new Set(path).add(tag.id);
    const children = (childrenOf.get(tag.id) ?? [])
      .filter((c) => !onPath.has(c.id))
      .sort(bySortKey)
      .map((c) => build(c, tag.id, depth + 1, onPath, key));
    return { tag, parentId, key, depth, children };
  };
  const sorted = [...tags].sort(bySortKey);
  const roots = sorted.filter((t) => !hasParent.has(t.id)).map((t) => build(t, null, 0, new Set(), ''));
  // Tags reachable only through a cycle have parents but no root above them.
  for (const t of sorted) if (!seen.has(t.id)) roots.push(build(t, null, 0, new Set(), ''));
  return roots;
}
