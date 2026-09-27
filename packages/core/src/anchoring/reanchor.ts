import search from 'approx-string-match';
import DiffMatchPatch from 'diff-match-patch';
import { CONTEXT_LENGTH, snapOffset, type TextAnchor } from './capture';
import { levenshtein, similarity } from './distance';

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
/** Without matching context, even a long quote only re-attaches this close to where it was. */
const NEARBY = 2 * CONTEXT_LENGTH;
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

  // Text before the first change never moves and text after the last change shifts uniformly.
  // Decide those cases here: diff_main's cleanup may slide an edit across equal characters, which
  // would move an untouched anchor onto an identical neighbour.
  const prefixLen = dmp.diff_commonPrefix(oldText, newText);
  if (end <= prefixLen) return { status: 'mapped', start, end, score: 1 };
  const suffixLen = Math.min(
    dmp.diff_commonSuffix(oldText, newText),
    Math.min(oldText.length, newText.length) - prefixLen,
  );
  if (start >= oldText.length - suffixLen) {
    const shift = newText.length - oldText.length;
    return { status: 'mapped', start: start + shift, end: end + shift, score: 1 };
  }

  const diffs = dmp.diff_main(oldText, newText);
  const mappedStart = dmp.diff_xIndex(diffs, start);
  const mappedEnd = exact.length > 0 ? dmp.diff_xIndex(diffs, end - 1) + 1 : mappedStart;
  const mappedOk =
    exact.length > 0 ? newText.slice(mappedStart, mappedEnd) === exact : touchesContext(newText, anchor, mappedStart);
  if (mappedOk) return { status: 'mapped', start: mappedStart, end: mappedEnd, score: 1 };

  const fuzzy = exact.length > 0 ? fuzzyQuote(newText, anchor, mappedStart) : fuzzyPoint(newText, anchor);
  if (fuzzy) return fuzzy;

  const at = snapOffset(newText, Math.min(start, newText.length), -1);
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
  for (const raw of search(text, a.exact, maxErrors)) {
    const m = alignToCodePoints(text, raw, a.exact, maxErrors);
    if (!m) continue;
    const before = similarity(a.prefix, text.slice(Math.max(0, m.start - CONTEXT_LENGTH), m.start));
    const after = similarity(a.suffix, text.slice(m.end, m.end + CONTEXT_LENGTH));
    const distance = Math.abs(m.start - hint);
    const contextMatches = Math.max(before, after) >= MIN_CONTEXT_SIMILARITY;
    const nearby = distance <= Math.max(NEARBY, a.exact.length);
    // A quote whose surroundings are gone is only trusted where it was (spec §6.2: score threshold);
    // otherwise a deleted line that is repeated elsewhere would jump to the other copy.
    if (!contextMatches && (a.exact.length < SHORT_QUOTE || !nearby)) continue;
    const quote = 1 - m.errors / a.exact.length;
    const nearness = 1 - Math.min(1, distance / Math.max(text.length, 1));
    const score = (50 * quote + 20 * before + 20 * after + 2 * nearness) / 92;
    if (!best || score > best.score || (score === best.score && distance < bestDistance)) {
      best = { status: 'fuzzy', start: m.start, end: m.end, score };
      bestDistance = distance;
    }
  }
  return best;
}

type Match = { start: number; end: number; errors: number };

/**
 * approx-string-match works in UTF-16 units and may cut a surrogate pair. Widen the match to whole
 * code points (or, failing that, narrow it), keeping it only if it stays within the error budget.
 */
function alignToCodePoints(text: string, m: Match, exact: string, maxErrors: number): Match | null {
  const wide = { start: snapOffset(text, m.start, -1), end: snapOffset(text, m.end, 1) };
  if (wide.start === m.start && wide.end === m.end) return m;
  const narrow = { start: snapOffset(text, m.start, 1), end: snapOffset(text, m.end, -1) };
  for (const r of [wide, narrow]) {
    const errors = levenshtein(text.slice(r.start, Math.max(r.start, r.end)), exact);
    if (r.end > r.start && errors <= maxErrors) return { ...r, errors };
  }
  return null;
}

function fuzzyPoint(text: string, a: StoredAnchor): Resolution | null {
  const locate = (pattern: string, atEnd: boolean): Resolution | null => {
    if (pattern.length < MIN_POINT_CONTEXT) return null;
    let best: { start: number; end: number; errors: number } | null = null;
    for (const m of search(text, pattern, Math.floor(pattern.length * MAX_ERROR_RATIO))) {
      if (!best || m.errors < best.errors) best = m;
    }
    if (!best) return null;
    const at = snapOffset(text, atEnd ? best.end : best.start, -1);
    return { status: 'fuzzy', start: at, end: at, score: 1 - best.errors / pattern.length };
  };
  return locate(a.prefix, true) ?? locate(a.suffix, false);
}
