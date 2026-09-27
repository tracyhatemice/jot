import { createArticle, EmptyArticleError } from '@jot/db';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibrary } from '../data/LibraryContext';
import { decodeText } from '../import/decode';
import { draftFromSource, UnsupportedFileError, type ImportDraft, type ImportSource } from '../import/draft';
import { navigate } from '../router';

function tryDraft(source: ImportSource): ImportDraft | null {
  try {
    return draftFromSource(source);
  } catch {
    return null;
  }
}

export function ImportDialog({ onClose }: { onClose(): void }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [origin, setOrigin] = useState('');
  const [source, setSource] = useState<ImportSource>({ kind: 'paste', text: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = useMemo(() => tryDraft(source), [source]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A modal <dialog>: the page behind becomes inert and Escape fires `cancel`. React removes the
  // element before this cleanup runs, so focus is handed back to the opener explicitly.
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const data = event.clipboardData;
    if (!data) return;
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    if (!html && !text) return;
    event.preventDefault();
    setError(null);
    setSource({ kind: 'paste', text, html: html || undefined });
  };

  const onType = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setError(null);
    setSource({ kind: 'paste', text: event.target.value });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next: ImportSource = { kind: 'file', name: file.name, text: decodeText(new Uint8Array(await file.arrayBuffer())) };
      const d = draftFromSource(next);
      setSource(next);
      if (!title) setTitle(d.title);
      setError(null);
    } catch (err) {
      setError(err instanceof UnsupportedFileError ? t('importDialog.unsupported') : `${t('app.error')} ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || draft.blocks.length === 0) {
      setError(t('importDialog.empty'));
      return;
    }
    setBusy(true);
    try {
      const { articleId } = await createArticle(lib, {
        title: title || draft.title,
        author,
        source: origin,
        importKind: draft.importKind,
        blocks: draft.blocks,
      });
      onClose();
      navigate({ name: 'article', id: articleId });
    } catch (err) {
      setError(err instanceof EmptyArticleError ? t('importDialog.empty') : `${t('app.error')} ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="import-heading"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="import-dialog"
    >
      <form onSubmit={(e) => void submit(e)}>
        <h2 id="import-heading">{t('importDialog.heading')}</h2>
        <label>
          {t('importDialog.title')}
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('importDialog.titlePlaceholder')} data-testid="import-title" />
        </label>
        <label>
          {t('importDialog.author')}
          <input value={author} onChange={(e) => setAuthor(e.target.value)} data-testid="import-author" />
        </label>
        <label>
          {t('importDialog.source')}
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="import-source" />
        </label>
        <label>
          {t('importDialog.paste')}
          <textarea value={source.text} onChange={onType} onPaste={onPaste} placeholder={t('importDialog.pastePlaceholder')} rows={12} data-testid="import-text" />
        </label>
        <label>
          {t('importDialog.file')}
          <input type="file" accept=".txt,.text,.md,.markdown,text/plain,text/markdown" onChange={(e) => void onFile(e)} data-testid="import-file" />
        </label>
        <p className="muted" data-testid="import-count">
          {t('importDialog.paragraphs', { count: draft?.blocks.length ?? 0 })}
        </p>
        {error && (
          <p className="error" role="alert" data-testid="import-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose} data-testid="import-cancel">
            {t('importDialog.cancel')}
          </button>
          <button type="submit" disabled={busy} data-testid="import-submit">
            {t('importDialog.submit')}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
