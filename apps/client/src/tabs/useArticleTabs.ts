import { listArticles } from '@jot/db';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLibraryQuery } from '../data/LibraryContext';
import { navigate } from '../router';
import { closeTab, keepTab, openTab, retainTabs, tabAfterClose, type Tab } from './tabs';
import { useStoredTabs } from './useStoredTabs';

export interface ArticleTabs {
  tabs: Tab[];
  titles: ReadonlyMap<string, string>;
  keep(id: string): void;
  close(id: string): void;
}

/**
 * The open article tabs (spec §6.13). The route names the active article: opening one gives it a tab, the preview tab
 * unless it has one already. Tabs of articles that are gone (in the Trash, erased) drop out; the shown article keeps
 * its tab while the library list catches up with an import.
 */
export function useArticleTabs(activeId: string | null): ArticleTabs {
  const [tabs, setTabs] = useStoredTabs('jot.articleTabs');
  const { data: articles } = useLibraryQuery(listArticles, [], ['article']);
  // The article shown before this one: a new preview tab goes right after its tab.
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (activeId) setTabs((t) => openTab(t, activeId, previous.current));
    previous.current = activeId;
  }, [activeId, setTabs]);

  useEffect(() => {
    if (!articles) return;
    const live = new Set(articles.map((a) => a.id));
    setTabs((t) => retainTabs(t, (id) => live.has(id) || id === activeId));
  }, [articles, activeId, setTabs]);

  const titles = useMemo(() => new Map((articles ?? []).map((a) => [a.id, a.title] as const)), [articles]);
  const keep = useCallback((id: string) => setTabs((t) => keepTab(t, id)), [setTabs]);
  const close = useCallback(
    (id: string) => {
      const next = tabAfterClose(tabs, id);
      setTabs((t) => closeTab(t, id));
      if (id === activeId) navigate(next ? { name: 'article', id: next } : { name: 'home' });
    },
    [tabs, activeId, setTabs],
  );
  return { tabs, titles, keep, close };
}
