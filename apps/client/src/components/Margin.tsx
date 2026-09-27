import { deleteSideNote, updateSideNote, type MarkupView, type SideNoteView } from '@jot/db';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { layoutMargin } from '../article/margin';
import { useLibrary } from '../data/LibraryContext';
import type { ArticleViewHandle } from './ArticleView';

interface MarginProps {
  notes: SideNoteView[];
  markups: MarkupView[];
  handle: ArticleViewHandle | null;
  focusNoteId: string | null;
  onFocusHandled(): void;
  onActivate(markupId: string | null): void;
}

const sameTops = (a: Map<string, number>, b: Map<string, number>) =>
  a.size === b.size && [...a].every(([id, top]) => b.get(id) === top);

/** Side notes beside their markups: each card starts at its anchor's line and is pushed down to avoid overlap. */
export function Margin({ notes, markups, handle, focusNoteId, onFocusHandled, onActivate }: MarginProps) {
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
}

function NoteCard({ note, top, autoFocus, register, onFocusHandled, onResize, onActivate }: NoteCardProps) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [body, setBody] = useState(note.body);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBody(note.body);
  }, [note.body]);

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

  const save = async () => {
    onActivate(null);
    if (body.trim() === '') await deleteSideNote(lib, note.id);
    else if (body !== note.body) await updateSideNote(lib, note.id, body);
  };

  return (
    <div className="note" ref={register} style={{ top: top ?? 0, visibility: top === undefined ? 'hidden' : 'visible' }} data-testid="side-note">
      <textarea
        ref={areaRef}
        value={body}
        rows={1}
        placeholder={t('notes.placeholder')}
        aria-label={t('notes.placeholder')}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => onActivate(note.markupId)}
        onBlur={() => void save()}
      />
      <footer>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void deleteSideNote(lib, note.id)} data-testid="note-delete">
          {t('notes.delete')}
        </button>
      </footer>
    </div>
  );
}
