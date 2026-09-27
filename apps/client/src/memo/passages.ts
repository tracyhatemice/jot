import { searchLibrary, type Library } from '@jot/db';
import { excerpt } from '../article/excerpt';
import type { LinkTarget } from './bridge';

/** A passage offered after `[[`: a link target, plus the title of its article. */
export interface PassageOption extends LinkTarget {
  source: string;
}

/** Markups and side notes matching `query`, best first, as link targets. A blank query finds nothing. */
export async function findPassages(lib: Library, query: string, untitled: string): Promise<PassageOption[]> {
  if (query.trim() === '') return [];
  const results = await searchLibrary(lib, { text: query, types: ['markup', 'side_note'], limit: 8 });
  return results.flatMap((r): PassageOption[] =>
    r.articleId && (r.entityType === 'markup' || r.entityType === 'side_note')
      ? [{ targetType: r.entityType, targetId: r.entityId, articleId: r.articleId, label: excerpt(r.text) || untitled, source: r.articleTitle ?? '' }]
      : [],
  );
}
