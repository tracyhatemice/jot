import type { MarkupView } from '@jot/db';
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { offsetToPos } from './schema';

const ID_PREFIX = 'mk-id-';

/**
 * Markups as decorations: inline highlights for term/line, block decorations for paragraph.
 * Overlapping inline decorations share one span whose class lists every markup id.
 */
export function buildDecorations(doc: PMNode, markups: readonly MarkupView[], activeId: string | null = null): DecorationSet {
  const max = doc.content.size - 2; // length of the canonical text
  const clamp = (offset: number) => Math.max(0, Math.min(max, offset));
  const decorations: Decoration[] = [];
  for (const m of markups) {
    if (m.status === 'orphan') continue;
    const start = clamp(m.start);
    const end = clamp(m.end);
    if (end <= start) continue;
    const attrs = { class: `mk mk-${m.kind} ${ID_PREFIX}${m.id}${m.id === activeId ? ' mk-active' : ''}` };
    const spec = { markupId: m.id };
    if (m.kind === 'paragraph') {
      doc.nodesBetween(offsetToPos(start), offsetToPos(end), (node, pos) => {
        if (node.isTextblock) decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs, spec));
        return false;
      });
    } else {
      decorations.push(Decoration.inline(offsetToPos(start), offsetToPos(end), attrs, spec));
    }
  }
  return DecorationSet.create(doc, decorations);
}

/** Markup ids on `el` and its ancestors up to (not including) `root`. */
export function markupIdsAt(el: Element, root: Element): string[] {
  const ids = new Set<string>();
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    for (const cls of node.classList) if (cls.startsWith(ID_PREFIX)) ids.add(cls.slice(ID_PREFIX.length));
  }
  return [...ids];
}
