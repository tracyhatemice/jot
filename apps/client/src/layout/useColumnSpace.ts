import { useLayoutEffect, useState, type RefObject } from 'react';

export interface ColumnSpace {
  /** The shell's width right of the sidebar. */
  width: number;
  /** Where that space starts: the sidebar's width. */
  left: number;
}

/** The space right of the sidebar, followed as the window resizes and the sidebar collapses (spec §6.13). */
export function useColumnSpace(shell: RefObject<HTMLElement | null>, sidebarCollapsed: boolean): ColumnSpace | null {
  const [space, setSpace] = useState<ColumnSpace | null>(null);
  useLayoutEffect(() => {
    const el = shell.current;
    if (!el) return;
    const sidebar = el.querySelector<HTMLElement>(':scope > nav.sidebar');
    const measure = () => {
      const left = sidebar?.offsetWidth ?? 0;
      const width = el.clientWidth - left;
      setSpace((s) => (s && s.width === width && s.left === left ? s : { width, left }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (sidebar) observer.observe(sidebar);
    return () => observer.disconnect();
  }, [shell, sidebarCollapsed]);
  return space;
}
