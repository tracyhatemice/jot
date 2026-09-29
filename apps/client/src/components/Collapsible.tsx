import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** How long a section's items take to fold or unfold: the sections' glide (useGlide) and `.collapsible` in app.css. */
const DURATION = 200;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Its phase: `mounting` renders the items at no height, `opening` lets them grow, `open` stops clipping them (so a
 * tag's picker can reach past them), `closing` shrinks them, and `closed` takes them off the page.
 */
type Phase = 'mounting' | 'opening' | 'open' | 'closing' | 'closed';

/**
 * A sidebar section's items, unfolding and folding with an eased height in step with the sections' glide, so a
 * section moving past never overlaps them (spec §6.12). Folded items leave the page once the animation ends, so
 * they can't be reached with Tab; with reduced motion the change is instant.
 */
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'closed');
  const ref = useRef<HTMLDivElement>(null);

  // Before paint, so the items start moving in the same frame as the sections' glide.
  useLayoutEffect(() => {
    if (reducedMotion()) setPhase(open ? 'open' : 'closed');
    else if (open) setPhase((p) => (p === 'open' || p === 'opening' ? p : 'mounting'));
    else setPhase((p) => (p === 'closed' ? p : 'closing'));
  }, [open]);

  useLayoutEffect(() => {
    if (phase === 'mounting') {
      // The browser must see the items at no height before they grow, or it skips the transition.
      ref.current?.getBoundingClientRect();
      setPhase('opening');
      return;
    }
    if (phase !== 'opening' && phase !== 'closing') return;
    const timer = window.setTimeout(() => setPhase(phase === 'opening' ? 'open' : 'closed'), DURATION);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <div ref={ref} className="collapsible" data-state={phase}>
      <div className="collapsible-inner">{phase !== 'closed' && children}</div>
    </div>
  );
}
