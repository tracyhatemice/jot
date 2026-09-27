import { targetRange } from '@jot/db';
import { useCallback, useMemo, useRef, useState } from 'react';
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
import { Sidebar } from './Sidebar';
import { Splitter } from './Splitter';

export function Shell({ route }: { route: Route }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [importing, setImporting] = useState(false);
  const [memoWidth, setMemoWidth] = useStoredNumber('jot.memoWidth', 340);
  const [sidebarCollapsed, setSidebarCollapsed] = useStoredFlag('jot.sidebarCollapsed', false);
  const activeId = route.name === 'article' ? route.id : null;

  const [bridge] = useState(() => new MemoBridge());
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const token = useRef(0);
  const shownId = useRef(activeId);
  shownId.current = activeId;
  // A link whose target is gone says so, rather than leaving the current article for a dead page.
  const follow = useCallback(
    (link: LinkTarget) => {
      const mine = ++token.current;
      targetRange(lib, link.targetType, link.targetId).then((range) => {
        if (mine !== token.current) return; // a later click wins
        if (!range) {
          reportError(new Error(t('memo.missingTarget')));
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
          />
          <main className="reader">
            {activeId ? <ArticlePane key={activeId} articleId={activeId} /> : <p className="empty">{t('article.none')}</p>}
          </main>
          <Splitter width={memoWidth} min={240} max={720} onResize={setMemoWidth} />
          <aside className="memo" style={{ width: memoWidth }} data-testid="memo-pane">
            <MemoPane articleId={activeId} />
          </aside>
          {importing && <ImportDialog onClose={() => setImporting(false)} />}
          <ErrorBanner />
        </div>
      </TagProvider>
    </MemoProvider>
  );
}
