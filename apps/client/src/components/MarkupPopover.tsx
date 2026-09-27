import type { MarkupView } from '@jot/db';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { excerpt } from '../article/excerpt';

export interface CitingMemo {
  id: string;
  title: string;
}

interface Props {
  markups: MarkupView[];
  memos: CitingMemo[];
  top: number;
  left: number;
  onClose(): void;
  onRemove(markup: MarkupView): void;
  onAddNote(markup: MarkupView): void;
  onLinkInMemo(markup: MarkupView): void;
  onOpenMemo(memoId: string): void;
}

/** What is under a click in the article: its markups (with actions) and the memos that cite it. */
export function MarkupPopover({ markups, memos, top, left, onClose, onRemove, onAddNote, onLinkInMemo, onOpenMemo }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="popover" role="dialog" style={{ top, left }} onMouseDown={(e) => e.preventDefault()} data-testid="markup-popover">
      {markups.length > 0 && (
        <ul>
          {markups.map((m) => (
            <li key={m.id} data-testid="popover-item">
              <span className="muted">{t(`markup.styles.${m.style}`)}</span>
              <span className="excerpt">{excerpt(m.exact)}</span>
              <div className="actions">
                <button type="button" onClick={() => onLinkInMemo(m)} data-testid="popover-link">
                  {t('markup.linkInMemo')}
                </button>
                <button type="button" onClick={() => onAddNote(m)} data-testid="popover-add-note">
                  {t('markup.addNote')}
                </button>
                <button type="button" onClick={() => onRemove(m)} data-testid="popover-remove">
                  {t('markup.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {memos.length > 0 && (
        <section className="cited-in">
          <h3 className="muted">{t('memo.citedIn')}</h3>
          <ul>
            {memos.map((m) => (
              <li key={m.id} data-testid="popover-memo">
                <span>{m.title}</span>
                <div className="actions">
                  <button type="button" onClick={() => onOpenMemo(m.id)} data-testid="popover-open-memo">
                    {t('memo.open')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
