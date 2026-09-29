import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';

/** How long a click on a section page's row waits for a second click, which keeps the tab it opens (spec §6.13). */
export const ROW_DOUBLE_CLICK_MS = 300;

/**
 * Opening a section page's row replaces the page, so the second click of a double-click would land on what opened:
 * a single click waits a moment before opening, and a double click opens and keeps. A keyboard click opens at once;
 * a modified or middle click is left to the browser.
 */
export function useRowOpen(): (event: ReactMouseEvent, open: () => void, keep: () => void) => void {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useCallback((event: ReactMouseEvent, open: () => void, keep: () => void) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.clearTimeout(timer.current);
    if (event.detail === 0) {
      open();
    } else if (event.detail >= 2) {
      open();
      keep();
    } else {
      timer.current = window.setTimeout(open, ROW_DOUBLE_CLICK_MS);
    }
  }, []);
}
