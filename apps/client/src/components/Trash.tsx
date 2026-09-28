import { eraseTrashEntries, listTrash, trashEntryRows, type TrashEntry, type TrashKind } from '@jot/db';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { restoreLibraryItems } from '../data/libraryFile';
import { showNotice } from '../data/notices';
import { routeHash } from '../router';

const TRASH_TABLES = ['article', 'memo', 'tag', 'markup', 'side_note', 'anchor', 'tagging', 'tag_edge'] as const;
const KIND_LABEL = { article: 'trash.kindArticle', memo: 'trash.kindMemo', tag: 'trash.kindTag' } as const satisfies Record<TrashKind, string>;

/** The Trash (spec §6.9): deleted articles, memos and tags, newest first, to restore or erase. */
export function TrashView() {
  const { t, i18n } = useTranslation();
  const lib = useLibrary();
  const { data: entries, error } = useLibraryQuery(listTrash, [], TRASH_TABLES);
  const [busy, setBusy] = useState(false);

  const run = (work: () => Promise<void>) => {
    setBusy(true);
    work()
      .catch(reportError)
      .finally(() => setBusy(false));
  };
  const name = (e: TrashEntry) => e.title || t('trash.untitled');
  const restore = (e: TrashEntry) =>
    run(async () => {
      await restoreLibraryItems(lib, await trashEntryRows(lib, e.kind, e.id));
      showNotice(t('trash.restored', { title: name(e) }));
    });
  const erase = (e: TrashEntry) => {
    if (window.confirm(t('trash.confirmErase', { title: name(e) }))) run(() => eraseTrashEntries(lib, [e]));
  };
  const empty = () => {
    if (entries?.length && window.confirm(t('trash.confirmEmpty', { count: entries.length }))) run(() => eraseTrashEntries(lib, entries));
  };
  const comesBack = (e: TrashEntry) => {
    if (e.kind === 'article' && e.markups + e.sideNotes > 0) return t('trash.withArticle', { markups: e.markups, sideNotes: e.sideNotes });
    if (e.kind === 'tag' && e.taggings > 0) return t('trash.withTag', { taggings: e.taggings });
    return null;
  };

  return (
    <section className="trash" data-testid="trash-view">
      <header className="trash-header">
        <h1>{t('trash.heading')}</h1>
        <button type="button" disabled={busy || !entries?.length} onClick={empty} data-testid="trash-empty">
          {t('trash.empty')}
        </button>
      </header>
      <p className="muted">{t('trash.hint')}</p>
      {error && (
        <p className="error" role="alert">
          {t('app.error')} {error.message}
        </p>
      )}
      {entries?.length === 0 && (
        <p className="muted" data-testid="trash-none">
          {t('trash.none')}
        </p>
      )}
      <ul className="trash-list">
        {entries?.map((e) => (
          <li key={`${e.kind}:${e.id}`} data-testid="trash-entry">
            <div className="trash-entry">
              <span className="trash-kind">{t(KIND_LABEL[e.kind])}</span>
              <strong>{name(e)}</strong>
              {comesBack(e) && <span className="muted">{comesBack(e)}</span>}
              <span className="muted">{t('trash.deletedAt', { when: new Date(e.deletedAt).toLocaleString(i18n.language) })}</span>
            </div>
            <div className="trash-actions">
              <button type="button" disabled={busy} onClick={() => restore(e)} data-testid="trash-restore">
                {t('trash.restore')}
              </button>
              <button type="button" className="quiet" disabled={busy} onClick={() => erase(e)} data-testid="trash-erase">
                {t('trash.erase')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The Trash button at the bottom of the sidebar (spec §6.10: no count). */
export function TrashButton() {
  const { t } = useTranslation();
  return (
    <a className="icon trash-open" href={routeHash({ name: 'trash' })} aria-label={t('trash.open')} title={t('trash.open')} data-testid="trash-open">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />
      </svg>
    </a>
  );
}
