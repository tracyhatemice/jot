import { describe, expect, it } from 'vitest';
import { columnLayout, notesWidth, shareForWidth } from './columns';

describe('columnLayout', () => {
  it('keeps the earlier look in a 1280 px window: a 338 px memo column beside a 676 px article column', () => {
    expect(columnLayout(1020, 1 / 3)).toEqual({ memoWidth: 338, articleWidth: 676, notes: 'column', memo: 'docked' });
    expect(notesWidth(676)).toBe(243);
  });

  it('scales both columns with the space, keeping the share', () => {
    expect(columnLayout(1340, 1 / 3)).toMatchObject({ memoWidth: 444, articleWidth: 890 });
  });

  it('keeps the memo column at 240 px below its share, and the article column gives way', () => {
    expect(columnLayout(700, 0.2)).toMatchObject({ memoWidth: 240, articleWidth: 454 });
  });

  it('turns side notes into icons below a 600 px article column, then floats the memo column below 400 px', () => {
    expect(columnLayout(909, 1 / 3)).toMatchObject({ notes: 'column', memo: 'docked' });
    expect(columnLayout(900, 1 / 3)).toMatchObject({ notes: 'icons', memo: 'docked' });
    expect(columnLayout(646, 1 / 3)).toMatchObject({ notes: 'icons', memo: 'docked' });
    expect(columnLayout(645, 1 / 3)).toMatchObject({ notes: 'icons', memo: 'floating' });
  });

  it('hides side notes before the memo column floats, whatever the share', () => {
    for (const share of [0.15, 1 / 3, 0.5, 0.7]) {
      for (let space = 300; space <= 2000; space += 7) {
        const layout = columnLayout(space, share);
        if (layout.memo === 'floating') expect(layout.notes).toBe('icons');
      }
    }
  });
});

describe('shareForWidth (Review Focus 5)', () => {
  it('takes a dragged memo width as a share of the space', () => {
    expect(shareForWidth(1020, 507)).toBeCloseTo(0.5);
  });

  it('never goes below 240 px, nor so wide that the article column would float', () => {
    expect(shareForWidth(1020, 100)).toBeCloseTo(240 / 1014);
    expect(shareForWidth(1020, 900)).toBeCloseTo(614 / 1014);
    expect(columnLayout(1020, shareForWidth(1020, 900))).toMatchObject({ articleWidth: 400, memo: 'docked' });
  });
});
