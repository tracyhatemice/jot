import { foldTagName } from '@jot/core';
import type { TagRow } from '@jot/db';

/** How many tags the picker lists at most. */
export const MAX_MATCHES = 8;

export interface TagMatches {
  /** Tags whose name contains the query; names starting with it come first. */
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
  const found = pool
    .map((tag) => ({ tag, folded: foldTagName(tag.name) }))
    .filter((x) => x.folded.includes(q))
    .sort((a, b) => Number(!a.folded.startsWith(q)) - Number(!b.folded.startsWith(q)));
  return { matches: found.slice(0, MAX_MATCHES).map((x) => x.tag), exact, canCreate: exact === null };
}
