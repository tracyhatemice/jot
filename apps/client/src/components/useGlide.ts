import { useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';

/** How long a section glides to its new place; short, like the chevron's turn. */
const DURATION = 200;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Makes elements glide to where a layout change puts them, rather than jump (spec §6.12). Call the returned
 * `snapshot()` just before the change; when `deps` change, each element that moved starts at its old place and
 * slides to its new one. With reduced motion they jump.
 */
export function useGlide(elements: RefObject<(HTMLElement | null)[]>, deps: DependencyList): () => void {
  const before = useRef<number[] | null>(null);

  useLayoutEffect(() => {
    const tops = before.current;
    before.current = null;
    if (!tops || reducedMotion()) return;
    elements.current?.forEach((el, i) => {
      if (!el) return;
      const shift = tops[i] - el.getBoundingClientRect().top;
      if (Math.abs(shift) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${shift}px)`;
      el.getBoundingClientRect();
      el.style.transition = `transform ${DURATION}ms ease`;
      el.style.transform = '';
      window.setTimeout(() => {
        el.style.transition = '';
      }, DURATION);
    });
    // The elements are read through the ref: only the layout change (deps) runs this.
  }, deps);

  return () => {
    before.current = elements.current?.map((el) => el?.getBoundingClientRect().top ?? 0) ?? null;
  };
}
