/**
 * Whether a key press belongs to an input method (for example the Enter that confirms pinyin) rather than
 * to the field. Chromium marks it `isComposing`; Safari and WKWebView end the composition first and send
 * that key with `keyCode` 229.
 */
export function isImeKey(event: { isComposing: boolean; keyCode: number }): boolean {
  return event.isComposing || event.keyCode === 229;
}
