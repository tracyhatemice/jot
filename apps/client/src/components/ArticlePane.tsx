import { captureAnchor } from '@jot/core';
import { createMarkup, createSideNote, deleteMarkup, getArticle, listMarkups, listSideNotes, type MarkupView } from '@jot/db';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { markupRange, type ToolbarAction } from '../article/markupRange';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { ArticleView, type ArticleViewHandle, type SelectionInfo } from './ArticleView';
import { Margin } from './Margin';
import { MarkupPopover } from './MarkupPopover';
import { SelectionToolbar } from './SelectionToolbar';

interface PopoverState {
  ids: string[];
  rect: DOMRect;
}

export function ArticlePane({ articleId }: { articleId: string }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const article = useLibraryQuery((l) => getArticle(l, articleId), [articleId]);
  const markups = useLibraryQuery((l) => listMarkups(l, articleId), [articleId]);
  const notes = useLibraryQuery((l) => listSideNotes(l, articleId), [articleId]);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [activeMarkupId, setActiveMarkupId] = useState<string | null>(null);
  const [handle, setHandle] = useState<ArticleViewHandle | null>(null);
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const clearFocus = useCallback(() => setFocusNoteId(null), []);
  const closePopover = useCallback(() => setPopover(null), []);

  const a = article.data;
  if (article.error) {
    return (
      <p className="empty error" role="alert">
        {t('app.error')} {article.error.message}
      </p>
    );
  }
  if (article.loading && !a) return <p className="empty">{t('article.loading')}</p>;
  if (!a) return <p className="empty">{t('article.missing')}</p>;

  const addNote = async (markupId: string) => {
    setActiveMarkupId(markupId);
    setFocusNoteId(await createSideNote(lib, { markupId, articleId, body: '' }));
  };

  const onAction = async (action: ToolbarAction) => {
    const sel = selection;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    if (!sel) return;
    const range = markupRange(action, a, sel);
    if (!range) return;
    const anchor = captureAnchor(a.text, range.start, range.end, action === 'paragraph' ? 'block' : 'range');
    const kind = action === 'note' ? 'term' : action;
    const { markupId } = await createMarkup(lib, { articleId, revisionId: a.revisionId, anchor, kind });
    setActiveMarkupId(markupId);
    if (action === 'note') await addNote(markupId);
  };

  const onSelection = (next: SelectionInfo | null) => {
    setSelection(next);
    if (next) setPopover(null);
  };

  const onMarkupClick = (ids: string[], rect: DOMRect) => {
    setActiveMarkupId(ids[0] ?? null);
    setPopover(ids.length > 0 ? { ids, rect } : null);
  };

  const box = layoutRef.current?.getBoundingClientRect();
  const toolbarAt = selection && box ? { top: selection.rect.top - box.top - 6, left: Math.max(0, selection.rect.left - box.left) } : null;
  const popoverMarkups: MarkupView[] = popover ? (markups.data ?? []).filter((m) => popover.ids.includes(m.id)) : [];
  const popoverAt = popover && box ? { top: popover.rect.bottom - box.top + 6, left: Math.max(0, popover.rect.left - box.left) } : null;

  return (
    <div className="article-layout" ref={layoutRef}>
      <article lang={a.lang === 'zh' ? 'zh-CN' : 'en'}>
        <h1 className="article-title" data-testid="article-title">
          {a.title}
        </h1>
        {a.author && <p className="byline">{a.author}</p>}
        <ArticleView
          revisionId={a.revisionId}
          blocks={a.blocks}
          markups={markups.data ?? []}
          activeMarkupId={activeMarkupId}
          onSelection={onSelection}
          onMarkupClick={onMarkupClick}
          onReady={setHandle}
        />
      </article>
      <Margin
        notes={notes.data ?? []}
        markups={markups.data ?? []}
        handle={handle}
        focusNoteId={focusNoteId}
        onFocusHandled={clearFocus}
        onActivate={setActiveMarkupId}
      />
      {toolbarAt && <SelectionToolbar top={toolbarAt.top} left={toolbarAt.left} onAction={(k) => onAction(k).catch(reportError)} />}
      {popoverAt && popoverMarkups.length > 0 && (
        <MarkupPopover
          markups={popoverMarkups}
          top={popoverAt.top}
          left={popoverAt.left}
          onClose={closePopover}
          onRemove={(m) => {
            setPopover(null);
            setActiveMarkupId(null);
            deleteMarkup(lib, m.id).catch(reportError);
          }}
          onAddNote={(m) => {
            setPopover(null);
            addNote(m.id).catch(reportError);
          }}
        />
      )}
    </div>
  );
}
