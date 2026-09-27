import { deleteArticle, listArticles, type ArticleSummary } from '@jot/db';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { LANGUAGES, setLanguage, type Language } from '../i18n';
import { navigate, routeHash } from '../router';

const LANGUAGE_NAMES: Record<Language, string> = { 'zh-CN': '简体中文', en: 'English' };

interface SidebarProps {
  activeId: string | null;
  collapsed: boolean;
  onToggle(): void;
  onImport(): void;
}

export function Sidebar({ activeId, collapsed, onToggle, onImport }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const lib = useLibrary();
  const { data: articles, error } = useLibraryQuery(listArticles, [], ['article']);

  const remove = async (article: ArticleSummary) => {
    if (!window.confirm(t('library.confirmDelete', { title: article.title }))) return;
    await deleteArticle(lib, article.id);
    if (article.id === activeId) navigate({ name: 'home' });
  };

  if (collapsed) {
    return (
      <nav className="sidebar collapsed">
        <button type="button" className="icon" onClick={onToggle} aria-label={t('library.expand')} data-testid="sidebar-toggle">
          ›
        </button>
      </nav>
    );
  }

  return (
    <nav className="sidebar">
      <header>
        <h1>Jot</h1>
        <button type="button" onClick={onImport} data-testid="import-open">
          {t('library.import')}
        </button>
        <button type="button" className="icon" onClick={onToggle} aria-label={t('library.collapse')} data-testid="sidebar-toggle">
          ‹
        </button>
      </header>
      <h2>{t('library.heading')}</h2>
      {error && (
        <p className="error" role="alert">
          {t('app.error')} {error.message}
        </p>
      )}
      {articles?.length === 0 && (
        <p className="muted" data-testid="library-empty">
          {t('library.empty')}
        </p>
      )}
      <ul className="library" data-testid="library-list">
        {articles?.map((a) => (
          <li key={a.id} className={a.id === activeId ? 'active' : undefined}>
            <a href={routeHash({ name: 'article', id: a.id })}>{a.title}</a>
            <button type="button" className="icon" aria-label={t('library.delete')} onClick={() => remove(a).catch(reportError)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <footer>
        <label>
          {t('app.language')}{' '}
          <select value={i18n.language} onChange={(e) => setLanguage(e.target.value as Language).catch(reportError)} data-testid="language">
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
      </footer>
    </nav>
  );
}
