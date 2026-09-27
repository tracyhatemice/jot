import { describe, expect, it } from 'vitest';
import { newDeviceId, newId, tagEdgeId, taggingId } from './ids';

describe('newId', () => {
  it('returns version-7 UUIDs', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('sorts in creation order', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('newDeviceId', () => {
  it('is 16 random hex characters', () => {
    const id = newDeviceId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(newDeviceId()).not.toBe(id);
  });
});

describe('deterministic relationship ids', () => {
  it('encodes both ends so concurrent creations converge', () => {
    expect(tagEdgeId('p1', 'c1')).toBe('e:p1:c1');
    expect(taggingId('t1', 'markup', 'm1')).toBe('t:t1:markup:m1');
  });
});
