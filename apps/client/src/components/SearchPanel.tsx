import { ENTITY_TYPES, findHighlights, makeSnippet, type EntityType, type SyncedTable } from '@jot/core';
import { searchLibrary, type SearchResult } from '@jot/db';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { navigate } from '../router';
import { useTagIndex } from '../tags/TagContext';
import { TagPicker } from './TagPicker';

export interface SearchState {
  /** What the search box shows, including text an input method is still composing. */
  draft: string;
  /** What is searched for. */
  query: string;
  types: EntityType[];
  tagIds: string[];
  /** Also match items inside articles that carry the tags (spec §6.3; off by default). */
  inherit: boolean;
}

export const EMPTY_SEARCH: SearchState = { draft: '', query: '', types: [], tagIds: [], inherit: false };

/** A search runs while there is a query (not just spaces) or a tag filter. */
export function isSearching(state: SearchState): boolean {
  return state.query.trim() !== '' || state.tagIds.length > 0;
}

/** A commit to any of these can change what a search finds or shows. */
const SEARCH_TABLES: SyncedTable[] = [
  'article',
  'article_revision',
  'anchor',
  'markup',
  'side_note',
  'memo',
  'memo_update',
  'tag',
  'tag_edge',
  'tagging',
];

interface Props {
  state: SearchState;
  onChange(next: SearchState): void;
}

/** The sidebar's search field. Text an input method is still composing is shown but not searched yet. */
export function SearchBox({ state, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <input
      type="search"
      className="search-input"
      value={state.draft}
      placeholder={t('search.placeholder')}
      aria-label={t('search.placeholder')}
      onChange={(e) => {
        const composing = (e.nativeEvent as InputEvent).isComposing === true;
        onChange({ ...state, draft: e.target.value, query: composing ? state.query : e.target.value });
      }}
      onCompositionEnd={(e) => onChange({ ...state, draft: e.currentTarget.value, query: e.currentTarget.value })}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) onChange(EMPTY_SEARCH);
      }}
      data-testid="search-input"
    />
  );
}

/** `text` with the query's matches marked; a finite `radius` cuts a snippet around the first match. */
function Highlighted({ text, query, radius = Infinity }: { text: string; query: string; radius?: number }) {
  const snippet = makeSnippet(text, findHighlights(text, query), radius);
  return (
    <>
      {snippet.cutStart && '…'}
      {snippet.parts.map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
      {snippet.cutEnd && '…'}
    </>
  );
}

/** Filters and results, shown in place of the library list while searching (spec §6.3). */
export function SearchPanel({ state, onChange }: Props) {
  const { t } = useTranslation();
  const { byId } = useTagIndex();
  const { bridge, follow } = useMemoContext();
  const [pickingTag, setPickingTag] = useState(false);
  const results = useLibraryQuery(
    (l) => searchLibrary(l, { text: state.query, types: state.types, tagIds: state.tagIds, inherit: state.inherit, limit: 50 }),
    [state.query, state.types.join('|'), state.tagIds.join('|'), state.inherit],
    SEARCH_TABLES,
  );

  const toggleType = (type: EntityType) =>
    onChange({ ...state, types: state.types.includes(type) ? state.types.filter((x) => x !== type) : [...state.types, type] });

  const open = (r: SearchResult) => {
    if (r.entityType === 'article') navigate({ name: 'article', id: r.entityId });
    else if (r.entityType === 'memo') bridge.showMemo(r.entityId);
    else if (r.articleId) follow({ targetType: r.entityType, targetId: r.entityId, articleId: r.articleId, label: '' });
  };

  return (
    <section className="search-panel" data-testid="search-panel">
      <div className="search-types" role="group" aria-label={t('search.types')}>
        {ENTITY_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={state.types.includes(type)}
            onClick={() => toggleType(type)}
            data-testid={`search-type-${type}`}
          >
            {t(`search.type.${type}`)}
          </button>
        ))}
      </div>
      <div className="search-tags">
        {state.tagIds.map((id) => {
          const name = byId.get(id)?.name ?? '…';
          return (
            <span key={id} className="tag-chip">
              <span data-testid="search-tag">{name}</span>
              <button
                type="button"
                className="tag-chip-remove"
                aria-label={t('tags.remove', { name })}
                onClick={() => onChange({ ...state, tagIds: state.tagIds.filter((x) => x !== id) })}
              >
                ×
              </button>
            </span>
          );
        })}
        {pickingTag ? (
          <TagPicker
            exclude={new Set(state.tagIds)}
            onPick={(tag) => onChange({ ...state, tagIds: [...state.tagIds, tag.id] })}
            onClose={() => setPickingTag(false)}
          />
        ) : (
          <button type="button" className="tag-add" onClick={() => setPickingTag(true)} data-testid="search-add-tag">
            {t('search.addTag')}
          </button>
        )}
      </div>
      {state.tagIds.length > 0 && (
        <label className="search-inherit">
          <input
            type="checkbox"
            checked={state.inherit}
            onChange={(e) => onChange({ ...state, inherit: e.target.checked })}
            data-testid="search-inherit"
          />
          {t('search.inherit')}
        </label>
      )}
      <button type="button" className="quiet" onClick={() => onChange(EMPTY_SEARCH)} data-testid="search-clear">
        {t('search.clear')}
      </button>
      {results.error && (
        <p className="error" role="alert">
          {t('app.error')} {results.error.message}
        </p>
      )}
      {results.data?.length === 0 && (
        <p className="muted" data-testid="search-empty">
          {t('search.none')}
        </p>
      )}
      <ul className="search-results">
        {results.data?.map((r) => (
          <li key={`${r.entityType}:${r.entityId}`}>
            <button
              type="button"
              className="search-result"
              onClick={() => open(r)}
              data-testid="search-result"
              data-entity-type={r.entityType}
            >
              <span className="search-result-type">{t(`search.kind.${r.entityType}`)}</span>
              <span className="search-result-title">
                <Highlighted text={r.entityType === 'article' || r.entityType === 'memo' ? r.title : (r.articleTitle ?? '')} query={state.query} />
              </span>
              {r.text && (
                <span className="search-snippet">
                  <Highlighted text={r.text} query={state.query} radius={40} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
