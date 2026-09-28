import { EmptyTitleError, updateArticleDetails } from '@jot/db';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibrary } from '../data/LibraryContext';

interface Props {
  article: { id: string; title: string; author: string | null; source: string | null };
  onClose(): void;
}

/** Edit an article's title, author and source (spec §6.10). */
export function ArticleDetailsDialog({ article, onClose }: Props) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(article.title);
  const [author, setAuthor] = useState(article.author ?? '');
  const [source, setSource] = useState(article.source ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A modal <dialog>, as the import dialog: Escape fires `cancel`, and focus goes back to the opener.
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await updateArticleDetails(lib, article.id, { title, author, source });
      onClose();
    } catch (err) {
      setError(err instanceof EmptyTitleError ? t('details.emptyTitle') : `${t('app.error')} ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="details-heading"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      data-testid="details-dialog"
    >
      <form onSubmit={(e) => void submit(e)}>
        <h2 id="details-heading">{t('details.heading')}</h2>
        <label>
          {t('details.title')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="details-title" />
        </label>
        <label>
          {t('details.author')}
          <input value={author} onChange={(e) => setAuthor(e.target.value)} data-testid="details-author" />
        </label>
        <label>
          {t('details.source')}
          <input value={source} onChange={(e) => setSource(e.target.value)} data-testid="details-source" />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="quiet" onClick={onClose}>
            {t('details.cancel')}
          </button>
          <button type="submit" disabled={saving} data-testid="details-save">
            {t('details.save')}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
