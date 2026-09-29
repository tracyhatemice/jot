import { linkTargetStatus, targetRange } from '@jot/db';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary } from '../data/LibraryContext';
import { useStoredFlag, useStoredNumber } from '../data/useStoredNumber';
import { columnLayout, DEFAULT_MEMO_SHARE, DOCK_MIN, MEMO_MIN, notesWidth, shareForWidth, SPLITTER } from '../layout/columns';
import { ColumnsProvider, type Columns } from '../layout/ColumnsContext';
import { useColumnSpace } from '../layout/useColumnSpace';
import { MemoBridge, type LinkTarget } from '../memo/bridge';
import { MemoProvider, type FocusTarget } from '../memo/MemoContext';
import { TagProvider } from '../tags/TagContext';
import { useArticleTabs } from '../tabs/useArticleTabs';
import { navigate, type Route } from '../router';
import { ArticlePane } from './ArticlePane';
import { ArticleTabs } from './ArticleTabs';
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
  const [memoShare, setMemoShare] = useStoredNumber('jot.memoShare', DEFAULT_MEMO_SHARE);
  const [sidebarCollapsed, setSidebarCollapsed] = useStoredFlag('jot.sidebarCollapsed', false);
  const activeId = route.name === 'article' ? route.id : null;
  const articleTabs = useArticleTabs(activeId);
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [memoOpen, setMemoOpen] = useState(false);
  // The memo column is for an open article or memo; other screens take the full width (spec §6.10).
  const showMemo = activeId !== null || memoOpen;
  const searchTag = (tagId: string) => {
    setSearch({ ...EMPTY_SEARCH, tagIds: [tagId] });
    setSidebarCollapsed(false);
  };

  const [bridge] = useState(() => new MemoBridge());
  // The columns share the space right of the sidebar in proportion (spec §6.13).
  const shellRef = useRef<HTMLDivElement>(null);
  const space = useColumnSpace(shellRef, sidebarCollapsed);
  const spaceWidth = space?.width ?? window.innerWidth - 260;
  const layout = columnLayout(spaceWidth, memoShare);
  // A memo width saved before plan 11 becomes a share, once.
  const migrated = useRef(false);
  useEffect(() => {
    if (!space || migrated.current) return;
    migrated.current = true;
    try {
      const old = Number(localStorage.getItem('jot.memoWidth'));
      localStorage.removeItem('jot.memoWidth');
      if (old > 0 && localStorage.getItem('jot.memoShare') === null) setMemoShare(shareForWidth(space.width, old));
    } catch {
      // storage blocked: nothing saved to carry over
    }
  }, [space, setMemoShare]);
  const columns = useMemo<Columns>(
    () => ({ notes: layout.notes, notesWidth: notesWidth(layout.articleWidth), memoFloating: false, revealMemo: () => undefined }),
    [layout.notes, layout.articleWidth],
  );
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const token = useRef(0);
  const readerRef = useRef<HTMLElement>(null);
  // The memo column, which scrolls a memo: its editor is given it when it's created (see MemoEditor).
  const [memoColumn, setMemoColumn] = useState<HTMLElement | null>(null);
  // Every screen opens at its top, not at the previous screen's scroll position.
  const routeKey = route.name === 'article' ? `article:${route.id}` : route.name;
  // Where each screen was left, so going back to an article's tab shows the same place (spec §6.13, Review Focus 1).
  const places = useRef(new Map<string, number>());
  const routeKeyRef = useRef(routeKey);
  routeKeyRef.current = routeKey;
  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;
    const onScroll = () => places.current.set(routeKeyRef.current, reader.scrollTop);
    reader.addEventListener('scroll', onScroll, { passive: true });
    return () => reader.removeEventListener('scroll', onScroll);
  }, []);
  // Read as the screen changes, before the new screen's own scrolling is recorded.
  const place = useMemo(() => places.current.get(routeKey), [routeKey]);
  useLayoutEffect(() => {
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, [routeKey]);
  // A scroll bar shows while its area scrolls, e.g. from the keyboard, and for a moment after (spec §6.11).
  useEffect(() => {
    const timers = new Map<HTMLElement, number>();
    const onScroll = (e: Event) => {
      const area = e.target;
      if (!(area instanceof HTMLElement) || !area.matches('.sidebar-scroll, .reader, .memo, .memo-tabs, .article-tabs')) return;
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
        <ColumnsProvider value={columns}>
        <div className="shell" ref={shellRef} data-testid="shell">
          <Sidebar
            activeId={activeId}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            onImport={() => setImporting(true)}
            search={search}
            onSearch={setSearch}
            page={route.name}
            onKeepArticle={articleTabs.keep}
          />
          <main className="reader" ref={readerRef}>
            <ArticleTabs tabs={articleTabs.tabs} titles={articleTabs.titles} activeId={activeId} onKeep={articleTabs.keep} onClose={articleTabs.close} />
            {route.name === 'trash' ? (
              <TrashView />
            ) : route.name === 'library' ? (
              <LibraryPage onKeep={articleTabs.keep} />
            ) : route.name === 'memos' ? (
              <MemosPage />
            ) : route.name === 'tags' ? (
              <TagsPage onSearchTag={searchTag} />
            ) : activeId ? (
              <ArticlePane key={activeId} articleId={activeId} place={place} />
            ) : (
              <p className="empty">{t('article.none')}</p>
            )}
          </main>
          <OverlayScrollbar axis="y" testId="reader-thumb" />
          {showMemo && (
            <Splitter
              width={layout.memoWidth}
              min={MEMO_MIN}
              max={Math.max(MEMO_MIN, spaceWidth - SPLITTER - DOCK_MIN)}
              onResize={(width) => setMemoShare(shareForWidth(spaceWidth, width))}
            />
          )}
          <aside className="memo" ref={setMemoColumn} style={{ width: layout.memoWidth }} hidden={!showMemo} data-testid="memo-pane">
            <MemoPane articleId={activeId} column={memoColumn} onPresence={setMemoOpen} />
          </aside>
          <OverlayScrollbar axis="y" testId="memo-thumb" />
          {importing && <ImportDialog onClose={() => setImporting(false)} />}
          <ErrorBanner />
          <NoticeBanner />
        </div>
        </ColumnsProvider>
      </TagProvider>
    </MemoProvider>
  );
}
