import { createMemo, listAllMemos } from '@jot/db';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { Collapsible } from './Collapsible';
import { SectionHeading } from './SectionHeading';
import { SECTION_ICONS } from './sectionIcons';

/** Every memo, most recently edited first (spec §6.9): memos outlive their article, so they stay reachable here. */
export function MemoList({ folded, onFold }: { folded: boolean; onFold(folded: boolean): void }) {
  const { t } = useTranslation();
  const { bridge } = useMemoContext();
  const { data: memos } = useLibraryQuery(listAllMemos, [], ['memo', 'memo_update', 'article']);
  const lib = useLibrary();
  // A standalone memo belongs to no article; it opens in the memo column (spec §6.11). It is numbered among the
  // standalone memos. A double click makes one memo: its second click is ignored, and so is a click while one is made.
  const creating = useRef(false);
  const create = async () => {
    if (creating.current) return;
    creating.current = true;
    try {
      const n = (memos ?? []).filter((m) => m.homeArticleId === null).length + 1;
      bridge.showMemo(await createMemo(lib, { title: t('memo.defaultTitle', { n }), homeArticleId: null }));
    } finally {
      creating.current = false;
    }
  };

  return (
    <>
      <SectionHeading
        title={t('memoList.heading')}
        icon={SECTION_ICONS.memos}
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
            onClick={(e) => e.detail < 2 && void create().catch(reportError)}
            data-testid="memo-standalone-new"
          >
            +
          </button>
        }
      />
      <Collapsible open={!folded}>
        {memos?.length === 0 && (
          <p className="section-empty" data-testid="memo-list-empty">
            {t('memoList.empty')}
          </p>
        )}
        <ul className="library memo-list" data-testid="memo-list">
          {memos?.map((m) => (
            <li key={m.id}>
              <button type="button" className="memo-list-item" onClick={() => bridge.showMemo(m.id)} onDoubleClick={() => bridge.keepMemo(m.id)} data-testid="memo-list-item">
                <span className="memo-list-title">{m.title}</span>
                <span className="memo-list-home">{m.homeTitle ?? t('memoList.noArticle')}</span>
              </button>
            </li>
          ))}
        </ul>
      </Collapsible>
    </>
  );
}
