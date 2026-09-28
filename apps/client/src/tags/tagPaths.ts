/**
 * Every path from a top-level tag down to each tag, as names joined by ` › ` (the Tags page, spec §6.10).
 * A tag with several parents has several paths. The tag graph has no cycles (§6.4).
 */
export function tagPaths(
  tags: readonly { id: string; name: string }[],
  edges: readonly { parent_id: string; child_id: string }[],
): Map<string, string[]> {
  const names = new Map(tags.map((t) => [t.id, t.name]));
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (names.has(e.parent_id) && names.has(e.child_id)) parents.set(e.child_id, [...(parents.get(e.child_id) ?? []), e.parent_id]);
  }
  const chains = (id: string, seen: ReadonlySet<string>): string[][] => {
    const up = (parents.get(id) ?? []).filter((p) => !seen.has(p));
    if (up.length === 0) return [[id]];
    return up.flatMap((p) => chains(p, new Set([...seen, id])).map((c) => [...c, id]));
  };
  return new Map(tags.map((t) => [t.id, chains(t.id, new Set()).map((c) => c.map((x) => names.get(x) ?? '').join(' › ')).sort()]));
}
