import { captureAnchor, type EntityType } from '@jot/core';
import {
  createMarkup, createQuote, createSideNote, deleteMarkup, getArticle, listArticleTaggings, listBacklinks, listMarkups, listSideNotes, targetRange,
  type MarkupView,
} from '@jot/db';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { citationsOf } from '../article/citations';
import { excerpt } from '../article/excerpt';
import { markupRange, type ToolbarAction } from '../article/markupRange';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { ArticleView, type AnnotationIds, type ArticleViewHandle, type FlashTarget, type SelectionInfo } from './ArticleView';
import { Margin } from './Margin';
import { MarkupPopover, type CitingMemo } from './MarkupPopover';
import { SelectionToolbar } from './SelectionToolbar';
import { TagChips } from './TagChips';

interface PopoverState extends AnnotationIds {
  rect: DOMRect;
}

const FLASH_MS = 1600;

export function ArticlePane({ articleId }: { articleId: string }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const { bridge, focus, settle } = useMemoContext();
  const article = useLibraryQuery((l) => getArticle(l, articleId), [articleId], ['article', 'article_revision']);
  const markups = useLibraryQuery((l) => listMarkups(l, articleId), [articleId], ['markup', 'anchor']);
  const notes = useLibraryQuery((l) => listSideNotes(l, articleId), [articleId], ['side_note', 'markup']);
  const backlinks = useLibraryQuery((l) => listBacklinks(l, articleId), [articleId], [
    'memo',
    'memo_update',
    'markup',
    'side_note',
    'anchor',
  ]);
  const citations = useMemo(() => citationsOf(backlinks.data ?? []), [backlinks.data]);
  const taggings = useLibraryQuery((l) => listArticleTaggings(l, articleId), [articleId], ['tagging']);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [activeMarkupId, setActiveMarkupId] = useState<string | null>(null);
  const [handle, setHandle] = useState<ArticleViewHandle | null>(null);
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [flash, setFlash] = useState<FlashTarget | null>(null);
  const clearFocus = useCallback(() => setFocusNoteId(null), []);
  const closePopover = useCallback(() => setPopover(null), []);

  // Following a memo link: find the target's current range, then scroll to it and flash it.
  useEffect(() => {
    if (!focus || focus.articleId !== articleId || !handle) return;
    let active = true;
    targetRange(lib, focus.targetType, focus.targetId).then((range) => {
      if (!active) return;
      settle(focus.token);
      if (!range || range.articleId !== articleId) {
        reportError(new Error(t('memo.missingTarget')));
        return;
      }
      setFlash({ start: range.start, end: range.end, token: focus.token });
    }, reportError);
    return () => {
      active = false;
    };
  }, [focus, handle, articleId, lib, t, settle]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

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
  const tagIdsOf = (entityType: EntityType, entityId: string) =>
    (taggings.data ?? []).filter((x) => x.entityType === entityType && x.entityId === entityId).map((x) => x.tagId);

  const addNote = async (markupId: string) => {
    setActiveMarkupId(markupId);
    setFocusNoteId(await createSideNote(lib, { markupId, articleId, body: '' }));
  };

  const onAction = async (action: ToolbarAction) => {
    const sel = selection;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    if (!sel) return;
    const range = markupRange(a.text, sel);
    if (!range) return;
    const anchor = captureAnchor(a.text, range.start, range.end);
    if (action === 'quote') {
      const anchorId = await createQuote(lib, { articleId, revisionId: a.revisionId, anchor });
      bridge.insertLink({ targetType: 'anchor', targetId: anchorId, articleId, label: excerpt(anchor.exact) });
      return;
    }
    const style = action === 'note' ? 'highlight' : action;
    const { markupId } = await createMarkup(lib, { articleId, revisionId: a.revisionId, anchor, style });
    setActiveMarkupId(markupId);
    if (action === 'note') await addNote(markupId);
  };

  const onSelection = (next: SelectionInfo | null) => {
    setSelection(next);
    if (next) setPopover(null);
  };

  const onAnnotationClick = (ids: AnnotationIds, rect: DOMRect) => {
    setActiveMarkupId(ids.markupIds[0] ?? null);
    setPopover(ids.markupIds.length > 0 || ids.memoIds.length > 0 ? { ...ids, rect } : null);
  };

  const box = layoutRef.current?.getBoundingClientRect();
  const toolbarAt = selection && box ? { top: selection.rect.top - box.top - 6, left: Math.max(0, selection.rect.left - box.left) } : null;
  const popoverMarkups: MarkupView[] = popover ? (markups.data ?? []).filter((m) => popover.markupIds.includes(m.id)) : [];
  const popoverMemos: CitingMemo[] = popover
    ? popover.memoIds.flatMap((id) => {
        const cite = (backlinks.data ?? []).find((b) => b.memoId === id);
        return cite ? [{ id, title: cite.memoTitle }] : [];
      })
    : [];
  const popoverAt = popover && box ? { top: popover.rect.bottom - box.top + 6, left: Math.max(0, popover.rect.left - box.left) } : null;

  return (
    <div className="article-layout" ref={layoutRef}>
      <article lang={a.lang === 'zh' ? 'zh-CN' : 'en'}>
        <h1 className="article-title" data-testid="article-title">
          {a.title}
        </h1>
        {a.author && <p className="byline">{a.author}</p>}
        <TagChips
          className="article-tags"
          target={{ entityType: 'article', entityId: articleId, articleId }}
          tagIds={tagIdsOf('article', articleId)}
          testId="article-tags"
        />
        <ArticleView
          revisionId={a.revisionId}
          blocks={a.blocks}
          markups={markups.data ?? []}
          activeMarkupId={activeMarkupId}
          flash={flash}
          citations={citations}
          onSelection={onSelection}
          onAnnotationClick={onAnnotationClick}
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
        articleId={articleId}
        tagsOf={(noteId) => tagIdsOf('side_note', noteId)}
        onLink={(note, body) =>
          bridge.insertLink({ targetType: 'side_note', targetId: note.id, articleId, label: excerpt(body) || t('notes.untitled') })
        }
      />
      {toolbarAt && <SelectionToolbar top={toolbarAt.top} left={toolbarAt.left} onAction={(k) => onAction(k).catch(reportError)} />}
      {popoverAt && (popoverMarkups.length > 0 || popoverMemos.length > 0) && (
        <MarkupPopover
          markups={popoverMarkups}
          memos={popoverMemos}
          articleId={articleId}
          tagsOf={(markupId) => tagIdsOf('markup', markupId)}
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
          onLinkInMemo={(m) => {
            setPopover(null);
            bridge.insertLink({ targetType: 'markup', targetId: m.id, articleId, label: excerpt(m.exact) });
          }}
          onOpenMemo={(memoId) => {
            setPopover(null);
            bridge.showMemo(memoId);
          }}
        />
      )}
    </div>
  );
}
