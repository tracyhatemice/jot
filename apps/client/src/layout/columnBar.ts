/**
 * Whether a column's bar shows after a scroll from `lastY` to `y` (spec §6.10): it hides while the
 * writer scrolls down, shows when they scroll up, and always shows at the top.
 */
export function barShownAfterScroll(shown: boolean, lastY: number, y: number): boolean {
  if (y <= 8) return true;
  if (y > lastY) return false;
  if (y < lastY) return true;
  return shown;
}
