import { createMemo, deleteMemo, getMemo, listArticles, listMemos, MissingArticleError, renameMemo, setMemoHome, tagsOf, type MemoSummary } from '@jot/db';
import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { MemoEditor } from '../memo/MemoEditor';
import { styleVars, type TextLang } from '../reading/readingStyle';
import { useReadingStyle } from '../reading/useReadingStyle';
import { navigate } from '../router';
import { ArticlePicker } from './ArticlePicker';
import { ColumnBar } from './ColumnBar';
import { Menu } from './Menu';
import { OverlayScrollbar } from './OverlayScrollbar';
import { ReadingControls } from './ReadingControls';
import { TagChips } from './TagChips';
import { useTabStrip } from './useTabStrip';

export function MemoPane({
  articleId,
  column,
  onPresence,
}: {
  articleId: string | null;
  /** The column this pane scrolls in. */
  column: HTMLElement | null;
  onPresence?(open: boolean): void;
}) {
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
  const articles = useLibraryQuery(listArticles, [], ['article']);
  const homeTitle = (m: MemoSummary) => articles.data?.find((a) => a.id === m.homeArticleId)?.title ?? null;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [style, setStyle] = useReadingStyle('memo');
  const [readingOpen, setReadingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moving, setMoving] = useState<MemoSummary | null>(null);
  // On a screen without an article, the memo column is only for a memo opened there (spec §6.10).
  const [shownHere, setShownHere] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

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

  // The shell shows the memo column only while an article or a memo is open (spec §6.10).
  const present = tabs.length > 0 && (articleId !== null || shownHere);
  const presence = useRef(onPresence);
  presence.current = onPresence;
  useEffect(() => presence.current?.(present), [present]);

  const keepOpen = useCallback((id: string) => setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id])), []);

  useEffect(() => setShownHere(false), [articleId]);
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

  // A double click makes one memo: its second click is ignored, and so is a click while one is made.
  const creating = useRef(false);
  const create = useCallback(async () => {
    if (!articleId || creating.current) return;
    creating.current = true;
    try {
      const title = t('memo.defaultTitle', { n: homeMemos.length + 1 });
      setActiveId(await createMemo(lib, { title, homeArticleId: articleId }));
    } finally {
      creating.current = false;
    }
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
      setShownHere(true);
    });
    return () => bridge.onOpenMemo(null);
  }, [bridge, keepOpen]);

  const onReady = useCallback((editor: Editor | null) => bridge.attachEditor(editor), [bridge]);
  // The open memo's language, which its editor finds in its text (spec §6.11): it decides its punctuation.
  const [lang, setLang] = useState<TextLang>('en');

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

  // The active tab scrolls into view in the strip, clear of the + at its end; the wheel scrolls it sideways.
  useTabStrip(stripRef, '.memo-tab.active', active?.id, tabs.length);

  // The moved memo becomes a home memo of that article: it shows among its tabs, not as a carried tab (spec §6.10).
  const moveTo = async (memo: MemoSummary, target: string) => {
    try {
      await setMemoHome(lib, memo.id, target);
    } catch (error) {
      reportError(error instanceof MissingArticleError ? new Error(t('memo.moveGone')) : error);
      return;
    }
    setOpenIds((ids) => ids.filter((id) => id !== memo.id));
    lastActive.current = { ...memo, homeArticleId: target };
    setActiveId(memo.id);
    if (target !== articleId) navigate({ name: 'article', id: target });
  };

  if (!articleId && tabs.length === 0) {
    return (
      <p className="muted memo-empty" data-testid="memo-empty">
        {t('memo.noArticle')}
      </p>
    );
  }

  return (
    <div className="memo-pane" style={styleVars(style, 'memo', lang) as CSSProperties}>
      <div className="memo-tabs-bar">
        <div className="memo-tabs" role="tablist" aria-label={t('memo.heading')} ref={stripRef} data-testid="memo-tabs">
          {tabs.map((m) => {
            // A memo that doesn't belong to the open article gets its own tint and names its home (spec §6.11).
            const foreign = articleId !== null && m.homeArticleId !== articleId;
            const home = foreign ? homeTitle(m) : null;
            return (
              <span
                key={m.id}
                className={['memo-tab', m.id === active?.id && 'active', foreign && 'foreign'].filter(Boolean).join(' ')}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={m.id === active?.id}
                  title={foreign ? (home ? t('memo.fromArticle', { title: home }) : t('memoList.noArticle')) : undefined}
                  onClick={() => setActiveId(m.id)}
                  data-testid="memo-tab"
                >
                  {m.title}
                </button>
                {!homeMemos.some((h) => h.id === m.id) && (
                  <button type="button" className="icon" aria-label={t('memo.close')} onClick={() => close(m.id)}>
                    ×
                  </button>
                )}
              </span>
            );
          })}
          {articleId && (
            <button type="button" className="icon memo-new" aria-label={t('memo.new')} title={t('memo.new')} onClick={(e) => e.detail < 2 && create().catch(reportError)} data-testid="memo-new">
              +
            </button>
          )}
        </div>
        <OverlayScrollbar axis="x" testId="memo-tabs-thumb" />
      </div>
      {active ? (
        <section className="memo-body" key={active.id}>
          <ColumnBar scrollSelector=".memo" pinned={readingOpen || menuOpen} testId="memo-bar">
            <ReadingControls kind="memo" style={style} onChange={setStyle} onOpenChange={setReadingOpen} />
            <Menu
              label={t('memo.menu')}
              testId="memo-menu"
              onOpenChange={setMenuOpen}
              items={[
                { label: t('memo.move'), onSelect: () => setMoving(active), testId: 'memo-move' },
                { label: t('memo.delete'), onSelect: () => void remove(active).catch(reportError), testId: 'memo-delete' },
              ]}
            />
          </ColumnBar>
          <div className="memo-content">
            <MemoTitle memo={active} />
            <MemoTags memoId={active.id} />
            <MemoEditor memoId={active.id} column={column} onReady={onReady} onFollow={follow} onLang={setLang} />
          </div>
        </section>
      ) : (
        <p className="muted memo-empty" data-testid="memo-empty">
          {t('memo.empty')}
        </p>
      )}
      {moving && (
        <ArticlePicker
          heading={t('memo.moveHeading', { title: moving.title })}
          excludeId={moving.homeArticleId}
          onPick={(target) => void moveTo(moving, target)}
          onClose={() => setMoving(null)}
        />
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

function MemoTags({ memoId }: { memoId: string }) {
  const tags = useLibraryQuery((l) => tagsOf(l, 'memo', memoId), [memoId], ['tagging']);
  return <TagChips target={{ entityType: 'memo', entityId: memoId, articleId: null }} tagIds={tags.data ?? []} testId="memo-tags" />;
}
