import {
  deleteArticle, deleteMemo, deleteTag, getArticle, listAllMemos, listArticles, listEdges, listTags, MissingArticleError, renameTag, setMemoHome, tagUsage,
  type ArticleDetail, type ArticleSummary, type MemoListItem, type TagRow,
} from '@jot/db';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { navigate, routeHash } from '../router';
import { useReportTagError } from '../tags/errors';
import { tagPaths } from '../tags/tagPaths';
import { ArticleDetailsDialog } from './ArticleDetailsDialog';
import { ArticlePicker } from './ArticlePicker';
import { Menu } from './Menu';
import { NameInput } from './TagTree';
import { useRowOpen } from './useRowOpen';

/** The Library page (spec §6.10): every article, newest first, with its author and the date it was added. */
export function LibraryPage({ onKeep }: { onKeep(id: string): void }) {
  const { t, i18n } = useTranslation();
  const lib = useLibrary();
  const rowOpen = useRowOpen();
  const { data: articles } = useLibraryQuery(listArticles, [], ['article']);
  const [editing, setEditing] = useState<ArticleDetail | null>(null);

  const edit = async (id: string) => setEditing(await getArticle(lib, id));
  const remove = async (a: ArticleSummary) => {
    if (window.confirm(t('library.confirmDelete', { title: a.title }))) await deleteArticle(lib, a.id);
  };

  return (
    <section className="page" data-testid="library-page">
      <h1>{t('library.heading')}</h1>
      {articles?.length === 0 && <p className="muted">{t('library.empty')}</p>}
      <ul className="page-list">
        {articles?.map((a) => (
          <li key={a.id} className="page-row" data-testid="page-row">
            <a
              className="page-row-main"
              href={routeHash({ name: 'article', id: a.id })}
              onClick={(e) => rowOpen(e, () => navigate({ name: 'article', id: a.id }), () => onKeep(a.id))}
              data-testid="row-main"
            >
              <strong>{a.title}</strong>
              <span className="muted">{[a.author, new Date(a.createdAt).toLocaleDateString(i18n.language)].filter(Boolean).join(' · ')}</span>
            </a>
            <Menu
              label={t('page.rowMenu')}
              testId="row-menu"
              items={[
                { label: t('page.open'), onSelect: () => navigate({ name: 'article', id: a.id }), testId: 'row-open' },
                { label: t('details.open'), onSelect: () => void edit(a.id).catch(reportError), testId: 'row-edit' },
                { label: t('library.delete'), onSelect: () => void remove(a).catch(reportError), testId: 'row-delete' },
              ]}
            />
          </li>
        ))}
      </ul>
      {editing && <ArticleDetailsDialog article={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** The Memos page (spec §6.10): every memo, most recently edited first, with its home article. */
export function MemosPage() {
  const { t } = useTranslation();
  const lib = useLibrary();
  const { bridge } = useMemoContext();
  const { data: memos } = useLibraryQuery(listAllMemos, [], ['memo', 'memo_update', 'article']);
  const [moving, setMoving] = useState<MemoListItem | null>(null);

  // A memo opens in the memo column, with its home article when it has one.
  const open = (m: MemoListItem) => {
    if (m.homeTitle !== null && m.homeArticleId) navigate({ name: 'article', id: m.homeArticleId });
    bridge.showMemo(m.id);
  };
  const remove = async (m: MemoListItem) => {
    if (window.confirm(t('memo.confirmDelete', { title: m.title }))) await deleteMemo(lib, m.id);
  };

  return (
    <section className="page" data-testid="memos-page">
      <h1>{t('memoList.heading')}</h1>
      {memos?.length === 0 && <p className="muted">{t('memoList.empty')}</p>}
      <ul className="page-list">
        {memos?.map((m) => (
          <li key={m.id} className="page-row" data-testid="page-row">
            <button type="button" className="page-row-main" onClick={() => open(m)} data-testid="row-main">
              <strong>{m.title}</strong>
              <span className="muted">{m.homeTitle ?? t('memoList.noArticle')}</span>
            </button>
            <Menu
              label={t('page.rowMenu')}
              testId="row-menu"
              items={[
                { label: t('page.open'), onSelect: () => open(m), testId: 'row-open' },
                { label: t('memo.move'), onSelect: () => setMoving(m), testId: 'row-move' },
                { label: t('memo.delete'), onSelect: () => void remove(m).catch(reportError), testId: 'row-delete' },
              ]}
            />
          </li>
        ))}
      </ul>
      {moving && (
        <ArticlePicker
          heading={t('memo.moveHeading', { title: moving.title })}
          excludeId={moving.homeArticleId}
          onPick={(target) =>
            void setMemoHome(lib, moving.id, target).catch((error: unknown) =>
              reportError(error instanceof MissingArticleError ? new Error(t('memo.moveGone')) : error),
            )
          }
          onClose={() => setMoving(null)}
        />
      )}
    </section>
  );
}

/** The Tags page (spec §6.10): every tag with its paths and how many items it is on; a row searches it. */
export function TagsPage({ onSearchTag }: { onSearchTag(tagId: string): void }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const report = useReportTagError();
  const { data } = useLibraryQuery(
    async (l) => ({ tags: await listTags(l), edges: await listEdges(l), usage: await tagUsage(l) }),
    [],
    ['tag', 'tag_edge', 'tagging', 'article', 'markup', 'side_note', 'memo'],
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const paths = useMemo(() => tagPaths(data?.tags ?? [], data?.edges ?? []), [data]);
  const rows = useMemo(
    () => [...(data?.tags ?? [])].sort((a, b) => (paths.get(a.id)?.[0] ?? a.name).localeCompare(paths.get(b.id)?.[0] ?? b.name)),
    [data, paths],
  );

  const remove = (tag: TagRow) => {
    if (window.confirm(t('tags.confirmDelete', { name: tag.name }))) deleteTag(lib, tag.id).catch(report);
  };

  return (
    <section className="page" data-testid="tags-page">
      <h1>{t('tags.heading')}</h1>
      {rows.length === 0 && <p className="muted">{t('tags.empty')}</p>}
      <ul className="page-list">
        {rows.map((tag) => (
          <li key={tag.id} className="page-row" data-testid="page-row">
            {renaming === tag.id ? (
              <NameInput
                label={t('tags.renameLabel', { name: tag.name })}
                initial={tag.name}
                testId="tag-rename-input"
                onDone={(name) => {
                  setRenaming(null);
                  if (name && name !== tag.name) renameTag(lib, tag.id, name).catch(report);
                }}
              />
            ) : (
              <button type="button" className="page-row-main" onClick={() => onSearchTag(tag.id)} data-testid="row-main">
                <strong>{tag.name}</strong>
                <span className="muted">
                  {[(paths.get(tag.id) ?? []).filter((p) => p !== tag.name).join(t('page.pathJoin')), t('page.items', { count: data?.usage[tag.id] ?? 0 })]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            )}
            <Menu
              label={t('page.rowMenu')}
              testId="row-menu"
              items={[
                { label: t('tags.rename'), onSelect: () => setRenaming(tag.id), testId: 'row-rename' },
                { label: t('tags.delete'), onSelect: () => remove(tag), testId: 'row-delete' },
              ]}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
