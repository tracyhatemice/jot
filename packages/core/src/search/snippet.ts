import { snapOffset } from '../anchoring/capture';
import type { TextRange } from '../text-range';

export interface SnippetPart {
  text: string;
  hit: boolean;
}

export interface Snippet {
  parts: SnippetPart[];
  /** Text was cut before or after the snippet (show an ellipsis there). */
  cutStart: boolean;
  cutEnd: boolean;
}

/**
 * A short excerpt of `text` around its first highlight (or from its start), with the highlights in it
 * marked. Whitespace runs become single spaces; cuts never split a surrogate pair. `radius = Infinity`
 * keeps the whole text.
 */
export function makeSnippet(text: string, highlights: readonly TextRange[], radius = 40): Snippet {
  const first = highlights[0];
  const start = snapOffset(text, first ? Math.max(0, first.start - radius) : 0, -1);
  const end = snapOffset(text, Math.min(text.length, first ? first.end + radius : radius * 2), 1);
  const parts: SnippetPart[] = [];
  let at = start;
  for (const h of highlights) {
    const s = Math.max(h.start, start);
    const e = Math.min(h.end, end);
    if (e <= s || s < at) continue;
    if (s > at) parts.push({ text: text.slice(at, s), hit: false });
    parts.push({ text: text.slice(s, e), hit: true });
    at = e;
  }
  if (end > at) parts.push({ text: text.slice(at, end), hit: false });
  return {
    parts: parts.map((p) => ({ ...p, text: p.text.replace(/\s+/gu, ' ') })).filter((p) => p.text !== ''),
    cutStart: start > 0,
    cutEnd: end < text.length,
  };
}
