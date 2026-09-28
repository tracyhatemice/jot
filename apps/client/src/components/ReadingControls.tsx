import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_STYLE, stepStyle, type ReadingKind, type ReadingStyle, type Typeface } from '../reading/readingStyle';

const FONT_LABEL = { song: 'reading.fontSong', hei: 'reading.fontHei', kai: 'reading.fontKai' } as const satisfies Record<Typeface, string>;

interface Props {
  kind: ReadingKind;
  style: ReadingStyle;
  onChange(next: ReadingStyle): void;
  onOpenChange?(open: boolean): void;
}

/** The Aa button and its panel (spec §6.10): typeface, size, line spacing and line width. */
export function ReadingControls({ kind, style, onChange, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const changed = useRef(onOpenChange);
  changed.current = onOpenChange;

  useEffect(() => {
    changed.current?.(open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const stepper = (field: 'size' | 'lineHeight' | 'width', label: string, value: string) => (
    <div className="reading-row">
      <span>{label}</span>
      <button type="button" aria-label={`${label} −`} onClick={() => onChange(stepStyle(style, field, -1))} data-testid={`reading-${field}-down`}>
        −
      </button>
      <output data-testid={`reading-${field}`}>{value}</output>
      <button type="button" aria-label={`${label} +`} onClick={() => onChange(stepStyle(style, field, 1))} data-testid={`reading-${field}-up`}>
        +
      </button>
    </div>
  );

  return (
    <div className="reading" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="icon reading-button"
        aria-label={t('reading.open')}
        title={t('reading.open')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="reading-open"
      >
        Aa
      </button>
      {open && (
        <div className="reading-panel" role="dialog" aria-label={t('reading.open')} data-testid="reading-panel">
          <div className="reading-fonts" role="radiogroup" aria-label={t('reading.typeface')}>
            {(['song', 'hei', 'kai'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={style.typeface === f}
                className={style.typeface === f ? 'active' : undefined}
                onClick={() => onChange({ ...style, typeface: f })}
                data-testid={`reading-font-${f}`}
              >
                {t(FONT_LABEL[f])}
              </button>
            ))}
          </div>
          {stepper('size', t('reading.size'), `${style.size}px`)}
          {stepper('lineHeight', t('reading.lineHeight'), style.lineHeight.toFixed(1))}
          {stepper('width', t('reading.width'), style.width === 0 ? t('reading.full') : `${style.width}em`)}
          <button type="button" className="quiet" onClick={() => onChange(DEFAULT_STYLE[kind])} data-testid="reading-reset">
            {t('reading.reset')}
          </button>
        </div>
      )}
    </div>
  );
}
