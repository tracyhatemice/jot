import { foldTagName } from '@jot/core';
import type { TagRow } from '@jot/db';

/** How many tags the picker lists at most. */
export const MAX_MATCHES = 8;

export interface TagMatches {
  /** Tags whose name contains the query: the exact match first, then names starting with it. */
  matches: TagRow[];
  /** The tag whose name is the query, ignoring case, width and spacing (even when excluded). */
  exact: TagRow | null;
  /** Whether a new tag named after the query may be created. */
  canCreate: boolean;
}

/** Tags for a picker's text, compared the way tag names are kept unique (`foldTagName`). */
export function matchTags(tags: readonly TagRow[], query: string, exclude: ReadonlySet<string> = new Set()): TagMatches {
  const q = foldTagName(query);
  const pool = tags.filter((t) => !exclude.has(t.id));
  if (!q) return { matches: pool.slice(0, MAX_MATCHES), exact: null, canCreate: false };
  const exact = tags.find((t) => foldTagName(t.name) === q) ?? null;
  // Exact, then prefix, then anywhere: the exact tag must survive the cut to MAX_MATCHES.
  const rank = (folded: string) => (folded === q ? 0 : folded.startsWith(q) ? 1 : 2);
  const found = pool
    .map((tag) => ({ tag, folded: foldTagName(tag.name) }))
    .filter((x) => x.folded.includes(q))
    .sort((a, b) => rank(a.folded) - rank(b.folded));
  return { matches: found.slice(0, MAX_MATCHES).map((x) => x.tag), exact, canCreate: exact === null };
}
