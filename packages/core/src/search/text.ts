import type { TextRange } from '../text-range';

const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CJK_CHARS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
/** Mirrors FTS5 unicode61 token characters (categories L*, N*, Co). */
const WORD = /[\p{L}\p{N}\p{Co}]+/gu;

/**
 * Text as stored in the FTS index. unicode61 treats a run of Han characters as ONE token,
 * so we space them out: every CJK character becomes a token and phrase queries match substrings.
 */
export function normalizeForIndex(text: string): string {
  return text.normalize('NFKC').replace(CJK_CHARS, ' $& ');
}

export type QueryTerm = { kind: 'cjk'; text: string } | { kind: 'word'; text: string };

export function queryTerms(input: string): QueryTerm[] {
  const terms: QueryTerm[] = [];
  for (const chunk of input.normalize('NFKC').split(/\s+/)) {
    let buffer = '';
    let bufferIsCjk = false;
    const flush = () => {
      if (!buffer) return;
      if (bufferIsCjk) terms.push({ kind: 'cjk', text: buffer });
      else for (const word of buffer.match(WORD) ?? []) terms.push({ kind: 'word', text: word });
      buffer = '';
    };
    for (const ch of chunk) {
      const isCjk = CJK_CHAR.test(ch);
      if (buffer && isCjk !== bufferIsCjk) flush();
      bufferIsCjk = isCjk;
      buffer += ch;
    }
    flush();
  }
  return terms;
}

const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;

/** The only way user text reaches FTS5: every token is quoted, so operators in the input are inert. */
export function buildFtsQuery(input: string): string | null {
  const parts = queryTerms(input).map((term) =>
    term.kind === 'cjk' ? quote([...term.text].join(' ')) : `${quote(term.text)}*`,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

function foldChar(ch: string): string {
  return ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Case- and diacritic-folded text plus, for each folded UTF-16 unit, its offset in the original. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let offset = 0;
  for (const ch of text) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) map.push(offset);
    folded += f;
    offset += ch.length;
  }
  map.push(text.length);
  return { folded, map };
}

function mergeRanges(ranges: TextRange[]): TextRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: TextRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Ranges of `text` to highlight for a search `input`; used for snippets (FTS5 snippet() sees spaced text). */
export function findHighlights(text: string, input: string): TextRange[] {
  const { folded, map } = foldWithMap(text);
  const ranges: TextRange[] = [];
  for (const term of queryTerms(input)) {
    const needle = foldWithMap(term.text).folded;
    if (!needle) continue;
    for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) {
      const atWordStart = at === 0 || !/[\p{L}\p{N}]/u.test(folded[at - 1]);
      if (term.kind === 'cjk' || atWordStart) ranges.push({ start: map[at], end: map[at + needle.length] });
    }
  }
  return mergeRanges(ranges);
}
