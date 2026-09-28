import { Extension } from '@tiptap/core';
import { Selection, TextSelection } from '@tiptap/pm/state';

/**
 * Ctrl/Cmd+Home and Ctrl/Cmd+End reach the start and end of the memo, and with Shift extend the selection there.
 * The browser can't move the caret past a link chip at the very start of a memo, so the editor does it.
 */
export const DocumentEnds = Extension.create({
  name: 'documentEnds',

  addKeyboardShortcuts() {
    const go = (toEnd: boolean, extend: boolean) => () => {
      const { state, view } = this.editor;
      const target = toEnd ? Selection.atEnd(state.doc) : Selection.atStart(state.doc);
      const selection = extend ? TextSelection.between(state.selection.$anchor, target.$head) : target;
      view.dispatch(state.tr.setSelection(selection).scrollIntoView());
      return true;
    };
    return {
      'Mod-Home': go(false, false),
      'Mod-End': go(true, false),
      'Shift-Mod-Home': go(false, true),
      'Shift-Mod-End': go(true, true),
    };
  },
});
