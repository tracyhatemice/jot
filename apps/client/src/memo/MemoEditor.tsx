import { appendMemoUpdate } from '@jot/db';
import Collaboration from '@tiptap/extension-collaboration';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Y from 'yjs';
import { reportError } from '../data/errors';
import { useLibrary } from '../data/LibraryContext';
import { AnchorLink } from './anchorLink';
import type { LinkTarget } from './bridge';
import { memoDerived } from './memoDerived';
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
      .then(() => openMemoDoc(lib, memoId))
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

  const editor = useEditor(
    {
      extensions: [
        // Collaboration keeps its own (Yjs) undo history, so the built-in one is turned off.
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: doc }),
        AnchorLink,
        Placeholder.configure({ placeholder: t('memo.placeholder') }),
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
  const pending = useRef<Uint8Array[]>([]);
  const flush = useCallback(() => {
    if (pending.current.length === 0) return;
    const update = Y.mergeUpdates(pending.current.splice(0));
    const derived = memoDerived(yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default')));
    trackSave(memoId, appendMemoUpdate(lib, memoId, update, derived).catch(reportError));
  }, [lib, memoId, doc]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === LOAD_ORIGIN) return;
      pending.current.push(update);
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    };
    const onHide = () => flush();
    doc.on('update', onUpdate);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(timer);
      doc.off('update', onUpdate);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [doc, flush]);

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  return <EditorContent editor={editor} />;
}
