import type { PointerEvent as ReactPointerEvent } from 'react';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Vertical drag handle; dragging left widens the column to its right. */
export function Splitter({ width, min, max, onResize }: { width: number; min: number; max: number; onResize(width: number): void }) {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = width;
    handle.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => onResize(clamp(startWidth + (startX - e.clientX), min, max));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };
  return <div className="splitter" role="separator" aria-orientation="vertical" onPointerDown={onPointerDown} data-testid="memo-splitter" />;
}
