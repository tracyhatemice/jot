export interface TagEdge {
  id: string;
  parent: string;
  child: string;
  hlc: string;
}

type Link = Pick<TagEdge, 'parent' | 'child'>;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `root` and every tag below it. Safe on graphs that (temporarily) contain cycles. */
export function descendants(edges: Link[], root: string): Set<string> {
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    for (const e of edges) {
      if (e.parent === node && !seen.has(e.child)) {
        seen.add(e.child);
        queue.push(e.child);
      }
    }
  }
  return seen;
}

export function wouldCreateCycle(edges: Link[], parent: string, child: string): boolean {
  return parent === child || descendants(edges, child).has(parent);
}

/** Deterministic DFS: nodes and out-edges visited in id order, so every device finds the same cycle. */
function findCycle(edges: TagEdge[]): TagEdge[] | null {
  const out = new Map<string, TagEdge[]>();
  for (const e of edges) {
    const list = out.get(e.parent) ?? [];
    list.push(e);
    out.set(e.parent, list);
  }
  for (const list of out.values()) list.sort((a, b) => cmp(a.child, b.child) || cmp(a.id, b.id));
  const nodes = [...new Set(edges.flatMap((e) => [e.parent, e.child]))].sort(cmp);
  const state = new Map<string, 'active' | 'done'>();
  const path: TagEdge[] = [];

  const visit = (node: string): TagEdge[] | null => {
    state.set(node, 'active');
    for (const e of out.get(node) ?? []) {
      const s = state.get(e.child);
      if (s === 'active') {
        const i = path.findIndex((p) => p.parent === e.child);
        return i < 0 ? [e] : [...path.slice(i), e];
      }
      if (s === undefined) {
        path.push(e);
        const cycle = visit(e.child);
        if (cycle) return cycle;
        path.pop();
      }
    }
    state.set(node, 'done');
    return null;
  };

  for (const n of nodes) {
    if (!state.has(n)) {
      const cycle = visit(n);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Edges to delete so the graph becomes acyclic again after a sync merged edges from two devices.
 * In each cycle the newest edge (highest HLC, then highest id) loses.
 */
export function edgesToBreakCycles(edges: TagEdge[]): string[] {
  let live = [...edges];
  const removed: string[] = [];
  for (let cycle = findCycle(live); cycle; cycle = findCycle(live)) {
    const victim = cycle.reduce((a, b) => (cmp(b.hlc, a.hlc) > 0 || (b.hlc === a.hlc && cmp(b.id, a.id) > 0) ? b : a));
    removed.push(victim.id);
    live = live.filter((e) => e.id !== victim.id);
  }
  return removed;
}

export function foldTagName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Tags whose folded names collide are merged into the one with the smallest id. */
export function planTagMerges(tags: { id: string; name: string }[]): { keep: string; drop: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const t of tags) {
    const key = foldTagName(t.name);
    groups.set(key, [...(groups.get(key) ?? []), t.id]);
  }
  return [...groups.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ids.sort(cmp))
    .map(([keep, ...drop]) => ({ keep, drop }))
    .sort((a, b) => cmp(a.keep, b.keep));
}
