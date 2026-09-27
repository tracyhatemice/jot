import type { MarkupView, SideNoteView } from '@jot/db';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { excerpt } from '../article/excerpt';

interface Props {
  orphans: MarkupView[];
  notes: SideNoteView[];
  onReattach(markup: MarkupView): void;
  onDelete(markup: MarkupView): void;
}

/** Markups whose words can't be found since the text was fixed (spec §6.2): re-attach each one to new words, or delete it. */
export function OrphanPanel({ orphans, notes, onReattach, onDelete }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  return (
    <section className="orphans" data-testid="orphans">
      <button type="button" className="orphans-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('orphans.heading', { count: orphans.length })}
      </button>
      {open && (
        <ul>
          {orphans.map((m) => (
            <li key={m.id} data-testid="orphan">
              <span className="muted">{t(`markup.styles.${m.style}`)}</span>
              <q className="excerpt">{excerpt(m.exact, 40)}</q>
              {notes
                .filter((n) => n.markupId === m.id && n.body.trim() !== '')
                .map((n) => (
                  <span key={n.id} className="orphan-note">
                    {n.body}
                  </span>
                ))}
              <div className="actions">
                <button type="button" onClick={() => onReattach(m)} data-testid="orphan-reattach">
                  {t('orphans.reattach')}
                </button>
                <button type="button" onClick={() => onDelete(m)} data-testid="orphan-delete">
                  {t('orphans.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
