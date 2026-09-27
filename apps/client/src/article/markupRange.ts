import { trimRange, type TextRange } from '@jot/core';

/** Toolbar actions: a style for the selection, a side note (which highlights it), or a quote into the memo. */
export type ToolbarAction = 'underline' | 'bold' | 'highlight' | 'note' | 'quote';

/** Every style marks exactly the selection, of any length, trimmed of surrounding whitespace. */
export function markupRange(text: string, selection: { start: number; end: number }): TextRange | null {
  const range = trimRange(text, selection.start, selection.end);
  return range.start === range.end ? null : range;
}
