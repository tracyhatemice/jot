import search from 'approx-string-match';
import DiffMatchPatch from 'diff-match-patch';
import { CONTEXT_LENGTH, type TextAnchor } from './capture';
import { similarity } from './distance';

export type ResolutionStatus = 'exact' | 'mapped' | 'fuzzy' | 'orphan';

export interface Resolution {
  status: ResolutionStatus;
  start: number;
  end: number;
  score: number;
}

export type StoredAnchor = Pick<TextAnchor, 'start' | 'end' | 'exact' | 'prefix' | 'suffix'>;

/** A fuzzy quote match may differ from the stored quote in at most this share of characters. */
const MAX_ERROR_RATIO = 0.25;
/** Quotes shorter than this are too ambiguous to re-attach without matching context. */
const SHORT_QUOTE = 16;
const MIN_CONTEXT_SIMILARITY = 0.5;
/** Point anchors re-attach by their context; shorter context is too ambiguous. */
const MIN_POINT_CONTEXT = 4;

const dmp = new DiffMatchPatch();
dmp.Diff_Timeout = 2;

/**
 * Finds where an anchor captured on `oldText` belongs in `newText` (spec §6.2):
 * unchanged → diff-mapped → fuzzy quote search scored by context → orphan.
 */
export function reanchor(anchor: StoredAnchor, oldText: string, newText: string): Resolution {
  const { start, end, exact } = anchor;
  if (fitsAt(newText, anchor, start)) return { status: 'exact', start, end: start + exact.length, score: 1 };

  const diffs = dmp.diff_main(oldText, newText);
  const mappedStart = dmp.diff_xIndex(diffs, start);
  const mappedEnd = exact.length > 0 ? dmp.diff_xIndex(diffs, end - 1) + 1 : mappedStart;
  const mappedOk =
    exact.length > 0 ? newText.slice(mappedStart, mappedEnd) === exact : touchesContext(newText, anchor, mappedStart);
  if (mappedOk) return { status: 'mapped', start: mappedStart, end: mappedEnd, score: 1 };

  const fuzzy = exact.length > 0 ? fuzzyQuote(newText, anchor, mappedStart) : fuzzyPoint(newText, anchor);
  if (fuzzy) return fuzzy;

  const at = Math.min(start, newText.length);
  return { status: 'orphan', start: at, end: at, score: 0 };
}

/** Quote and both context strings are unchanged at `at`. */
function fitsAt(text: string, a: StoredAnchor, at: number): boolean {
  const end = at + a.exact.length;
  return (
    at - a.prefix.length >= 0 &&
    text.slice(at - a.prefix.length, at) === a.prefix &&
    text.slice(at, end) === a.exact &&
    text.slice(end, end + a.suffix.length) === a.suffix
  );
}

/** For point anchors: the context on at least one side is intact at `at`. */
function touchesContext(text: string, a: StoredAnchor, at: number): boolean {
  const before = a.prefix.length > 0 && at - a.prefix.length >= 0 && text.slice(at - a.prefix.length, at) === a.prefix;
  const after = a.suffix.length > 0 && text.slice(at, at + a.suffix.length) === a.suffix;
  return before || after;
}

function fuzzyQuote(text: string, a: StoredAnchor, hint: number): Resolution | null {
  const maxErrors = Math.floor(a.exact.length * MAX_ERROR_RATIO);
  let best: Resolution | null = null;
  let bestDistance = Infinity;
  for (const m of search(text, a.exact, maxErrors)) {
    const before = similarity(a.prefix, text.slice(Math.max(0, m.start - CONTEXT_LENGTH), m.start));
    const after = similarity(a.suffix, text.slice(m.end, m.end + CONTEXT_LENGTH));
    if (a.exact.length < SHORT_QUOTE && Math.max(before, after) < MIN_CONTEXT_SIMILARITY) continue;
    const quote = 1 - m.errors / a.exact.length;
    const distance = Math.abs(m.start - hint);
    const nearness = 1 - Math.min(1, distance / Math.max(text.length, 1));
    const score = (50 * quote + 20 * before + 20 * after + 2 * nearness) / 92;
    if (!best || score > best.score || (score === best.score && distance < bestDistance)) {
      best = { status: 'fuzzy', start: m.start, end: m.end, score };
      bestDistance = distance;
    }
  }
  return best;
}

function fuzzyPoint(text: string, a: StoredAnchor): Resolution | null {
  const locate = (pattern: string, atEnd: boolean): Resolution | null => {
    if (pattern.length < MIN_POINT_CONTEXT) return null;
    let best: { start: number; end: number; errors: number } | null = null;
    for (const m of search(text, pattern, Math.floor(pattern.length * MAX_ERROR_RATIO))) {
      if (!best || m.errors < best.errors) best = m;
    }
    if (!best) return null;
    const at = atEnd ? best.end : best.start;
    return { status: 'fuzzy', start: at, end: at, score: 1 - best.errors / pattern.length };
  };
  return locate(a.prefix, true) ?? locate(a.suffix, false);
}
