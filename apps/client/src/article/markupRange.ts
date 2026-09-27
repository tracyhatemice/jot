import { blockRanges, sentenceSpan, snapToBlocks, trimRange, type Block, type TextRange } from '@jot/core';

export type ToolbarAction = 'term' | 'line' | 'paragraph' | 'note';

/** The text range a toolbar action marks up, or null when the selection is only whitespace. */
export function markupRange(
  action: ToolbarAction,
  article: { text: string; blocks: Block[]; lang: string | null },
  selection: { start: number; end: number },
): TextRange | null {
  const base = trimRange(article.text, selection.start, selection.end);
  if (base.start === base.end) return null;
  switch (action) {
    case 'paragraph':
      return snapToBlocks(blockRanges(article.blocks), base.start, base.end);
    case 'line': {
      const sentences = sentenceSpan(article.text, base.start, base.end, article.lang === 'en' ? 'en' : 'zh');
      return trimRange(article.text, sentences.start, sentences.end);
    }
    default:
      return base;
  }
}
