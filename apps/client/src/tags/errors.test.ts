import { DuplicateTagNameError, InvalidTagNameError, TagCycleError } from '@jot/db';
import { describe, expect, it } from 'vitest';
import { tagErrorKey } from './errors';

describe('tagErrorKey', () => {
  it('names the message that explains each tag error', () => {
    expect(tagErrorKey(new TagCycleError('x'))).toEqual({ key: 'tags.cycle' });
    expect(tagErrorKey(new DuplicateTagNameError('比喻'))).toEqual({ key: 'tags.duplicate', name: '比喻' });
    expect(tagErrorKey(new InvalidTagNameError())).toEqual({ key: 'tags.blank' });
  });

  it('leaves other errors alone', () => {
    expect(tagErrorKey(new Error('disk full'))).toBeNull();
  });
});
