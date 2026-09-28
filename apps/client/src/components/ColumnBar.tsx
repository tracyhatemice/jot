import { useEffect, useRef, useState, type ReactNode } from 'react';
import { barShownAfterScroll } from '../layout/columnBar';

/** The pointer this close to the top of the column brings the bar back. */
const REVEAL_PX = 48;

interface Props {
  /** The column's scrolling element, found from the bar (`.reader` or `.memo`). */
  scrollSelector: string;
  /** A panel of the bar is open: it stays shown. */
  pinned: boolean;
  testId: string;
  children: ReactNode;
}

/**
 * The slim bar at the top of a column (spec §6.10): it hides while the writer scrolls down, and comes back
 * when they scroll up or the pointer reaches the top of the column.
 */
export function ColumnBar({ scrollSelector, pinned, testId, children }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const scroller = barRef.current?.closest<HTMLElement>(scrollSelector);
    if (!scroller) return;
    let last = scroller.scrollTop;
    const onScroll = () => {
      // Read the previous position now: React may run the updater later, after `last` has moved on.
      const from = last;
      const y = scroller.scrollTop;
      last = y;
      setShown((s) => barShownAfterScroll(s, from, y));
    };
    const onMove = (e: MouseEvent) => {
      if (e.clientY - scroller.getBoundingClientRect().top < REVEAL_PX) setShown(true);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('mousemove', onMove);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('mousemove', onMove);
    };
  }, [scrollSelector]);

  const visible = shown || pinned;
  return (
    <div ref={barRef} className={visible ? 'column-bar' : 'column-bar hidden'} data-shown={visible} data-testid={testId}>
      {children}
    </div>
  );
}
