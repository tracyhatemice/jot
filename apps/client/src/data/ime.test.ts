import { describe, expect, it } from 'vitest';
import { isImeKey } from './ime';

describe('isImeKey', () => {
  it('recognises keys that belong to an input method, in either way browsers report them', () => {
    expect(isImeKey({ isComposing: true, keyCode: 13 })).toBe(true);
    // Safari/WKWebView: composition already ended, but the committing Enter still carries keyCode 229.
    expect(isImeKey({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeKey({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});
