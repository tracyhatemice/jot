import { useEffect, type RefObject } from 'react';

/**
 * A tab strip's scrolling (spec §6.10, §6.13): the active tab scrolls into view when it changes or tabs come and go,
 * and a plain mouse wheel scrolls the strip sideways.
 */
export function useTabStrip(strip: RefObject<HTMLElement | null>, activeSelector: string, activeKey: unknown, count: number): void {
  useEffect(() => {
    strip.current?.querySelector(activeSelector)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [strip, activeSelector, activeKey, count]);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
}
