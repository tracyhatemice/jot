import { linkTargetStatus, targetRange } from '@jot/db';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary } from '../data/LibraryContext';
import { useStoredFlag, useStoredNumber } from '../data/useStoredNumber';
import { MemoBridge, type LinkTarget } from '../memo/bridge';
import { MemoProvider, type FocusTarget } from '../memo/MemoContext';
import { TagProvider } from '../tags/TagContext';
import { navigate, type Route } from '../router';
import { ArticlePane } from './ArticlePane';
import { ErrorBanner } from './ErrorBanner';
import { ImportDialog } from './ImportDialog';
import { MemoPane } from './MemoPane';
import { NoticeBanner } from './NoticeBanner';
import { EMPTY_SEARCH, type SearchState } from './SearchPanel';
import { LibraryPage, MemosPage, TagsPage } from './SectionPages';
import { OverlayScrollbar } from './OverlayScrollbar';
import { Sidebar } from './Sidebar';
import { Splitter } from './Splitter';
import { TrashView } from './Trash';

export function Shell({ route }: { route: Route }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [importing, setImporting] = useState(false);
  const [memoWidth, setMemoWidth] = useStoredNumber('jot.memoWidth', 340);
  const [sidebarCollapsed, setSidebarCollapsed] = useStoredFlag('jot.sidebarCollapsed', false);
  const activeId = route.name === 'article' ? route.id : null;
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [memoOpen, setMemoOpen] = useState(false);
  // The memo column is for an open article or memo; other screens take the full width (spec §6.10).
  const showMemo = activeId !== null || memoOpen;
  const searchTag = (tagId: string) => {
    setSearch({ ...EMPTY_SEARCH, tagIds: [tagId] });
    setSidebarCollapsed(false);
  };

  const [bridge] = useState(() => new MemoBridge());
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const token = useRef(0);
  const readerRef = useRef<HTMLElement>(null);
  // Every screen opens at its top, not at the previous screen's scroll position.
  const routeKey = route.name === 'article' ? `article:${route.id}` : route.name;
  useLayoutEffect(() => {
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, [routeKey]);
  // A scroll bar shows while its area scrolls, e.g. from the keyboard, and for a moment after (spec §6.11).
  useEffect(() => {
    const timers = new Map<HTMLElement, number>();
    const onScroll = (e: Event) => {
      const area = e.target;
      if (!(area instanceof HTMLElement) || !area.matches('.sidebar, .reader, .memo, .memo-tabs')) return;
      area.classList.add('scrolling');
      window.clearTimeout(timers.get(area));
      timers.set(
        area,
        window.setTimeout(() => {
          area.classList.remove('scrolling');
          timers.delete(area);
        }, 800),
      );
    };
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);
  const shownId = useRef(activeId);
  shownId.current = activeId;
  // A link whose target is gone says so, rather than leaving the current article for a dead page.
  const follow = useCallback(
    (link: LinkTarget) => {
      const mine = ++token.current;
      targetRange(lib, link.targetType, link.targetId).then((range) => {
        if (mine !== token.current) return; // a later click wins
        if (range?.status === 'orphan') {
          reportError(new Error(t('memo.lostTarget')));
          return;
        }
        if (!range) {
          // In the Trash, the passage can come back; say so rather than that it is gone (spec §6.9).
          linkTargetStatus(lib, link.targetType, link.targetId).then((status) => {
            if (mine === token.current) reportError(new Error(t(status === 'trash' ? 'memo.targetInTrash' : 'memo.missingTarget')));
          }, reportError);
          return;
        }
        setFocus({ articleId: range.articleId, targetType: link.targetType, targetId: link.targetId, token: mine });
        if (range.articleId !== shownId.current) navigate({ name: 'article', id: range.articleId });
      }, reportError);
    },
    [lib, t],
  );
  const settle = useCallback((done: number) => setFocus((f) => (f?.token === done ? null : f)), []);
  const memoContext = useMemo(() => ({ bridge, focus, follow, settle }), [bridge, focus, follow, settle]);

  return (
    <MemoProvider value={memoContext}>
      <TagProvider>
        <div className="shell" data-testid="shell">
          <Sidebar
            activeId={activeId}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            onImport={() => setImporting(true)}
            search={search}
            onSearch={setSearch}
          />
          <OverlayScrollbar axis="y" testId="sidebar-thumb" />
          <main className="reader" ref={readerRef}>
            {route.name === 'trash' ? (
              <TrashView />
            ) : route.name === 'library' ? (
              <LibraryPage />
            ) : route.name === 'memos' ? (
              <MemosPage />
            ) : route.name === 'tags' ? (
              <TagsPage onSearchTag={searchTag} />
            ) : activeId ? (
              <ArticlePane key={activeId} articleId={activeId} />
            ) : (
              <p className="empty">{t('article.none')}</p>
            )}
          </main>
          <OverlayScrollbar axis="y" testId="reader-thumb" />
          {showMemo && <Splitter width={memoWidth} min={240} max={720} onResize={setMemoWidth} />}
          <aside className="memo" style={{ width: memoWidth }} hidden={!showMemo} data-testid="memo-pane">
            <MemoPane articleId={activeId} onPresence={setMemoOpen} />
          </aside>
          <OverlayScrollbar axis="y" testId="memo-thumb" />
          {importing && <ImportDialog onClose={() => setImporting(false)} />}
          <ErrorBanner />
          <NoticeBanner />
        </div>
      </TagProvider>
    </MemoProvider>
  );
}
