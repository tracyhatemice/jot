import type { Block } from '@jot/core';
import type { MarkupView } from '@jot/db';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { annotationIdsAt, buildDecorations, type AnnotationIds, type Citation } from '../article/decorations';
import { latinApostrophes } from '../reading/apostrophes';
import { blocksToDoc, offsetToPos, posToOffset } from '../article/schema';

export type { AnnotationIds };

export interface SelectionInfo {
  start: number;
  end: number;
  rect: DOMRect;
}

export interface ArticleViewHandle {
  /** Viewport coordinates of a canonical-text offset, or null if it cannot be measured. */
  coordsAtOffset(offset: number): { top: number; bottom: number; left: number } | null;
}

/** Where a followed link landed; a new `token` scrolls there again. */
export interface FlashTarget {
  start: number;
  end: number;
  token: number;
}

interface Props {
  revisionId: string;
  blocks: Block[];
  /** Whether the article is Chinese, as detected at import: its apostrophes in English words get marked. */
  chinese: boolean;
  markups: MarkupView[];
  activeMarkupId: string | null;
  flash?: FlashTarget | null;
  citations?: readonly Citation[];
  onSelection(selection: SelectionInfo | null): void;
  onAnnotationClick(ids: AnnotationIds, rect: DOMRect): void;
  onReady?(handle: ArticleViewHandle | null): void;
  /** Markups whose side notes show as an icon after their text, the icon's name, and what a click on one does (spec §6.13). */
  noteIcons?: readonly string[];
  noteIconLabel?: string;
  onNoteIcon?(markupId: string, rect: DOMRect): void;
}

const NO_CITATIONS: readonly Citation[] = [];

/** Canonical offsets of the DOM selection, or null when it is empty, only whitespace, or reaches outside `root`. */
function readSelection(view: EditorView, root: HTMLElement): SelectionInfo | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const max = view.state.doc.content.size - 2;
  const clamp = (offset: number) => Math.max(0, Math.min(max, offset));
  const a = clamp(posToOffset(view.posAtDOM(range.startContainer, range.startOffset)));
  const b = clamp(posToOffset(view.posAtDOM(range.endContainer, range.endOffset)));
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  // Nothing to mark up: an empty or whitespace-only selection shows no toolbar.
  if (view.state.doc.textBetween(offsetToPos(start), offsetToPos(end), ' ').trim() === '') return null;
  return { start, end, rect: range.getBoundingClientRect() };
}

/**
 * Read-only article rendered by ProseMirror (flat schema, pos = offset + 1). Markups, citations and the
 * flash are decorations, so none of them rebuilds the document, the selection or the scroll position.
 * The selection is read from the DOM with posAtDOM, which does not depend on the view being editable.
 */
export function ArticleView(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { revisionId, markups, activeMarkupId, flash = null, citations = NO_CITATIONS, noteIcons, noteIconLabel = '' } = props;

  // One view per revision (revisions are immutable). Built before the browser paints, so switching from
  // the editor (or to a new revision) never shows an empty frame or a reader scrolled to the top.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { blocks, markups: initial, activeMarkupId: activeId, onReady } = latest.current;
    const doc = blocksToDoc(blocks);
    const decorations = buildDecorations(doc, initial, {
      activeId,
      flash: latest.current.flash ?? null,
      citations: latest.current.citations ?? NO_CITATIONS,
      noteIcons: latest.current.noteIcons ? { markupIds: latest.current.noteIcons, label: latest.current.noteIconLabel ?? '' } : undefined,
    });
    const view = new EditorView(host, {
      state: EditorState.create({ doc, plugins: [latinApostrophes(() => latest.current.chinese)] }),
      editable: () => false,
      decorations: () => decorations,
    });
    viewRef.current = view;
    onReady?.({
      coordsAtOffset: (offset) => {
        try {
          return view.coordsAtPos(offsetToPos(offset));
        } catch {
          return null;
        }
      },
    });
    return () => {
      latest.current.onReady?.(null);
      view.destroy();
      viewRef.current = null;
    };
  }, [revisionId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const decorations = buildDecorations(view.state.doc, markups, {
      activeId: activeMarkupId,
      flash,
      citations,
      noteIcons: noteIcons ? { markupIds: noteIcons, label: noteIconLabel } : undefined,
    });
    view.setProps({ decorations: () => decorations });
  }, [markups, activeMarkupId, flash, citations, noteIcons, noteIconLabel]);

  // Bring a followed link's target into view.
  const flashToken = flash?.token;
  useEffect(() => {
    const view = viewRef.current;
    const target = latest.current.flash;
    if (!view || !target) return;
    const { node } = view.domAtPos(offsetToPos(target.start));
    (node instanceof Element ? node : node.parentElement)?.scrollIntoView({ block: 'center' });
  }, [flashToken]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const doc = host.ownerDocument;
    const onRelease = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.note-icon')) return;
      const target = event.target instanceof Element ? event.target : null;
      // Let the browser finish updating the selection first.
      setTimeout(() => {
        const view = viewRef.current;
        if (!view) return;
        const selection = readSelection(view, host);
        latest.current.onSelection(selection);
        if (!selection && target && host.contains(target)) {
          latest.current.onAnnotationClick(annotationIdsAt(target, host), target.getBoundingClientRect());
        }
      });
    };
    const onClick = (event: MouseEvent) => {
      const icon = event.target instanceof Element ? event.target.closest<HTMLElement>('.note-icon') : null;
      if (icon?.dataset.noteMarkup) latest.current.onNoteIcon?.(icon.dataset.noteMarkup, icon.getBoundingClientRect());
    };
    host.addEventListener('click', onClick);
    doc.addEventListener('mouseup', onRelease);
    doc.addEventListener('keyup', onRelease);
    return () => {
      doc.removeEventListener('mouseup', onRelease);
      doc.removeEventListener('keyup', onRelease);
      host.removeEventListener('click', onClick);
    };
  }, []);

  return <div ref={hostRef} className="article-view" data-testid="article-view" />;
}
