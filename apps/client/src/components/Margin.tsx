import { deleteSideNote, updateSideNote, type MarkupView, type SideNoteView } from '@jot/db';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { layoutMargin } from '../article/margin';
import { reportError } from '../data/errors';
import { useLibrary } from '../data/LibraryContext';
import type { ArticleViewHandle } from './ArticleView';
import { TagChips } from './TagChips';

interface MarginProps {
  notes: SideNoteView[];
  markups: MarkupView[];
  handle: ArticleViewHandle | null;
  focusNoteId: string | null;
  onFocusHandled(): void;
  onActivate(markupId: string | null): void;
  onLink(note: SideNoteView, body: string): void;
  articleId: string;
  tagsOf(noteId: string): string[];
}

const sameTops = (a: Map<string, number>, b: Map<string, number>) =>
  a.size === b.size && [...a].every(([id, top]) => b.get(id) === top);

/** Side notes beside their markups: each card starts at its anchor's line and is pushed down to avoid overlap. */
export function Margin({ notes, markups, handle, focusNoteId, onFocusHandled, onActivate, onLink, articleId, tagsOf }: MarginProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [tops, setTops] = useState<Map<string, number>>(new Map());
  const [version, setVersion] = useState(0);
  const relayout = () => setVersion((v) => v + 1);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !handle) return;
    const base = root.getBoundingClientRect().top;
    const byId = new Map(markups.map((m) => [m.id, m] as const));
    const items = notes.flatMap((note) => {
      const markup = byId.get(note.markupId);
      const coords = markup && markup.status !== 'orphan' ? handle.coordsAtOffset(markup.start) : null;
      const card = cards.current.get(note.id);
      return coords && card ? [{ id: note.id, top: coords.top - base, height: card.offsetHeight }] : [];
    });
    const next = layoutMargin(items);
    setTops((prev) => (sameTops(prev, next) ? prev : next));
  }, [notes, markups, handle, version]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Reflow of the article (window resize, fonts) moves the anchors.
    const observer = new ResizeObserver(() => setVersion((v) => v + 1));
    observer.observe(root.parentElement ?? root);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="margin" ref={rootRef} data-testid="margin">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          top={tops.get(note.id)}
          autoFocus={note.id === focusNoteId}
          register={(el) => {
            if (el) cards.current.set(note.id, el);
            else cards.current.delete(note.id);
          }}
          onFocusHandled={onFocusHandled}
          onResize={relayout}
          onActivate={onActivate}
          onLink={(body) => onLink(note, body)}
          articleId={articleId}
          tagIds={tagsOf(note.id)}
        />
      ))}
    </div>
  );
}

interface NoteCardProps {
  note: SideNoteView;
  top: number | undefined;
  autoFocus: boolean;
  register(el: HTMLElement | null): void;
  onFocusHandled(): void;
  onResize(): void;
  onActivate(markupId: string | null): void;
  onLink(body: string): void;
  articleId: string;
  tagIds: string[];
}

/** Typing pauses this long before a note is saved. */
const SAVE_DELAY_MS = 400;

function NoteCard({ note, top, autoFocus, register, onFocusHandled, onResize, onActivate, onLink, articleId, tagIds }: NoteCardProps) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [body, setBody] = useState(note.body);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const savedRef = useRef(note.body);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef(onResize);
  resizeRef.current = onResize;
  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === 'undefined') return;
    // Adding or removing a tag changes the card's height, and the cards below it must move.
    const observer = new ResizeObserver(() => resizeRef.current());
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  // Adopt changes made elsewhere. Our own saves come back as note.body === savedRef.current and are
  // skipped, so a refresh never overwrites what the user typed after the save started.
  useEffect(() => {
    if (note.body === savedRef.current) return;
    savedRef.current = note.body;
    setBody(note.body);
  }, [note.body]);

  // Saves unsaved, non-empty text. Called after a typing pause, on blur, when the page is hidden or
  // unloaded, and on unmount (route change) — so text survives reloads and closed windows.
  const flush = useCallback(() => {
    const text = bodyRef.current;
    if (text === savedRef.current || text.trim() === '') return;
    savedRef.current = text;
    updateSideNote(lib, note.id, text).catch(reportError);
  }, [lib, note.id]);

  useEffect(() => {
    if (body === savedRef.current) return;
    const timer = setTimeout(flush, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [body, flush]);

  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  // Focus a freshly created note once it has been positioned (hidden elements cannot take focus).
  useEffect(() => {
    if (autoFocus && top !== undefined) {
      areaRef.current?.focus();
      onFocusHandled();
    }
  }, [autoFocus, top, onFocusHandled]);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight}px`;
    onResize();
  }, [body]);

  const onBlur = () => {
    onActivate(null);
    // A note left empty is removed; anything else is saved now rather than after the delay.
    if (bodyRef.current.trim() === '') deleteSideNote(lib, note.id).catch(reportError);
    else flush();
  };

  return (
    <div
      className="note"
      ref={(el) => {
        cardRef.current = el;
        register(el);
      }}
      style={{ top: top ?? 0, visibility: top === undefined ? 'hidden' : 'visible' }}
      data-testid="side-note"
    >
      <textarea
        ref={areaRef}
        value={body}
        rows={1}
        placeholder={t('notes.placeholder')}
        aria-label={t('notes.placeholder')}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => onActivate(note.markupId)}
        onBlur={onBlur}
      />
      <TagChips target={{ entityType: 'side_note', entityId: note.id, articleId }} tagIds={tagIds} testId="note-tags" />
      <footer>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onLink(bodyRef.current)} data-testid="note-link">
          {t('notes.link')}
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => deleteSideNote(lib, note.id).catch(reportError)}
          data-testid="note-delete"
        >
          {t('notes.delete')}
        </button>
      </footer>
    </div>
  );
}
