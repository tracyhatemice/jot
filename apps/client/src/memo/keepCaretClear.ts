import { Extension } from '@tiptap/core';
import { keepCaretClear } from '../editing/keepCaretClear';

/** Room kept above the caret for the tab strip and the memo bar (36 px each), and below it. */
export const MEMO_CLEAR_TOP = 80;
export const MEMO_CLEAR_BOTTOM = 16;

/** Keeps a memo's caret clear of the tab strip and the memo bar, also when arrow keys move it (spec §6.10). */
export const KeepCaretClear = Extension.create({
  name: 'keepCaretClear',

  addProseMirrorPlugins() {
    return [keepCaretClear({ scroller: '.memo', top: MEMO_CLEAR_TOP, bottom: MEMO_CLEAR_BOTTOM })];
  },
});
