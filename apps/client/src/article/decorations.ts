import type { TextRange } from '@jot/core';
import type { MarkupView } from '@jot/db';
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { offsetToPos } from './schema';

const ID_PREFIX = 'mk-id-';
const CITE_PREFIX = 'cite-m-';

export interface Citation {
  start: number;
  end: number;
  memoIds: readonly string[];
}

export interface DecorationOptions {
  activeId?: string | null;
  /** A briefly highlighted range: where a followed memo link landed. */
  flash?: TextRange | null;
  /** Ranges cited by memos (spec §6.5 backlinks). */
  citations?: readonly Citation[];
}

/**
 * Markups as inline decorations styled by `mk-<style>` (underline, bold, highlight), plus memo citations
 * (`cited`) and the flash. Overlapping decorations share one span whose class lists every id.
 */
export function buildDecorations(doc: PMNode, markups: readonly MarkupView[], options: DecorationOptions = {}): DecorationSet {
  const max = doc.content.size - 2; // length of the canonical text
  const clamp = (offset: number) => Math.max(0, Math.min(max, offset));
  const decorations: Decoration[] = [];
  const add = (start: number, end: number, cls: string, spec: object) => {
    const s = clamp(start);
    const e = clamp(end);
    if (e > s) decorations.push(Decoration.inline(offsetToPos(s), offsetToPos(e), { class: cls }, spec));
  };
  for (const m of markups) {
    if (m.status === 'orphan') continue;
    add(m.start, m.end, `mk mk-${m.style} ${ID_PREFIX}${m.id}${m.id === options.activeId ? ' mk-active' : ''}`, { markupId: m.id });
    // The active markup's first and last characters close its outline, which is otherwise drawn only above and
    // below, so pieces split by other marks join without seams. A character is one or two UTF-16 units.
    if (m.id === options.activeId && m.end > m.start) {
      const unit = (offset: number) => doc.textBetween(offsetToPos(clamp(offset)), offsetToPos(clamp(offset + 1)));
      const first = /[\uD800-\uDBFF]/.test(unit(m.start)) ? 2 : 1;
      const last = /[\uDC00-\uDFFF]/.test(unit(m.end - 1)) ? 2 : 1;
      add(m.start, m.start + first, 'mk-active-start', {});
      add(m.end - last, m.end, 'mk-active-end', {});
    }
  }
  for (const c of options.citations ?? []) {
    add(c.start, c.end, `cited ${c.memoIds.map((id) => `${CITE_PREFIX}${id}`).join(' ')}`, { citedBy: [...c.memoIds] });
  }
  if (options.flash) add(options.flash.start, options.flash.end, 'flash', { flash: true });
  return DecorationSet.create(doc, decorations);
}

export interface AnnotationIds {
  markupIds: string[];
  memoIds: string[];
}

/** Markup ids and citing-memo ids on `el` and its ancestors up to (not including) `root`. */
export function annotationIdsAt(el: Element, root: Element): AnnotationIds {
  const markupIds = new Set<string>();
  const memoIds = new Set<string>();
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    for (const cls of node.classList) {
      if (cls.startsWith(ID_PREFIX)) markupIds.add(cls.slice(ID_PREFIX.length));
      else if (cls.startsWith(CITE_PREFIX)) memoIds.add(cls.slice(CITE_PREFIX.length));
    }
  }
  return { markupIds: [...markupIds], memoIds: [...memoIds] };
}
