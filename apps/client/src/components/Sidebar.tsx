import { listArticles } from '@jot/db';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';
import { useStoredFlag } from '../data/useStoredNumber';
import { routeHash, type Route } from '../router';
import { Collapsible } from './Collapsible';
import { MemoList } from './MemoList';
import { OverlayScrollbar } from './OverlayScrollbar';
import { EMPTY_SEARCH, isSearching, SearchBox, SearchPanel, type SearchState } from './SearchPanel';
import { SectionHeading } from './SectionHeading';
import { SECTION_ICONS, SIDEBAR_ICON } from './sectionIcons';
import { SettingsMenu } from './SettingsMenu';
import { TagTree } from './TagTree';
import { TrashButton } from './Trash';
import { useGlide } from './useGlide';

interface SidebarProps {
  activeId: string | null;
  collapsed: boolean;
  onToggle(): void;
  onImport(): void;
  search: SearchState;
  onSearch(next: SearchState): void;
  /** The page on show, so the collapsed rail can mark it. */
  page: Route['name'];
  /** Keeps an article's tab (a double click on its row, spec §6.13). */
  onKeepArticle(id: string): void;
}

/** The collapsed rail's pages (spec §6.12), with the same icons as their section headings. */
const RAIL = [
  { name: 'library', label: 'library.heading' },
  { name: 'memos', label: 'memoList.heading' },
  { name: 'tags', label: 'tags.heading' },
] as const;

export function Sidebar({ activeId, collapsed, onToggle, onImport, search, onSearch, page, onKeepArticle }: SidebarProps) {
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
  // Sections glide to their new place when folding moves them, e.g. to the bottom or back to the top (spec §6.12).
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const snapshot = useGlide(sectionRefs, [libraryFolded, memosFolded, tagsFolded]);
  const fold = (set: (folded: boolean) => void) => (folded: boolean) => {
    snapshot();
    set(folded);
  };

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
            aria-label={t('sidebar.show')}
            title={t('sidebar.show')}
            data-testid="sidebar-toggle"
          >
            {SIDEBAR_ICON}
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
      {/* Only what lies between the search box and the footer band scrolls, so its scroll bar runs there too. */}
      <div className="sidebar-scroll">
        {isSearching(search) ? (
          <SearchPanel state={search} onChange={onSearch} />
        ) : (
          <div className="sidebar-sections">
            <div
              className={section('library')}
              ref={(el) => {
                sectionRefs.current[0] = el;
              }}
            >
              <SectionHeading
                title={t('library.heading')}
                icon={SECTION_ICONS.library}
                route={{ name: 'library' }}
                folded={libraryFolded}
                onFold={fold(setLibraryFolded)}
                testId="section-library"
                action={
                  <button type="button" className="icon" aria-label={t('library.import')} title={t('library.import')} onClick={onImport} data-testid="import-open">
                    +
                  </button>
                }
              />
              <Collapsible open={!libraryFolded}>
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
                      <a href={routeHash({ name: 'article', id: a.id })} onDoubleClick={() => onKeepArticle(a.id)}>
                        {a.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </Collapsible>
            </div>
            <div
              className={section('memos')}
              ref={(el) => {
                sectionRefs.current[1] = el;
              }}
            >
              <MemoList folded={memosFolded} onFold={fold(setMemosFolded)} />
            </div>
            <div
              className={section('tags')}
              ref={(el) => {
                sectionRefs.current[2] = el;
              }}
            >
              <TagTree folded={tagsFolded} onFold={fold(setTagsFolded)} onSelect={(tagId) => onSearch({ ...EMPTY_SEARCH, tagIds: [tagId] })} />
            </div>
          </div>
        )}
      </div>
      <OverlayScrollbar axis="y" testId="sidebar-thumb" />
      {/* The same keyed footer in both states, so the toggle keeps keyboard focus as the sidebar collapses. */}
      <footer key="footer" className="sidebar-footer">
        <SettingsMenu />
        <TrashButton />
        <button
          type="button"
          className="icon sidebar-toggle"
          onClick={onToggle}
          aria-label={t('sidebar.hide')}
          title={t('sidebar.hide')}
          data-testid="sidebar-toggle"
        >
          {SIDEBAR_ICON}
        </button>
      </footer>
    </nav>
  );
}
