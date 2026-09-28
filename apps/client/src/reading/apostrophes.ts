import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const LATIN = /\p{Script=Latin}/u;
const DIGIT = /\p{Nd}/u;

/** The class of an apostrophe that keeps the English face; the column's CSS gives it that face. */
export const APOSTROPHE_CLASS = 'latin-apostrophe';

/**
 * Offsets of ’ used as an apostrophe in a text block: inside an English word (don’t, O’Neill, 1990’s), or right
 * after one while no ‘ is open (students’). Every other ‘ and ’ is a Chinese single quotation mark. In Chinese text
 * the Chinese face draws quotation marks full-width; an apostrophe keeps the English face (spec §6.11).
 */
export function apostropheOffsets(text: string): number[] {
  const out: number[] = [];
  let open = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '‘') open++;
    if (text[i] !== '’') continue;
    const before = text[i - 1] ?? '';
    const after = text[i + 1] ?? '';
    const inWord = (LATIN.test(before) || DIGIT.test(before)) && LATIN.test(after);
    if (inWord || (LATIN.test(before) && open === 0)) out.push(i);
    else if (open > 0) open--;
  }
  return out;
}

/**
 * A leaf inline node counts as one character: a link chip as its label's last one, so a ’ right after a chip to
 * an English word is an apostrophe; anything else as U+FFFC.
 */
function leafChar(node: PMNode): string {
  const label: unknown = node.attrs.label;
  const last = typeof label === 'string' ? label.slice(-1) : '';
  return last.length === 1 ? last : '\uFFFC';
}

/** Where the apostrophes of one text block at `pos` are. */
function blockRanges(block: PMNode, pos: number): { from: number; to: number }[] {
  const text = block.textBetween(0, block.content.size, undefined, leafChar);
  return apostropheOffsets(text).map((i) => ({ from: pos + 1 + i, to: pos + 2 + i }));
}

/** Where those apostrophes are in a document, block by block. */
export function apostropheRanges(doc: PMNode): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    out.push(...blockRanges(node, pos));
    return false;
  });
  return out;
}

/** A text split around its apostrophes, each one wrapped for the English face: for text drawn outside a document. */
export function apostropheParts(text: string): (string | ['span', { class: string }, string])[] {
  const parts: (string | ['span', { class: string }, string])[] = [];
  let from = 0;
  for (const i of apostropheOffsets(text)) {
    if (i > from) parts.push(text.slice(from, i));
    parts.push(['span', { class: APOSTROPHE_CLASS }, '’']);
    from = i + 1;
  }
  if (from < text.length || parts.length === 0) parts.push(text.slice(from));
  return parts;
}

const mark = (r: { from: number; to: number }) => Decoration.inline(r.from, r.to, { class: APOSTROPHE_CLASS });

/**
 * Where a transaction changed the document, in its new positions; null when a step moved nothing (a mark or an
 * attribute, which could be a link chip's label), as then only a full rescan is sure.
 */
function changedRanges(tr: Transaction): [number, number][] | null {
  const out: [number, number][] = [];
  for (let i = 0; i < tr.mapping.maps.length; i++) {
    const rest = tr.mapping.slice(i + 1);
    let moved = false;
    tr.mapping.maps[i].forEach((_oldFrom, _oldTo, from, to) => {
      moved = true;
      out.push([rest.map(from, -1), rest.map(to, 1)]);
    });
    if (!moved) return null;
  }
  return out;
}

interface Marks {
  chinese: boolean;
  set: DecorationSet;
}

/**
 * Marks the apostrophes of Chinese text, for the article view, the fix-mode editor and the memo editor. English
 * text is left alone: its apostrophes already have the English face, and a mark would split highlights around
 * them and break the kerning. An edit rescans only the text blocks it touched.
 */
export function latinApostrophes(inChinese: (doc: PMNode) => boolean): Plugin<Marks> {
  const all = (doc: PMNode): Marks => {
    const chinese = inChinese(doc);
    return { chinese, set: chinese ? DecorationSet.create(doc, apostropheRanges(doc).map(mark)) : DecorationSet.empty };
  };
  return new Plugin<Marks>({
    state: {
      init: (_, state) => all(state.doc),
      apply(tr, prev) {
        if (!tr.docChanged) return prev;
        const touched = prev.chinese && inChinese(tr.doc) ? changedRanges(tr) : null;
        if (!touched) return all(tr.doc);
        let set = prev.set.map(tr.mapping, tr.doc);
        const size = tr.doc.content.size;
        for (const [from, to] of touched) {
          // One position wider on each side, so an edit at a block's edge rescans that block too.
          tr.doc.nodesBetween(Math.max(0, from - 1), Math.min(size, to + 1), (node, pos) => {
            if (!node.isTextblock) return true;
            set = set.remove(set.find(pos, pos + node.nodeSize)).add(tr.doc, blockRanges(node, pos).map(mark));
            return false;
          });
        }
        return { chinese: true, set };
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.set;
      },
    },
  });
}
