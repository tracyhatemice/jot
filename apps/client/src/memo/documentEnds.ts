import { Extension } from '@tiptap/core';
import { Selection, TextSelection } from '@tiptap/pm/state';

/** The nearest ancestor that scrolls. */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let at = el.parentElement; at; at = at.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) return at;
  }
  return null;
}

/**
 * Ctrl/Cmd+Home and Ctrl/Cmd+End reach the start and end of the memo, and with Shift extend the selection there.
 * The browser can't move the caret past a link chip at the very start of a memo, so the editor does it. The start
 * scrolls the memo to its top, clear of the bars over it.
 */
export const DocumentEnds = Extension.create({
  name: 'documentEnds',

  addKeyboardShortcuts() {
    const go = (toEnd: boolean, extend: boolean) => () => {
      const { state, view } = this.editor;
      const target = toEnd ? Selection.atEnd(state.doc) : Selection.atStart(state.doc);
      const selection = extend ? TextSelection.between(state.selection.$anchor, target.$head) : target;
      view.dispatch(state.tr.setSelection(selection).scrollIntoView());
      if (!toEnd) scroller(view.dom)?.scrollTo({ top: 0 });
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
