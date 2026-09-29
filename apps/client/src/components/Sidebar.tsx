import { listArticles } from '@jot/db';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';
import { useStoredFlag } from '../data/useStoredNumber';
import { routeHash, type Route } from '../router';
import { MemoList } from './MemoList';
import { EMPTY_SEARCH, isSearching, SearchBox, SearchPanel, type SearchState } from './SearchPanel';
import { SectionHeading } from './SectionHeading';
import { SECTION_ICONS } from './sectionIcons';
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
  /** The page on show, so the collapsed rail can mark it. */
  page: Route['name'];
}

/** The collapsed rail's pages (spec §6.12), with the same icons as their section headings. */
const RAIL = [
  { name: 'library', label: 'library.heading' },
  { name: 'memos', label: 'memoList.heading' },
  { name: 'tags', label: 'tags.heading' },
] as const;

export function Sidebar({ activeId, collapsed, onToggle, onImport, search, onSearch, page }: SidebarProps) {
  const { t } = useTranslation();
  const { data: articles, error } = useLibraryQuery(listArticles, [], ['article']);
  const [libraryFolded, setLibraryFolded] = useStoredFlag('jot.fold.library', false);
  const [memosFolded, setMemosFolded] = useStoredFlag('jot.fold.memos', false);
  const [tagsFolded, setTagsFolded] = useStoredFlag('jot.fold.tags', false);
  // Folded sections at the end stack at the bottom, above the footer; a folded middle one stays put (spec §6.11).
  // When all three are folded they stay at the top (spec §6.12).
  const allFolded = libraryFolded && memosFolded && tagsFolded;
  const dockFrom = allFolded ? null : tagsFolded ? (memosFolded ? 'memos' : 'tags') : null;
  const section = (name: 'library' | 'memos' | 'tags') => (name === dockFrom ? 'sidebar-section dock-start' : 'sidebar-section');

  // Collapsed, the sidebar is a rail: page links at the top, the footer band at the bottom (spec §6.12).
  if (collapsed) {
    return (
      <nav className="sidebar collapsed">
        <div className="sidebar-rail">
          {RAIL.map((item) => (
            <a
              key={item.name}
              className={page === item.name ? 'icon rail-link active' : 'icon rail-link'}
              href={routeHash({ name: item.name })}
              aria-label={t(item.label)}
              title={t(item.label)}
              aria-current={page === item.name ? 'page' : undefined}
              data-testid={`rail-${item.name}`}
            >
              {SECTION_ICONS[item.name]}
            </a>
          ))}
        </div>
        <footer key="footer" className="sidebar-footer">
          <SettingsMenu />
          <TrashButton />
          <button
            type="button"
            className="icon sidebar-toggle"
            onClick={onToggle}
            aria-label={t('library.expand')}
            title={t('library.expand')}
            data-testid="sidebar-toggle"
          >
            ›
          </button>
        </footer>
      </nav>
    );
  }

  return (
    <nav className="sidebar">
      <header>
        <h1>Jot</h1>
      </header>
      <SearchBox state={search} onChange={onSearch} />
      {isSearching(search) ? (
        <SearchPanel state={search} onChange={onSearch} />
      ) : (
        <div className="sidebar-sections">
          <div className={section('library')}>
            <SectionHeading
              title={t('library.heading')}
              icon={SECTION_ICONS.library}
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
                  <p className="section-empty" data-testid="library-empty">
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
          </div>
          <div className={section('memos')}>
            <MemoList folded={memosFolded} onFold={setMemosFolded} />
          </div>
          <div className={section('tags')}>
            <TagTree folded={tagsFolded} onFold={setTagsFolded} onSelect={(tagId) => onSearch({ ...EMPTY_SEARCH, tagIds: [tagId] })} />
          </div>
        </div>
      )}
      {/* The same keyed footer in both states, so the toggle keeps keyboard focus as the sidebar collapses. */}
      <footer key="footer" className="sidebar-footer">
        <SettingsMenu />
        <TrashButton />
        <button
          type="button"
          className="icon sidebar-toggle"
          onClick={onToggle}
          aria-label={t('library.collapse')}
          title={t('library.collapse')}
          data-testid="sidebar-toggle"
        >
          ‹
        </button>
      </footer>
    </nav>
  );
}
