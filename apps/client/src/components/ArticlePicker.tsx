import { listArticles } from '@jot/db';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryQuery } from '../data/LibraryContext';

interface Props {
  heading: string;
  onPick(articleId: string): void;
  onClose(): void;
}

/** Choose an article (spec §6.10, "Move to article…"): a searchable list of the live articles. */
export function ArticlePicker({ heading, onPick, onClose }: Props) {
  const { t } = useTranslation();
  const { data: articles } = useLibraryQuery(listArticles, [], ['article']);
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = (articles ?? []).filter((a) => !q || a.title.toLowerCase().includes(q) || (a.author ?? '').toLowerCase().includes(q));

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="picker-heading"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      data-testid="article-picker"
    >
      <div className="picker">
        <h2 id="picker-heading">{heading}</h2>
        <input
          autoFocus
          value={query}
          placeholder={t('picker.search')}
          aria-label={t('picker.search')}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="picker-search"
        />
        {shown.length === 0 && <p className="muted">{t('picker.none')}</p>}
        <ul className="picker-list">
          {shown.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(a.id);
                  onClose();
                }}
                data-testid="picker-item"
              >
                <span>{a.title}</span>
                {a.author && <span className="muted">{a.author}</span>}
              </button>
            </li>
          ))}
        </ul>
        <footer>
          <button type="button" className="quiet" onClick={onClose}>
            {t('details.cancel')}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
