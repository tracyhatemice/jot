import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  onSelect(): void;
  testId: string;
}

interface Props {
  label: string;
  items: readonly MenuItem[];
  testId: string;
  onOpenChange?(open: boolean): void;
}

/** A ☰ button with a small menu (spec §6.10); Escape, a click elsewhere or choosing an item closes it. */
export function Menu({ label, items, testId, onOpenChange }: Props) {
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
      // Keyboard users land back on the ☰ they came from.
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

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="icon menu-button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid={testId}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((item) => (
            <button
              key={item.testId}
              type="button"
              role="menuitem"
              onClick={() => {
                // Focus goes back to ☰ first, so a dialog the item opens hands it back there when it closes.
                buttonRef.current?.focus();
                setOpen(false);
                item.onSelect();
              }}
              data-testid={item.testId}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
