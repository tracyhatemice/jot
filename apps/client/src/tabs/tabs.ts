/** An open tab: an article's or a memo's id, and whether it is the preview tab (spec §6.13). */
export interface Tab {
  id: string;
  preview: boolean;
}

/**
 * Opens `id`. A tab it already has stays as it is. Otherwise it takes the preview tab's place, or, with no preview
 * tab, comes in as a new preview tab right after `after` (at the end when `after` is null or has no tab).
 */
export function openTab(tabs: Tab[], id: string, after: string | null): Tab[] {
  if (tabs.some((t) => t.id === id)) return tabs;
  const preview = tabs.findIndex((t) => t.preview);
  if (preview >= 0) return tabs.map((t, i) => (i === preview ? { id, preview: true } : t));
  const at = after === null ? -1 : tabs.findIndex((t) => t.id === after);
  const next = [...tabs];
  next.splice(at >= 0 ? at + 1 : tabs.length, 0, { id, preview: true });
  return next;
}

/** Makes `id` a kept tab, adding it at the end when it has no tab. */
export function keepTab(tabs: Tab[], id: string): Tab[] {
  const at = tabs.findIndex((t) => t.id === id);
  if (at < 0) return [...tabs, { id, preview: false }];
  if (!tabs[at].preview) return tabs;
  return tabs.map((t, i) => (i === at ? { id, preview: false } : t));
}

/** Removes `id`'s tab. */
export function closeTab(tabs: Tab[], id: string): Tab[] {
  return tabs.some((t) => t.id === id) ? tabs.filter((t) => t.id !== id) : tabs;
}

/** The tab shown after closing `id`'s: its right-hand neighbour, else its left-hand one, else none. */
export function tabAfterClose(tabs: readonly Tab[], id: string): string | null {
  const at = tabs.findIndex((t) => t.id === id);
  if (at < 0) return null;
  return tabs[at + 1]?.id ?? tabs[at - 1]?.id ?? null;
}

/** Keeps only the tabs `keep` accepts, e.g. those of articles that still exist. */
export function retainTabs(tabs: Tab[], keep: (id: string) => boolean): Tab[] {
  return tabs.every((t) => keep(t.id)) ? tabs : tabs.filter((t) => keep(t.id));
}

/** Tabs read back from storage: anything malformed is dropped; each id once, and at most one preview tab. */
export function parseTabs(raw: string | null): Tab[] {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const tabs: Tab[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, preview } = item as { id?: unknown; preview?: unknown };
    if (typeof id !== 'string' || id === '' || tabs.some((t) => t.id === id)) continue;
    tabs.push({ id, preview: preview === true && !tabs.some((t) => t.preview) });
  }
  return tabs;
}
