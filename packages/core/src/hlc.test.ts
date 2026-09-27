import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Clock, formatHlc, parseHlc, type Hlc } from './hlc';

const NODE = 'a1b2c3d4e5f60718';

describe('HLC strings', () => {
  it('round-trips', () => {
    const h: Hlc = { ms: 1727430000123, counter: 42, node: NODE };
    expect(formatHlc(h)).toBe('001727430000123-002a-a1b2c3d4e5f60718');
    expect(parseHlc(formatHlc(h))).toEqual(h);
  });

  it('rejects malformed input', () => {
    expect(() => parseHlc('nope')).toThrow(/invalid HLC/);
    expect(() => formatHlc({ ms: 1, counter: 0, node: 'XYZ' })).toThrow(/node id/);
  });

  it('orders as strings exactly like (ms, counter, node) tuples', () => {
    const hlc = fc.record({
      ms: fc.integer({ min: 0, max: 2 ** 47 }),
      counter: fc.integer({ min: 0, max: 0xffff }),
      node: fc.constantFrom('0000000000000001', 'a1b2c3d4e5f60718', 'ffffffffffffffff'),
    });
    fc.assert(
      fc.property(hlc, hlc, (a, b) => {
        const tuple = Math.sign(a.ms - b.ms) || Math.sign(a.counter - b.counter) || (a.node < b.node ? -1 : a.node > b.node ? 1 : 0);
        const sa = formatHlc(a);
        const sb = formatHlc(b);
        const str = sa < sb ? -1 : sa > sb ? 1 : 0;
        expect(str).toBe(tuple);
      }),
    );
  });
});

describe('Clock', () => {
  it('uses wall time and bumps the counter within one millisecond', () => {
    const clock = new Clock(NODE, null, () => 1000);
    expect(clock.tick()).toBe(formatHlc({ ms: 1000, counter: 0, node: NODE }));
    expect(clock.tick()).toBe(formatHlc({ ms: 1000, counter: 1, node: NODE }));
  });

  it('stays monotonic when the wall clock goes backwards', () => {
    let wall = 5000;
    const clock = new Clock(NODE, null, () => wall);
    const first = clock.tick();
    wall = 10;
    const second = clock.tick();
    expect(second > first).toBe(true);
  });

  it('continues after a persisted stamp even if restarted with an earlier clock', () => {
    const last = formatHlc({ ms: 9_000_000, counter: 7, node: NODE });
    const clock = new Clock(NODE, last, () => 0);
    expect(clock.tick() > last).toBe(true);
  });

  it('moves past a received remote stamp', () => {
    const clock = new Clock(NODE, null, () => 1000);
    const remote = formatHlc({ ms: 50_000, counter: 3, node: 'ffffffffffffffff' });
    clock.receive(remote);
    expect(clock.tick() > remote).toBe(true);
  });

  it('rolls counter overflow into the millisecond field', () => {
    const clock = new Clock(NODE, formatHlc({ ms: 1000, counter: 0xffff, node: NODE }), () => 1000);
    expect(parseHlc(clock.tick())).toEqual({ ms: 1001, counter: 0, node: NODE });
  });
});
