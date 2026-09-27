import type { Block } from '@jot/core';
import type { MarkupView } from '@jot/db';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useRef } from 'react';
import { buildDecorations, markupIdsAt } from '../article/decorations';
import { blocksToDoc, offsetToPos, posToOffset } from '../article/schema';

export interface SelectionInfo {
  start: number;
  end: number;
  rect: DOMRect;
}

export interface ArticleViewHandle {
  /** Viewport coordinates of a canonical-text offset, or null if it cannot be measured. */
  coordsAtOffset(offset: number): { top: number; bottom: number; left: number } | null;
}

interface Props {
  revisionId: string;
  blocks: Block[];
  markups: MarkupView[];
  activeMarkupId: string | null;
  onSelection(selection: SelectionInfo | null): void;
  onMarkupClick(ids: string[], rect: DOMRect): void;
  onReady?(handle: ArticleViewHandle | null): void;
}

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
 * Read-only article rendered by ProseMirror (flat schema, pos = offset + 1). Markups are decorations,
 * so adding or removing one never rebuilds the document, the selection or the scroll position.
 * The selection is read from the DOM with posAtDOM, which does not depend on the view being editable.
 */
export function ArticleView(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { revisionId, markups, activeMarkupId } = props;

  // One view per revision (revisions are immutable).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { blocks, markups: initial, activeMarkupId: active, onReady } = latest.current;
    const doc = blocksToDoc(blocks);
    const decorations = buildDecorations(doc, initial, active);
    const view = new EditorView(host, {
      state: EditorState.create({ doc }),
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
    const decorations = buildDecorations(view.state.doc, markups, activeMarkupId);
    view.setProps({ decorations: () => decorations });
  }, [markups, activeMarkupId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const doc = host.ownerDocument;
    const onRelease = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      // Let the browser finish updating the selection first.
      setTimeout(() => {
        const view = viewRef.current;
        if (!view) return;
        const selection = readSelection(view, host);
        latest.current.onSelection(selection);
        if (!selection && target && host.contains(target)) {
          latest.current.onMarkupClick(markupIdsAt(target, host), target.getBoundingClientRect());
        }
      });
    };
    doc.addEventListener('mouseup', onRelease);
    doc.addEventListener('keyup', onRelease);
    return () => {
      doc.removeEventListener('mouseup', onRelease);
      doc.removeEventListener('keyup', onRelease);
    };
  }, []);

  return <div ref={hostRef} className="article-view" data-testid="article-view" />;
}
