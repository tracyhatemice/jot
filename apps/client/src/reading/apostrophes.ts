import type { Node as PMNode } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
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

/** Where those apostrophes are in a document, block by block; a link chip counts as one character. */
export function apostropheRanges(doc: PMNode): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, undefined, '￼');
    for (const i of apostropheOffsets(text)) out.push({ from: pos + 1 + i, to: pos + 2 + i });
    return false;
  });
  return out;
}

/**
 * Marks the apostrophes of Chinese text, for the article view, the fix-mode editor and the memo editor. English
 * text is left alone: its apostrophes already have the English face, and a mark would split highlights around
 * them and break the kerning.
 */
export function latinApostrophes(inChinese: (doc: PMNode) => boolean): Plugin<DecorationSet> {
  const decorate = (doc: PMNode) =>
    inChinese(doc)
      ? DecorationSet.create(
          doc,
          apostropheRanges(doc).map((r) => Decoration.inline(r.from, r.to, { class: APOSTROPHE_CLASS })),
        )
      : DecorationSet.empty;
  return new Plugin<DecorationSet>({
    state: {
      init: (_, state) => decorate(state.doc),
      apply: (tr, set) => (tr.docChanged ? decorate(tr.doc) : set),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
