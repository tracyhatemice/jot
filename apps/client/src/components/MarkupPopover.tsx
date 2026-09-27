import type { MarkupView } from '@jot/db';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const excerpt = (text: string) => {
  const chars = [...text];
  return chars.length > 24 ? `${chars.slice(0, 24).join('')}…` : text;
};

interface Props {
  markups: MarkupView[];
  top: number;
  left: number;
  onClose(): void;
  onRemove(markup: MarkupView): void;
  onAddNote(markup: MarkupView): void;
}

export function MarkupPopover({ markups, top, left, onClose, onRemove, onAddNote }: Props) {
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
      <ul>
        {markups.map((m) => (
          <li key={m.id} data-testid="popover-item">
            <span className="muted">{t(`markup.styles.${m.style}`)}</span>
            <span className="excerpt">{excerpt(m.exact)}</span>
            <div className="actions">
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
    </div>
  );
}
