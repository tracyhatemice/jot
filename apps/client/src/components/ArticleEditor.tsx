import type { Block } from '@jot/core';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { articleSchema, blocksToDoc, docToBlocks } from '../article/schema';

export interface ArticleEditorHandle {
  /** The edited text as blocks. */
  blocks(): Block[];
}

interface Props {
  blocks: Block[];
  onReady(handle: ArticleEditorHandle | null): void;
}

/**
 * The article text, editable for fix-ups (spec §6.6): the same flat schema as the reading view, with
 * undo/redo and the bold and italic keys. Changes stay here until the pane saves them.
 */
export function ArticleEditor({ blocks, onReady }: Props) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const initial = useRef(blocks);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  // Read once: rebuilding the view (for example on a language switch) would lose the edits.
  const label = useRef(t('edit.label'));

  useEffect(() => {
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
        ],
      }),
      attributes: { 'aria-label': label.current, spellcheck: 'false' },
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
