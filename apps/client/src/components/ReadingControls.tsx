import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_STYLE, HAN_FACES, LATIN_FACES, stepStyle, type HanFace, type LineWidth, type ReadingKind, type ReadingStyle,
} from '../reading/readingStyle';

const PANEL_WIDTH = 300;
const HAN_LABEL = { song: 'reading.hanSong', hei: 'reading.hanHei', kai: 'reading.hanKai', fangsong: 'reading.hanFangsong' } as const satisfies Record<HanFace, string>;
const WIDTH_LABEL = {
  narrow: 'reading.widthNarrow',
  medium: 'reading.widthMedium',
  wide: 'reading.widthWide',
  full: 'reading.widthFull',
} as const satisfies Record<LineWidth, string>;

interface Props {
  kind: ReadingKind;
  style: ReadingStyle;
  onChange(next: ReadingStyle): void;
  onOpenChange?(open: boolean): void;
}

/** The Aa button and the Text styles panel (spec §6.11): typefaces, size, line spacing and line width. */
export function ReadingControls({ kind, style, onChange, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<'main' | 'typeface'>('main');
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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

  // Fixed under the button and kept inside the window: a narrow memo column would clip a panel inside it.
  useLayoutEffect(() => {
    if (!open) return;
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8)) });
    setPage('main');
  }, [open]);

  // Opening, or turning a page, puts focus on the panel's first control.
  useEffect(() => {
    if (open && at) panelRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [open, at, page]);

  const latin = LATIN_FACES.find((f) => f.id === style.latin) ?? LATIN_FACES[2];

  const stepper = (field: 'size' | 'lineHeight' | 'width', icon: ReactNode, label: string, value: string) => (
    <div className="ts-row">
      <span className="ts-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="ts-label">{label}</span>
      <output className="ts-value" data-testid={`reading-${field}`}>
        {value}
      </output>
      <span className="ts-steps">
        <button type="button" aria-label={`${label} −`} onClick={() => onChange(stepStyle(style, field, -1))} data-testid={`reading-${field}-down`}>
          −
        </button>
        <button type="button" aria-label={`${label} +`} onClick={() => onChange(stepStyle(style, field, 1))} data-testid={`reading-${field}-up`}>
          +
        </button>
      </span>
    </div>
  );

  const choice = (checked: boolean, family: string, label: string, onPick: () => void, testId: string) => (
    <button type="button" role="radio" aria-checked={checked} className="ts-row ts-choice" onClick={onPick} data-testid={testId}>
      <span className="ts-label" style={{ fontFamily: family }}>
        {label}
      </span>
      <span className={checked ? 'ts-radio on' : 'ts-radio'} aria-hidden="true" />
    </button>
  );

  return (
    <div className="reading" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon reading-button"
        aria-label={t('reading.title')}
        title={t('reading.title')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="reading-open"
      >
        Aa
      </button>
      {open && at && (
        <div
          ref={panelRef}
          className="reading-panel"
          style={{ top: at.top, left: at.left, width: PANEL_WIDTH }}
          role="dialog"
          aria-label={t('reading.title')}
          data-testid="reading-panel"
        >
          {page === 'main' ? (
            <>
              <h3 className="ts-title">{t('reading.title')}</h3>
              <div className="ts-group">
                <button type="button" className="ts-row ts-link" onClick={() => setPage('typeface')} data-testid="reading-typeface">
                  <span className="ts-icon" aria-hidden="true">
                    Aa
                  </span>
                  <span className="ts-label">{t('reading.typeface')}</span>
                  <span className="ts-value">
                    {latin.name} · {t(HAN_LABEL[style.han])}
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
                {stepper('size', 'TT', t('reading.size'), `${style.size}px`)}
                {stepper('lineHeight', '≡', t('reading.lineHeight'), style.lineHeight.toFixed(1))}
                {stepper('width', '↔', t('reading.width'), t(WIDTH_LABEL[style.width]))}
              </div>
              <button type="button" className="quiet ts-reset" onClick={() => onChange(DEFAULT_STYLE[kind])} data-testid="reading-reset">
                {t('reading.reset')}
              </button>
            </>
          ) : (
            <>
              <div className="ts-header">
                <button type="button" className="icon" aria-label={t('reading.back')} onClick={() => setPage('main')} data-testid="reading-back">
                  ‹
                </button>
                <h3 className="ts-title">{t('reading.typeface')}</h3>
              </div>
              {(['serif', 'sans'] as const).map((group) => (
                <div key={group}>
                  <p className="ts-group-title">
                    {t('reading.english')} · {t(group === 'serif' ? 'reading.serif' : 'reading.sans')}
                  </p>
                  <div className="ts-group" role="radiogroup" aria-label={t(group === 'serif' ? 'reading.serif' : 'reading.sans')}>
                    {LATIN_FACES.filter((f) => f.group === group).map((f) =>
                      choice(style.latin === f.id, f.family, f.name, () => onChange({ ...style, latin: f.id }), `reading-latin-${f.id}`),
                    )}
                  </div>
                </div>
              ))}
              <p className="ts-group-title">{t('reading.chinese')}</p>
              <div className="ts-group" role="radiogroup" aria-label={t('reading.chinese')}>
                {HAN_FACES.map((f) => choice(style.han === f.id, f.family, t(HAN_LABEL[f.id]), () => onChange({ ...style, han: f.id }), `reading-han-${f.id}`))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
