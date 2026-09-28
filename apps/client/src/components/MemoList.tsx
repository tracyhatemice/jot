import { createMemo, listAllMemos } from '@jot/db';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { SectionHeading } from './SectionHeading';

/** Every memo, most recently edited first (spec §6.9): memos outlive their article, so they stay reachable here. */
export function MemoList({ folded, onFold }: { folded: boolean; onFold(folded: boolean): void }) {
  const { t } = useTranslation();
  const { bridge } = useMemoContext();
  const { data: memos } = useLibraryQuery(listAllMemos, [], ['memo', 'memo_update', 'article']);
  const lib = useLibrary();
  // A standalone memo belongs to no article; it opens in the memo column (spec §6.11).
  const create = async () => {
    const id = await createMemo(lib, { title: t('memo.defaultTitle', { n: (memos?.length ?? 0) + 1 }), homeArticleId: null });
    bridge.showMemo(id);
  };

  return (
    <>
      <SectionHeading
        title={t('memoList.heading')}
        route={{ name: 'memos' }}
        folded={folded}
        onFold={onFold}
        testId="section-memos"
        action={
          <button
            type="button"
            className="icon"
            aria-label={t('memoList.new')}
            title={t('memoList.new')}
            onClick={() => void create().catch(reportError)}
            data-testid="memo-standalone-new"
          >
            +
          </button>
        }
      />
      {!folded && (
        <>
            {memos?.length === 0 && (
              <p className="section-empty" data-testid="memo-list-empty">
                {t('memoList.empty')}
              </p>
            )}
            <ul className="library memo-list" data-testid="memo-list">
              {memos?.map((m) => (
                <li key={m.id}>
                  <button type="button" className="memo-list-item" onClick={() => bridge.showMemo(m.id)} data-testid="memo-list-item">
                    <span className="memo-list-title">{m.title}</span>
                    <span className="memo-list-home">{m.homeTitle ?? t('memoList.noArticle')}</span>
                  </button>
                </li>
              ))}
            </ul>
        </>
      )}
    </>
  );
}
