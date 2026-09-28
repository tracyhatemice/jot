import { Plugin } from 'prosemirror-state';

/** Room kept between the caret and the edges of the column that scrolls it, in px. */
export interface CaretClearance {
  /** The scrolling column, as a selector for the editor's nearest match. */
  scroller: string;
  top: number;
  bottom: number;
}

/**
 * Keeps the caret clear of a column's bars. The editor's scroll margins cover its own scrolling, but arrow keys
 * often move the caret natively and the browser scrolls only just far enough; this corrects that too.
 */
export function keepCaretClear({ scroller: selector, top, bottom }: CaretClearance): Plugin {
  return new Plugin({
    view: () => ({
      update(view, prev) {
        if (!view.hasFocus() || view.state.selection.eq(prev.selection)) return;
        const scroller = view.dom.closest(selector);
        if (!scroller) return;
        const caret = view.coordsAtPos(view.state.selection.head);
        const box = scroller.getBoundingClientRect();
        if (caret.top < box.top + top) scroller.scrollTop -= box.top + top - caret.top;
        else if (caret.bottom > box.bottom - bottom) scroller.scrollTop += caret.bottom - (box.bottom - bottom);
      },
    }),
  });
}
