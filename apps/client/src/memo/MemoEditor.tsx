import { appendMemoUpdate, getMemoState } from '@jot/db';
import Collaboration from '@tiptap/extension-collaboration';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Y from 'yjs';
import { reportError } from '../data/errors';
import { useLibrary } from '../data/LibraryContext';
import type { TextLang } from '../reading/readingStyle';
import { AnchorLink } from './anchorLink';
import { DocumentEnds } from './documentEnds';
import { KeepCaretClear, MEMO_CLEAR_BOTTOM, MEMO_CLEAR_TOP } from './keepCaretClear';
import { LatinApostrophes } from './latinApostrophes';
import { memoLang } from './memoLang';
import type { LinkTarget } from './bridge';
import { LinkSuggestion, type LinkSuggestionState } from './linkSuggestion';
import { LinkSuggestionList, type LinkSuggestionListHandle } from './LinkSuggestionList';
import { findPassages } from './passages';
import { storageJournal } from './journal';
import { MemoBubbleMenu, memoBubbleMenu, memoMenuElement } from './MemoBubbleMenu';
import { memoDerived } from './memoDerived';
import { createMemoSaver } from './memoSaver';
import { LOAD_ORIGIN, openMemoDoc } from './openMemoDoc';
import { trackSave, whenSaved } from './saves';

/** Typing pauses this long before a memo is saved (it is also saved on hide, unload and unmount). */
const SAVE_DELAY_MS = 500;

interface Props {
  memoId: string;
  /** The column the memo scrolls in, which its formatting menu follows. */
  column: HTMLElement | null;
  onReady(editor: Editor | null): void;
  onFollow(link: LinkTarget): void;
  onLang(lang: TextLang): void;
}

export function MemoEditor({ memoId, column, onReady, onFollow, onLang }: Props) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [doc, setDoc] = useState<Y.Doc | null>(null);

  useEffect(() => {
    let active = true;
    whenSaved(memoId)
      .then(() => openMemoDoc(lib, memoId, storageJournal(lib.deviceId)))
      .then((d) => {
        if (active) setDoc(d);
      }, reportError);
    return () => {
      active = false;
    };
  }, [lib, memoId]);

  if (!doc) return <p className="muted">{t('article.loading')}</p>;
  return <LoadedMemoEditor memoId={memoId} column={column} doc={doc} onReady={onReady} onFollow={onFollow} onLang={onLang} />;
}

function LoadedMemoEditor({ memoId, column, doc, onReady, onFollow, onLang }: Props & { doc: Y.Doc }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const followRef = useRef(onFollow);
  followRef.current = onFollow;

  // An import changes a memo's stored updates without a commit (announced with an empty id): bring them into
  // the open document, so it shows them and its next save keeps their links and text. Applying an update
  // twice is harmless, and loaded updates are never saved again.
  useEffect(
    () =>
      lib.subscribe((ops) => {
        if (!ops.some((op) => op.table === 'memo_update' && op.id === '')) return;
        getMemoState(lib, memoId)
          .then((state) => {
            if (state.snapshot) Y.applyUpdate(doc, state.snapshot, LOAD_ORIGIN);
            for (const update of state.updates) Y.applyUpdate(doc, update.data, LOAD_ORIGIN);
          })
          .catch(reportError);
      }),
    [lib, memoId, doc],
  );

  const [suggest, setSuggest] = useState<LinkSuggestionState | null>(null);
  const listRef = useRef<LinkSuggestionListHandle>(null);
  // The formatting menu is one of the editor's plugins from the start. Added later, it would rebuild them all, and
  // the Yjs binding would then put back a selection it saved earlier, undoing one the writer had just made.
  const [menu] = useState(memoMenuElement);
  const editor = useEditor(
    {
      extensions: [
        // Collaboration keeps its own (Yjs) undo history, so the built-in one is turned off.
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: doc }),
        AnchorLink,
        DocumentEnds,
        KeepCaretClear,
        LatinApostrophes,
        memoBubbleMenu(menu, column),
        Placeholder.configure({ placeholder: t('memo.placeholder') }),
        LinkSuggestion.configure({
          find: (query) =>
            findPassages(lib, query, t('notes.untitled')).catch((error: unknown) => {
              reportError(error);
              return [];
            }),
          onChange: setSuggest,
          onKeyDown: (event) => listRef.current?.onKeyDown(event) ?? false,
        }),
      ],
      editorProps: {
        attributes: { class: 'memo-editor', 'data-testid': 'memo-editor' },
        scrollMargin: { top: MEMO_CLEAR_TOP, bottom: MEMO_CLEAR_BOTTOM, left: 5, right: 5 },
        scrollThreshold: { top: MEMO_CLEAR_TOP, bottom: MEMO_CLEAR_BOTTOM, left: 0, right: 0 },
        handleClickOn: (_view, _pos, node) => {
          if (node.type.name !== 'anchorLink') return false;
          const { targetType, targetId, articleId, label } = node.attrs as LinkTarget;
          followRef.current({ targetType, targetId, articleId, label });
          return true;
        },
      },
    },
    [doc],
  );

  // Saving: local Yjs updates are batched and stored with the memo's derived text and links.
  useEffect(() => {
    const saver = createMemoSaver(doc, {
      memoId,
      journal: storageJournal(lib.deviceId),
      delayMs: SAVE_DELAY_MS,
      onError: reportError,
      save: (update) => {
        const derived = memoDerived(yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default')));
        const saving = appendMemoUpdate(lib, memoId, update, derived);
        trackSave(memoId, saving.catch(() => undefined));
        return saving;
      },
    });
    const onHide = () => void saver.flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      void saver.dispose();
    };
  }, [doc, lib, memoId]);

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  // The memo's language, found in its own text (spec §6.11): known before the first paint, so the column draws
  // this memo's punctuation right from the start, and followed as the writer types.
  const langRef = useRef(onLang);
  langRef.current = onLang;
  useLayoutEffect(() => {
    if (!editor) return;
    const report = () => langRef.current(memoLang(editor.state.doc));
    report();
    editor.on('update', report);
    return () => {
      editor.off('update', report);
    };
  }, [editor]);

  return (
    <>
      <EditorContent editor={editor} />
      {editor && <MemoBubbleMenu editor={editor} element={menu} />}
      {suggest && <LinkSuggestionList ref={listRef} state={suggest} />}
    </>
  );
}
