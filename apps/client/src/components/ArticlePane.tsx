import { captureAnchor, type EntityType } from '@jot/core';
import {
  createMarkup, createQuote, createSideNote, deleteMarkup, EmptyArticleError, getArticle, listArticleTaggings, listBacklinks, listMarkups, listSideNotes, reattachMarkup, targetRange,
  saveRevision, type RevisionResult, type MarkupView,
} from '@jot/db';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { citationsOf } from '../article/citations';
import { excerpt } from '../article/excerpt';
import { markupRange, type ToolbarAction } from '../article/markupRange';
import { reportError } from '../data/errors';
import { useLibrary, useLibraryQuery } from '../data/LibraryContext';
import { useMemoContext } from '../memo/MemoContext';
import { ArticleView, type AnnotationIds, type ArticleViewHandle, type FlashTarget, type SelectionInfo } from './ArticleView';
import { ArticleEditor, type ArticleEditorHandle } from './ArticleEditor';
import { Margin } from './Margin';
import { MarkupPopover, type CitingMemo } from './MarkupPopover';
import { OrphanPanel } from './OrphanPanel';
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
  const markups = useLibraryQuery((l) => listMarkups(l, articleId), [articleId], ['article', 'markup', 'anchor']);
  const notes = useLibraryQuery((l) => listSideNotes(l, articleId), [articleId], ['side_note', 'markup']);
  const backlinks = useLibraryQuery((l) => listBacklinks(l, articleId), [articleId], [
    'article',
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
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<ArticleEditorHandle | null>(null);
  const [saving, setSaving] = useState(false);
  const [editNotice, setEditNotice] = useState<RevisionResult | 'unchanged' | null>(null);
  const [reattaching, setReattaching] = useState<MarkupView | null>(null);
  const [pendingSave, setPendingSave] = useState<RevisionResult | null>(null);
  const keepScroll = useRef<number | null>(null);
  const rememberScroll = () => {
    keepScroll.current = layoutRef.current?.closest('.reader')?.scrollTop ?? null;
  };

  // Swapping the reading view and the editor rebuilds the article's DOM: put the reader back where it was.
  useLayoutEffect(() => {
    const top = keepScroll.current;
    if (top === null || !(editing ? editor : handle)) return;
    const scroller = layoutRef.current?.closest('.reader');
    if (scroller) scroller.scrollTop = top;
    keepScroll.current = null;
  }, [editing, editor, handle]);

  // A saved fix-up leaves the editor only once the new text has loaded, so the old text never flashes back.
  useEffect(() => {
    if (!pendingSave || article.data?.revisionId !== pendingSave.revisionId) return;
    rememberScroll();
    setEditing(false);
    setEditNotice(pendingSave);
    setPendingSave(null);
  }, [pendingSave, article.data?.revisionId]);
  const clearFocus = useCallback(() => setFocusNoteId(null), []);
  const closePopover = useCallback(() => setPopover(null), []);

  // Following a memo link: find the target's current range, then scroll to it and flash it.
  useEffect(() => {
    if (!focus || focus.articleId !== articleId || !handle) return;
    let active = true;
    targetRange(lib, focus.targetType, focus.targetId).then((range) => {
      if (!active) return;
      settle(focus.token);
      if (!range || range.articleId !== articleId || range.status === 'orphan') {
        reportError(new Error(t(range?.status === 'orphan' ? 'memo.lostTarget' : 'memo.missingTarget')));
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
  const orphans = (markups.data ?? []).filter((m) => m.status === 'orphan');

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
    if (action === 'attach') {
      const markup = reattaching;
      setReattaching(null);
      if (markup) await reattachMarkup(lib, markup.id, { revisionId: a.revisionId, anchor });
      return;
    }
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

  const startEditing = () => {
    rememberScroll();
    setReattaching(null);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setPopover(null);
    setEditNotice(null);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      const result = await saveRevision(lib, articleId, editor.blocks());
      if (result) {
        setPendingSave(result);
      } else {
        rememberScroll();
        setEditing(false);
        setEditNotice('unchanged');
      }
    } catch (error) {
      reportError(error instanceof EmptyArticleError ? new Error(t('edit.empty')) : error);
    } finally {
      setSaving(false);
    }
  };

  const box = layoutRef.current?.getBoundingClientRect();
  const toolbarAt = selection && box ? { top: selection.rect.top - box.top - 6, left: Math.max(0, selection.rect.left - box.left) } : null;
  // The menu shows the words a markup covers now (a typo fixed inside it included), not its original quote.
  const popoverMarkups: MarkupView[] = popover
    ? (markups.data ?? [])
        .filter((m) => popover.markupIds.includes(m.id))
        .map((m) => (m.status === 'orphan' ? m : { ...m, exact: a.text.slice(m.start, m.end) }))
    : [];
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
        {editing ? (
          <div className="edit-bar" role="region" aria-label={t('edit.heading')} data-testid="edit-bar">
            <span className="muted">{t('edit.hint')}</span>
            <button type="button" onClick={() => void saveEdit()} disabled={saving || pendingSave !== null} data-testid="edit-save">
              {t('edit.save')}
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                rememberScroll();
                setEditing(false);
              }}
              disabled={saving || pendingSave !== null}
              data-testid="edit-cancel"
            >
              {t('edit.cancel')}
            </button>
          </div>
        ) : (
          <div className="article-tools">
            <button type="button" className="quiet" onClick={startEditing} data-testid="edit-start">
              {t('edit.start')}
            </button>
          </div>
        )}
        {editNotice && !editing && <EditNotice result={editNotice} onDismiss={() => setEditNotice(null)} />}
        {!editing && orphans.length > 0 && (
          <OrphanPanel
            orphans={orphans}
            notes={notes.data ?? []}
            onReattach={setReattaching}
            onDelete={(m) => {
              if (reattaching?.id === m.id) setReattaching(null);
              deleteMarkup(lib, m.id).catch(reportError);
            }}
          />
        )}
        {!editing && reattaching && (
          <div className="reattach-hint" role="status" data-testid="reattach-hint">
            <span>{t('orphans.hint', { exact: excerpt(reattaching.exact) })}</span>
            <button type="button" className="quiet" onClick={() => setReattaching(null)} data-testid="reattach-cancel">
              {t('orphans.cancel')}
            </button>
          </div>
        )}
        {editing ? (
          <ArticleEditor blocks={a.blocks} onReady={setEditor} />
        ) : (
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
        )}
      </article>
      {!editing && (
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
      )}
      {!editing && toolbarAt && <SelectionToolbar top={toolbarAt.top} left={toolbarAt.left} actions={reattaching ? ['attach'] : undefined} onAction={(k) => onAction(k).catch(reportError)} />}
      {!editing && popoverAt && (popoverMarkups.length > 0 || popoverMemos.length > 0) && (
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

/** What a fix-up save did: how the markups were found in the new text, or that nothing changed. */
function EditNotice({ result, onDismiss }: { result: RevisionResult | 'unchanged'; onDismiss(): void }) {
  const { t } = useTranslation();
  let text = t('edit.unchanged');
  if (result !== 'unchanged') {
    const { exact, mapped, fuzzy, orphan } = result.markups;
    text = exact + mapped + fuzzy + orphan === 0 ? t('edit.saved') : t('edit.savedMarkups', { kept: exact + mapped, moved: fuzzy, lost: orphan });
  }
  return (
    <p className="edit-notice" role="status" data-testid="edit-notice">
      <span>{text}</span>
      <button type="button" className="icon" aria-label={t('app.dismiss')} onClick={onDismiss}>
        ×
      </button>
    </p>
  );
}
