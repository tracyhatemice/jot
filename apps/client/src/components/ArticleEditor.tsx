import type { Block } from '@jot/core';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { articleSchema, blocksToDoc, docToBlocks } from '../article/schema';
import { latinApostrophes } from '../reading/apostrophes';

export interface ArticleEditorHandle {
  /** The edited text as blocks. */
  blocks(): Block[];
}

interface Props {
  blocks: Block[];
  /** Whether the article is Chinese, as detected at import: its apostrophes in English words get marked. */
  chinese: boolean;
  onReady(handle: ArticleEditorHandle | null): void;
}

/**
 * The article text, editable for fix-ups (spec §6.6): the same flat schema as the reading view, with
 * undo/redo and the bold and italic keys. Changes stay here until the pane saves them.
 */
/** Room kept between the caret and the column's edges: the article bar above, the floating fix bar below (spec §6.10). */
const CLEAR_TOP = 48;
const CLEAR_BOTTOM = 96;

/**
 * Keeps the caret clear of the bars. The editor's scroll margins cover its own scrolling, but arrow keys
 * often move the caret natively and the browser scrolls only just far enough; this corrects that too.
 */
const keepCaretClear = new Plugin({
  view: () => ({
    update(view, prev) {
      if (!view.hasFocus() || view.state.selection.eq(prev.selection)) return;
      const scroller = view.dom.closest('.reader');
      if (!scroller) return;
      const caret = view.coordsAtPos(view.state.selection.head);
      const box = scroller.getBoundingClientRect();
      if (caret.top < box.top + CLEAR_TOP) scroller.scrollTop -= box.top + CLEAR_TOP - caret.top;
      else if (caret.bottom > box.bottom - CLEAR_BOTTOM) scroller.scrollTop += caret.bottom - (box.bottom - CLEAR_BOTTOM);
    },
  }),
});

export function ArticleEditor({ blocks, chinese, onReady }: Props) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const initial = useRef(blocks);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const chineseRef = useRef(chinese);
  chineseRef.current = chinese;
  // Read once: rebuilding the view (for example on a language switch) would lose the edits.
  const label = useRef(t('edit.label'));

  // Built before the browser paints, so switching from the reading view never shows an empty or shifted frame.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView(host, {
      state: EditorState.create({
        doc: blocksToDoc(initial.current),
        plugins: [
          history(),
          keymap({
            'Mod-z': undo,
            'Shift-Mod-z': redo,
            'Mod-y': redo,
            'Mod-b': toggleMark(articleSchema.marks.strong),
            'Mod-i': toggleMark(articleSchema.marks.em),
          }),
          keymap(baseKeymap),
          keepCaretClear,
          latinApostrophes(() => chineseRef.current),
        ],
      }),
      attributes: { 'aria-label': label.current, spellcheck: 'false' },
      // Keep the caret clear of the article bar at the top and the floating fix bar at the bottom (spec §6.10).
      scrollMargin: { top: CLEAR_TOP, bottom: CLEAR_BOTTOM, left: 5, right: 5 },
      scrollThreshold: { top: CLEAR_TOP, bottom: CLEAR_BOTTOM, left: 0, right: 0 },
    });
    view.focus();
    readyRef.current({ blocks: () => docToBlocks(view.state.doc) });
    return () => {
      readyRef.current(null);
      view.destroy();
    };
  }, []);

  return <div ref={hostRef} className="article-view article-editor" data-testid="article-editor" />;
}
