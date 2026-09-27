import type { Backlink } from '@jot/db';
import type { Citation } from './decorations';

/** One citation per cited range (orphaned anchors skipped), listing each citing memo once. */
export function citationsOf(backlinks: readonly Backlink[]): Citation[] {
  const byRange = new Map<string, { start: number; end: number; memoIds: string[] }>();
  for (const b of backlinks) {
    if (b.status === 'orphan') continue;
    const key = `${b.start}:${b.end}`;
    const entry = byRange.get(key) ?? { start: b.start, end: b.end, memoIds: [] };
    if (!entry.memoIds.includes(b.memoId)) entry.memoIds.push(b.memoId);
    byRange.set(key, entry);
  }
  return [...byRange.values()];
}
