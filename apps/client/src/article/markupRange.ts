import { trimRange, type TextRange } from '@jot/core';

/**
 * Toolbar actions: a style for the selection, a side note (which highlights it), a quote into the memo,
 * or — while re-attaching an orphaned markup — attaching it to the selection.
 */
export type ToolbarAction = 'underline' | 'bold' | 'highlight' | 'note' | 'quote' | 'attach';

/** Every style marks exactly the selection, of any length, trimmed of surrounding whitespace. */
export function markupRange(text: string, selection: { start: number; end: number }): TextRange | null {
  const range = trimRange(text, selection.start, selection.end);
  return range.start === range.end ? null : range;
}
