import { createMemo, deleteMemo, getMemo, listMemos, renameMemo, type MemoSummary } from '@jot/db';
import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { MemoEditor } from '../memo/MemoEditor';

export function MemoPane({ articleId }: { articleId: string | null }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const { bridge, follow } = useMemoContext();
  const home = useLibraryQuery(
    (l) => (articleId ? listMemos(l, articleId) : Promise.resolve<MemoSummary[]>([])),
    [articleId],
    ['memo'],
  );
  // Memos opened from elsewhere (a "cited in" link, or kept open across an article switch).
  const [openIds, setOpenIds] = useState<string[]>([]);
  const others = useLibraryQuery(
    async (l) => (await Promise.all(openIds.map((id) => getMemo(l, id)))).filter((m): m is MemoSummary => m !== null),
    [openIds.join('|')],
    ['memo'],
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const homeMemos = home.data ?? [];
  const extraMemos = (others.data ?? []).filter((m) => !homeMemos.some((h) => h.id === m.id));
  const listed = [...homeMemos, ...extraMemos];
  // The memo being written stays open when the writer switches to another article.
  const lastActive = useRef<MemoSummary | null>(null);
  const found = listed.find((m) => m.id === activeId);
  // While the lists reload after an article switch, keep showing that memo: remounting its editor
  // would lose the writer's place, scroll position and undo history.
  const kept = !found && activeId !== null && lastActive.current?.id === activeId ? lastActive.current : null;
  const tabs = kept ? [...listed, kept] : listed;
  const active = found ?? kept ?? homeMemos[0] ?? null;

  const keepOpen = useCallback((id: string) => setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id])), []);

  useEffect(() => {
    const previous = lastActive.current;
    if (previous && previous.homeArticleId !== articleId) {
      keepOpen(previous.id);
      setActiveId(previous.id);
    }
  }, [articleId, keepOpen]);
  useEffect(() => {
    lastActive.current = active;
  });

  const create = useCallback(async () => {
    if (!articleId) return;
    const title = t('memo.defaultTitle', { n: homeMemos.length + 1 });
    setActiveId(await createMemo(lib, { title, homeArticleId: articleId }));
  }, [lib, articleId, homeMemos.length, t]);

  useEffect(() => {
    bridge.onCreateMemo(() => {
      create().catch(reportError);
    });
    return () => bridge.onCreateMemo(null);
  }, [bridge, create]);

  useEffect(() => {
    bridge.onOpenMemo((id) => {
      keepOpen(id);
      setActiveId(id);
    });
    return () => bridge.onOpenMemo(null);
  }, [bridge, keepOpen]);

  const onReady = useCallback((editor: Editor | null) => bridge.attachEditor(editor), [bridge]);

  const remove = async (memo: MemoSummary) => {
    if (!window.confirm(t('memo.confirmDelete', { title: memo.title }))) return;
    await deleteMemo(lib, memo.id);
    setOpenIds((ids) => ids.filter((id) => id !== memo.id));
    setActiveId(null);
  };

  const close = (id: string) => {
    setOpenIds((ids) => ids.filter((x) => x !== id));
    if (active?.id === id) setActiveId(null);
  };

  if (!articleId && tabs.length === 0) {
    return (
      <>
        <h2>{t('memo.heading')}</h2>
        <p className="muted">{t('memo.noArticle')}</p>
      </>
    );
  }

  return (
    <div className="memo-pane">
      <header className="memo-header">
        <h2>{t('memo.heading')}</h2>
        {articleId && (
          <button type="button" onClick={() => create().catch(reportError)} data-testid="memo-new">
            {t('memo.new')}
          </button>
        )}
      </header>
      {tabs.length > 0 && (
        <div className="memo-tabs" role="tablist">
          {tabs.map((m) => (
            <span key={m.id} className={m.id === active?.id ? 'memo-tab active' : 'memo-tab'}>
              <button type="button" role="tab" aria-selected={m.id === active?.id} onClick={() => setActiveId(m.id)} data-testid="memo-tab">
                {m.title}
              </button>
              {!homeMemos.some((h) => h.id === m.id) && (
                <button type="button" className="icon" aria-label={t('memo.close')} onClick={() => close(m.id)}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {active ? (
        <section className="memo-body" key={active.id}>
          <MemoTitle memo={active} />
          <MemoEditor memoId={active.id} onReady={onReady} onFollow={follow} />
          <footer>
            <button type="button" className="quiet" onClick={() => remove(active).catch(reportError)} data-testid="memo-delete">
              {t('memo.delete')}
            </button>
          </footer>
        </section>
      ) : (
        <p className="muted" data-testid="memo-empty">
          {t('memo.empty')}
        </p>
      )}
    </div>
  );
}

function MemoTitle({ memo }: { memo: MemoSummary }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [title, setTitle] = useState(memo.title);

  useEffect(() => {
    setTitle(memo.title);
  }, [memo.title]);

  const save = () => {
    const clean = title.trim();
    if (clean && clean !== memo.title) renameMemo(lib, memo.id, clean).catch(reportError);
    else setTitle(memo.title);
  };

  return (
    <input
      className="memo-title"
      value={title}
      aria-label={t('memo.titleLabel')}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      data-testid="memo-title"
    />
  );
}
