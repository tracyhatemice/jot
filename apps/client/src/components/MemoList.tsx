import { listAllMemos } from '@jot/db';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { SectionHeading } from './SectionHeading';

/** Every memo, most recently edited first (spec §6.9): memos outlive their article, so they stay reachable here. */
export function MemoList({ folded, onFold }: { folded: boolean; onFold(folded: boolean): void }) {
  const { t } = useTranslation();
  const { bridge } = useMemoContext();
  const { data: memos } = useLibraryQuery(listAllMemos, [], ['memo', 'memo_update', 'article']);

  return (
    <>
      <SectionHeading title={t('memoList.heading')} route={{ name: 'memos' }} folded={folded} onFold={onFold} testId="section-memos" />
      {!folded && (
        <>
        {memos?.length === 0 && (
          <p className="muted" data-testid="memo-list-empty">
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
