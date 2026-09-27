import { listEdges, listTags, type TagEdgeRow, type TagRow } from '@jot/db';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLibraryQuery } from '../data/LibraryContext';

export interface TagIndex {
  /** Live tags, in creation order. */
  tags: TagRow[];
  edges: TagEdgeRow[];
  byId: ReadonlyMap<string, TagRow>;
}

const TagContext = createContext<TagIndex>({ tags: [], edges: [], byId: new Map() });

/** Loads the tags and their hierarchy once for the whole shell. */
export function TagProvider({ children }: { children: ReactNode }) {
  const tags = useLibraryQuery(listTags, [], ['tag']);
  const edges = useLibraryQuery(listEdges, [], ['tag_edge']);
  const value = useMemo<TagIndex>(() => {
    const list = tags.data ?? [];
    return { tags: list, edges: edges.data ?? [], byId: new Map(list.map((t) => [t.id, t])) };
  }, [tags.data, edges.data]);
  return <TagContext.Provider value={value}>{children}</TagContext.Provider>;
}

export function useTagIndex(): TagIndex {
  return useContext(TagContext);
}
