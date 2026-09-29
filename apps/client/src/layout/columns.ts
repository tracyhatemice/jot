/** The divider between the article and memo columns (`.splitter`). */
export const SPLITTER = 6;
/** The memo column's narrowest width (spec §6.13). */
export const MEMO_MIN = 240;
/** Beside the memo column, an article column narrower than this shows side notes as icons. */
export const NOTES_MIN = 600;
/** Beside the memo column, an article column narrower than this makes the memo column float. */
export const DOCK_MIN = 400;
/** The strip of dimmed article left beside the sidebar while the floating memo column is shown. */
export const FLOAT_GAP = 48;
/** The side-note column's share of the article column: 243 px of the 676 px column in a 1280 px window, as before. */
export const NOTES_SHARE = 0.36;
/** The memo column's default share of the space right of the sidebar: 338 px in a 1280 px window, as before. */
export const DEFAULT_MEMO_SHARE = 1 / 3;

export interface ColumnLayout {
  /** The docked memo column's width. */
  memoWidth: number;
  /** The article column's width beside the docked memo column. */
  articleWidth: number;
  notes: 'column' | 'icons';
  memo: 'docked' | 'floating';
}

/**
 * The columns for `space` px right of the sidebar, the memo column having `share` of it (spec §6.13). Everything
 * follows from the docked widths, so a column that hides doesn't come straight back as the others widen.
 */
export function columnLayout(space: number, share: number): ColumnLayout {
  const memoWidth = Math.max(MEMO_MIN, Math.floor((space - SPLITTER) * share));
  const articleWidth = space - SPLITTER - memoWidth;
  return {
    memoWidth,
    articleWidth,
    notes: articleWidth < NOTES_MIN ? 'icons' : 'column',
    memo: articleWidth < DOCK_MIN ? 'floating' : 'docked',
  };
}

/** The share a drag to `memoWidth` sets: never below the memo column's minimum, never narrowing the article column past docking. */
export function shareForWidth(space: number, memoWidth: number): number {
  const room = space - SPLITTER;
  return Math.min(Math.max(memoWidth, MEMO_MIN), Math.max(MEMO_MIN, room - DOCK_MIN)) / room;
}

/** The side-note column's width beside the article text. */
export function notesWidth(articleWidth: number): number {
  return Math.round(articleWidth * NOTES_SHARE);
}
