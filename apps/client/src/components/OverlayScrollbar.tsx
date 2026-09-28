import { useEffect, useRef, useState, type PointerEvent } from 'react';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Geometry {
  /** Where the scrolling area shows its content, in the coordinates both share with this bar. */
  rail: Box;
  /** The thumb along the rail, or null when everything fits. */
  thumb: { start: number; length: number } | null;
}

const sameGeometry = (a: Geometry | null, b: Geometry) =>
  a !== null &&
  a.rail.left === b.rail.left &&
  a.rail.top === b.rail.top &&
  a.rail.width === b.rail.width &&
  a.rail.height === b.rail.height &&
  a.thumb?.start === b.thumb?.start &&
  a.thumb?.length === b.thumb?.length;

/**
 * A scroll bar drawn over the edge of a scrolling area, so it never takes room from the content (spec §6.11).
 * Place it right after the area, which hides its own scroll bar; both need the same positioned parent. The thumb
 * shows while the pointer is over the area or the area scrolls, and can be dragged.
 */
export function OverlayScrollbar({ axis, testId }: { axis: 'x' | 'y'; testId?: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ from: number; scroll: number } | null>(null);

  useEffect(() => {
    const area = railRef.current?.previousElementSibling;
    if (!(area instanceof HTMLElement)) return;
    const measure = () => {
      const rail = { left: area.offsetLeft + area.clientLeft, top: area.offsetTop + area.clientTop, width: area.clientWidth, height: area.clientHeight };
      const [size, view, scrolled] =
        axis === 'y' ? [area.scrollHeight, area.clientHeight, area.scrollTop] : [area.scrollWidth, area.clientWidth, area.scrollLeft];
      let thumb: Geometry['thumb'] = null;
      if (view > 0 && size - view >= 1) {
        const length = Math.max(24, (view * view) / size);
        thumb = { start: (scrolled / (size - view)) * (view - length), length };
      }
      const next = { rail, thumb };
      setGeometry((prev) => (sameGeometry(prev, next) ? prev : next));
    };
    // The content's size changes how far the area scrolls: watch the area and each of its children.
    const resize = new ResizeObserver(measure);
    const watch = () => {
      resize.disconnect();
      resize.observe(area);
      for (const child of area.children) resize.observe(child);
      measure();
    };
    const children = new MutationObserver(watch);
    children.observe(area, { childList: true });
    watch();
    area.addEventListener('scroll', measure, { passive: true });
    area.addEventListener('pointerenter', measure);
    window.addEventListener('resize', measure);
    return () => {
      resize.disconnect();
      children.disconnect();
      area.removeEventListener('scroll', measure);
      area.removeEventListener('pointerenter', measure);
      window.removeEventListener('resize', measure);
    };
  }, [axis]);

  const area = () => railRef.current?.previousElementSibling as HTMLElement | null | undefined;
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = area();
    if (!el) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = axis === 'y' ? { from: e.clientY, scroll: el.scrollTop } : { from: e.clientX, scroll: el.scrollLeft };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = area();
    const thumb = geometry?.thumb;
    if (!el || !thumb || !drag.current) return;
    const view = axis === 'y' ? el.clientHeight : el.clientWidth;
    const size = axis === 'y' ? el.scrollHeight : el.scrollWidth;
    if (view <= thumb.length) return;
    const to = drag.current.scroll + (((axis === 'y' ? e.clientY : e.clientX) - drag.current.from) * (size - view)) / (view - thumb.length);
    if (axis === 'y') el.scrollTop = to;
    else el.scrollLeft = to;
  };
  const onPointerEnd = () => {
    drag.current = null;
    setDragging(false);
  };

  const thumb = geometry?.thumb;
  return (
    <div className={`overlay-scrollbar ${axis}`} ref={railRef} style={geometry?.rail} aria-hidden="true">
      {thumb && (
        <div
          className={dragging ? 'overlay-thumb dragging' : 'overlay-thumb'}
          style={axis === 'y' ? { top: thumb.start, height: thumb.length } : { left: thumb.start, width: thumb.length }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          data-testid={testId}
        />
      )}
    </div>
  );
}
