import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

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
  const listRef = useRef<HTMLDivElement>(null);

  // Opening focuses the first item; arrow keys, Home and End move between items (spec §6.11).
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown' ? (i + 1) % items.length
      : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    items[next]?.focus();
  };
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
        <div className="menu-list" role="menu" ref={listRef} onKeyDown={onListKey}>
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
