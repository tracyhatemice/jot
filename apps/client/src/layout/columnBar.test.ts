import { describe, expect, it } from 'vitest';
import { barShownAfterScroll } from './columnBar';

describe('barShownAfterScroll', () => {
  it('hides going down, shows going up, and always shows at the top', () => {
    expect(barShownAfterScroll(true, 100, 160)).toBe(false);
    expect(barShownAfterScroll(false, 160, 120)).toBe(true);
    expect(barShownAfterScroll(false, 30, 4)).toBe(true);
    expect(barShownAfterScroll(false, 160, 161)).toBe(false);
    expect(barShownAfterScroll(true, 160, 159)).toBe(true);
  });
});
