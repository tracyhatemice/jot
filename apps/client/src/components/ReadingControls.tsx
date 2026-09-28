import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

/** The element Tab reaches after `from` in the page, leaving out `skip`. */
function nextTabbable(from: HTMLElement | null, skip: HTMLElement | null): HTMLElement | undefined {
  if (!from) return undefined;
  const all = [
    ...document.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex], [contenteditable="true"]',
    ),
  ].filter((el) => el.tabIndex >= 0 && !skip?.contains(el) && el.getClientRects().length > 0);
  return all[all.indexOf(from) + 1];
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
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  // Fixed under the button and kept inside the window: a narrow memo column would clip a panel inside it. The panel
  // lives outside the bar, whose slide would move it, and follows the button when the window resizes or the bar
  // finishes sliding in.
  const place = useCallback(() => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8)) });
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    setPage('main');
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target instanceof Node && e.target.contains(buttonRef.current)) place();
    };
    // Aa gone from view (its column hidden, e.g. by a route change) takes the panel with it.
    const gone = new ResizeObserver(() => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) setOpen(false);
    });
    if (buttonRef.current) gone.observe(buttonRef.current);
    window.addEventListener('resize', place);
    document.addEventListener('transitionend', onTransitionEnd);
    return () => {
      gone.disconnect();
      window.removeEventListener('resize', place);
      document.removeEventListener('transitionend', onTransitionEnd);
    };
  }, [open, place]);

  // Opening, or turning a page, puts focus on the panel's first control; re-placing it does not.
  const placed = at !== null;
  useEffect(() => {
    if (open && placed) panelRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [open, placed, page]);

  // In the Tab order the panel follows Aa, as if it sat right after it in the bar. Focus leaving both closes it.
  const tabbable = () => [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"])') ?? [])];
  const onButtonKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const first = tabbable()[0];
    if (!open || e.key !== 'Tab' || e.shiftKey || !first) return;
    e.preventDefault();
    first.focus();
  };
  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = tabbable();
    if (e.shiftKey && document.activeElement === items[0]) {
      e.preventDefault();
      buttonRef.current?.focus();
    } else if (!e.shiftKey && document.activeElement === items[items.length - 1]) {
      e.preventDefault();
      const next = nextTabbable(buttonRef.current, panelRef.current);
      setOpen(false);
      next?.focus();
    }
  };
  const onLeave = (e: ReactFocusEvent<HTMLElement>) => {
    const to = e.relatedTarget;
    if (open && to instanceof Node && !panelRef.current?.contains(to) && !rootRef.current?.contains(to)) setOpen(false);
  };

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

  // A radio group: Tab reaches its current choice, and the arrow keys move to the next one and pick it.
  const onRadioKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const radios = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const current = radios.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    e.preventDefault();
    const next = radios[(current + step + radios.length) % radios.length];
    next.click();
    next.focus();
  };

  const choice = (checked: boolean, family: string, label: string, onPick: () => void, testId: string) => (
    <button
      key={testId}
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      className="ts-row ts-choice"
      onClick={onPick}
      data-testid={testId}
    >
      <span className="ts-label" style={{ fontFamily: family }}>
        {label}
      </span>
      <span className={checked ? 'ts-radio on' : 'ts-radio'} aria-hidden="true" />
    </button>
  );

  return (
    <div className="reading" ref={rootRef} onBlur={onLeave}>
      <button
        ref={buttonRef}
        type="button"
        className="icon reading-button"
        aria-label={t('reading.title')}
        title={t('reading.title')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={onButtonKey}
        data-testid="reading-open"
      >
        Aa
      </button>
      {open &&
        at &&
        createPortal(
          <div
            ref={panelRef}
            className="reading-panel"
            style={{ top: at.top, left: at.left, width: PANEL_WIDTH }}
            role="dialog"
            aria-label={t('reading.title')}
            onKeyDown={onPanelKey}
            onBlur={onLeave}
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
                {/* One English choice, shown in two lists: serif and sans serif. */}
                <div className="ts-radios" role="radiogroup" aria-label={t('reading.english')} onKeyDown={onRadioKey}>
                  {(['serif', 'sans'] as const).map((group) => (
                    <div key={group}>
                      <p className="ts-group-title">
                        {t('reading.english')} · {t(group === 'serif' ? 'reading.serif' : 'reading.sans')}
                      </p>
                      <div className="ts-group">
                        {LATIN_FACES.filter((f) => f.group === group).map((f) =>
                          choice(style.latin === f.id, `'${f.family}'`, f.name, () => onChange({ ...style, latin: f.id }), `reading-latin-${f.id}`),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="ts-group-title">{t('reading.chinese')}</p>
                <div className="ts-group" role="radiogroup" aria-label={t('reading.chinese')} onKeyDown={onRadioKey}>
                  {HAN_FACES.map((f) => choice(style.han === f.id, f.family, t(HAN_LABEL[f.id]), () => onChange({ ...style, han: f.id }), `reading-han-${f.id}`))}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
