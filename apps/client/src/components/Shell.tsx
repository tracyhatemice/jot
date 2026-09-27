import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStoredFlag, useStoredNumber } from '../data/useStoredNumber';
import { MemoBridge, type LinkTarget } from '../memo/bridge';
import { MemoProvider, type FocusTarget } from '../memo/MemoContext';
import { navigate, type Route } from '../router';
import { ArticlePane } from './ArticlePane';
import { ErrorBanner } from './ErrorBanner';
import { ImportDialog } from './ImportDialog';
import { MemoPane } from './MemoPane';
import { Sidebar } from './Sidebar';
import { Splitter } from './Splitter';

export function Shell({ route }: { route: Route }) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [memoWidth, setMemoWidth] = useStoredNumber('jot.memoWidth', 340);
  const [sidebarCollapsed, setSidebarCollapsed] = useStoredFlag('jot.sidebarCollapsed', false);
  const activeId = route.name === 'article' ? route.id : null;

  const [bridge] = useState(() => new MemoBridge());
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const token = useRef(0);
  const follow = useCallback(
    (link: LinkTarget) => {
      setFocus({ articleId: link.articleId, targetType: link.targetType, targetId: link.targetId, token: ++token.current });
      if (link.articleId !== activeId) navigate({ name: 'article', id: link.articleId });
    },
    [activeId],
  );
  const settle = useCallback((done: number) => setFocus((f) => (f?.token === done ? null : f)), []);
  const memoContext = useMemo(() => ({ bridge, focus, follow, settle }), [bridge, focus, follow, settle]);

  return (
    <MemoProvider value={memoContext}>
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
    </MemoProvider>
  );
}
