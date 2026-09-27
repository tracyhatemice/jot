import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStoredFlag, useStoredNumber } from '../data/useStoredNumber';
import type { Route } from '../router';
import { ArticlePane } from './ArticlePane';
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

  return (
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
        <MemoPane />
      </aside>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
