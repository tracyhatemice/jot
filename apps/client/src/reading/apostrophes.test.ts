import { describe, expect, it } from 'vitest';
import { apostropheOffsets } from './apostrophes';

describe('apostrophes in Chinese text', () => {
  it('finds ’ used as an apostrophe in or after an English word', () => {
    expect(apostropheOffsets('Shakespeare’s')).toEqual([11]);
    expect(apostropheOffsets('他说 don’t 了')).toEqual([6]);
    expect(apostropheOffsets('the students’ essays')).toEqual([12]);
    expect(apostropheOffsets('O’Neill')).toEqual([1]);
    expect(apostropheOffsets('the 1990’s')).toEqual([8]);
  });

  it('leaves Chinese single quotation marks to the Chinese face, also around English words', () => {
    expect(apostropheOffsets('“他说：‘我不去。’”')).toEqual([]);
    expect(apostropheOffsets('他说：‘OK’。')).toEqual([]);
    expect(apostropheOffsets('‘I don’t know’')).toEqual([6]);
  });
});
