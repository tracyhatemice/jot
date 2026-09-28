import { listArticles } from '@jot/db';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';
import { useStoredFlag } from '../data/useStoredNumber';
import { routeHash } from '../router';
import { MemoList } from './MemoList';
import { EMPTY_SEARCH, isSearching, SearchBox, SearchPanel, type SearchState } from './SearchPanel';
import { SectionHeading } from './SectionHeading';
import { SettingsMenu } from './SettingsMenu';
import { TagTree } from './TagTree';
import { TrashButton } from './Trash';

interface SidebarProps {
  activeId: string | null;
  collapsed: boolean;
  onToggle(): void;
  onImport(): void;
  search: SearchState;
  onSearch(next: SearchState): void;
}

export function Sidebar({ activeId, collapsed, onToggle, onImport, search, onSearch }: SidebarProps) {
  const { t } = useTranslation();
  const { data: articles, error } = useLibraryQuery(listArticles, [], ['article']);
  const [libraryFolded, setLibraryFolded] = useStoredFlag('jot.fold.library', false);
  const [memosFolded, setMemosFolded] = useStoredFlag('jot.fold.memos', false);
  const [tagsFolded, setTagsFolded] = useStoredFlag('jot.fold.tags', false);

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
        <button type="button" className="icon" onClick={onToggle} aria-label={t('library.collapse')} data-testid="sidebar-toggle">
          ‹
        </button>
      </header>
      <SearchBox state={search} onChange={onSearch} />
      {isSearching(search) ? (
        <SearchPanel state={search} onChange={onSearch} />
      ) : (
        <>
          <SectionHeading
            title={t('library.heading')}
            route={{ name: 'library' }}
            folded={libraryFolded}
            onFold={setLibraryFolded}
            testId="section-library"
            action={
              <button type="button" className="icon" aria-label={t('library.import')} title={t('library.import')} onClick={onImport} data-testid="import-open">
                +
              </button>
            }
          />
          {!libraryFolded && (
            <>
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
                  </li>
                ))}
              </ul>
            </>
          )}
          <MemoList folded={memosFolded} onFold={setMemosFolded} />
          <TagTree folded={tagsFolded} onFold={setTagsFolded} onSelect={(tagId) => onSearch({ ...EMPTY_SEARCH, tagIds: [tagId] })} />
        </>
      )}
      <footer>
        <SettingsMenu />
        <TrashButton />
      </footer>
    </nav>
  );
}
