import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { APOSTROPHE_CLASS, apostropheRanges } from '../reading/apostrophes';

const decorate = (doc: PMNode) =>
  DecorationSet.create(
    doc,
    apostropheRanges(doc).map((r) => Decoration.inline(r.from, r.to, { class: APOSTROPHE_CLASS })),
  );

/** Marks the memo's apostrophes in English words, which keep the English face in Chinese text (spec §6.11). */
export const LatinApostrophes = Extension.create({
  name: 'latinApostrophes',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        state: {
          init: (_, state) => decorate(state.doc),
          apply: (tr, set) => (tr.docChanged ? decorate(tr.doc) : set),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
