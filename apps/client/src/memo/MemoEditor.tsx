import { appendMemoUpdate, getMemoState } from '@jot/db';
import Collaboration from '@tiptap/extension-collaboration';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Y from 'yjs';
import { reportError } from '../data/errors';
import { useLibrary } from '../data/LibraryContext';
import { AnchorLink } from './anchorLink';
import type { LinkTarget } from './bridge';
import { LinkSuggestion, type LinkSuggestionState } from './linkSuggestion';
import { LinkSuggestionList, type LinkSuggestionListHandle } from './LinkSuggestionList';
import { findPassages } from './passages';
import { storageJournal } from './journal';
import { memoDerived } from './memoDerived';
import { createMemoSaver } from './memoSaver';
import { LOAD_ORIGIN, openMemoDoc } from './openMemoDoc';
import { trackSave, whenSaved } from './saves';

/** Typing pauses this long before a memo is saved (it is also saved on hide, unload and unmount). */
const SAVE_DELAY_MS = 500;

interface Props {
  memoId: string;
  onReady(editor: Editor | null): void;
  onFollow(link: LinkTarget): void;
}

export function MemoEditor({ memoId, onReady, onFollow }: Props) {
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
  return <LoadedMemoEditor memoId={memoId} doc={doc} onReady={onReady} onFollow={onFollow} />;
}

function LoadedMemoEditor({ memoId, doc, onReady, onFollow }: Props & { doc: Y.Doc }) {
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
  const editor = useEditor(
    {
      extensions: [
        // Collaboration keeps its own (Yjs) undo history, so the built-in one is turned off.
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: doc }),
        AnchorLink,
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

  return (
    <>
      <EditorContent editor={editor} />
      {suggest && <LinkSuggestionList ref={listRef} state={suggest} />}
    </>
  );
}
