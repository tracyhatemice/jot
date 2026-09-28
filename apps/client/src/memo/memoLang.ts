import { detectLang } from '@jot/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { TextLang } from '../reading/readingStyle';

/**
 * A memo's language, found in its own text as an article's is (spec §6.11). `detectLang` reads the first 5000
 * characters, so only the start of a long memo is read.
 */
export function memoLang(doc: PMNode): TextLang {
  return detectLang(doc.textBetween(0, Math.min(doc.content.size, 6000), '\n\n', '\uFFFC'));
}
