import type { MarkupView } from '@jot/db';
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { offsetToPos } from './schema';

const ID_PREFIX = 'mk-id-';

/**
 * Markups as inline decorations styled by `mk-<style>` (underline, bold, highlight), including
 * markups saved as whole paragraphs. Overlapping decorations share one span listing every markup id.
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
    const attrs = { class: `mk mk-${m.style} ${ID_PREFIX}${m.id}${m.id === activeId ? ' mk-active' : ''}` };
    decorations.push(Decoration.inline(offsetToPos(start), offsetToPos(end), attrs, { markupId: m.id }));
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
