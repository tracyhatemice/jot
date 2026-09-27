export interface MarginItem {
  id: string;
  top: number;
  height: number;
}

/** Places each card at its anchor's height, pushing later cards down so none overlap. */
export function layoutMargin(items: readonly MarginItem[], gap = 8): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.top - b.top || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const tops = new Map<string, number>();
  let floor = -Infinity;
  for (const item of sorted) {
    const top = Math.max(item.top, floor);
    tops.set(item.id, top);
    floor = top + item.height + gap;
  }
  return tops;
}
