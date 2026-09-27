/**
 * Hybrid logical clock. Serialized as fixed-width `MMMMMMMMMMMMMMM-CCCC-DDDDDDDDDDDDDDDD`
 * (15-digit ms, 4-hex counter, 16-hex device id) so plain string comparison equals causal order.
 */
export interface Hlc {
  ms: number;
  counter: number;
  node: string;
}

const MAX_COUNTER = 0xffff;
const HLC_PATTERN = /^(\d{15})-([0-9a-f]{4})-([0-9a-f]{16})$/;

export function formatHlc(h: Hlc): string {
  if (!/^[0-9a-f]{16}$/.test(h.node)) throw new Error(`invalid HLC node id: ${h.node}`);
  if (h.counter < 0 || h.counter > MAX_COUNTER) throw new Error(`HLC counter out of range: ${h.counter}`);
  return `${String(h.ms).padStart(15, '0')}-${h.counter.toString(16).padStart(4, '0')}-${h.node}`;
}

export function parseHlc(value: string): Hlc {
  const match = HLC_PATTERN.exec(value);
  if (!match) throw new Error(`invalid HLC: ${value}`);
  return { ms: Number(match[1]), counter: parseInt(match[2], 16), node: match[3] };
}

export class Clock {
  private state: Hlc;

  constructor(
    node: string,
    last: string | null = null,
    private readonly now: () => number = Date.now,
  ) {
    this.state = last ? { ...parseHlc(last), node } : { ms: 0, counter: 0, node };
    formatHlc(this.state); // validates the node id early
  }

  /** Stamp for a local event: strictly greater than every stamp this clock has produced or received. */
  tick(): string {
    const wall = this.now();
    this.state =
      wall > this.state.ms
        ? { ms: wall, counter: 0, node: this.state.node }
        : this.bump(this.state.ms, this.state.counter + 1);
    return formatHlc(this.state);
  }

  /** Merges a stamp from another device so later local stamps sort after it. */
  receive(remote: string): void {
    const r = parseHlc(remote);
    const ms = Math.max(this.now(), this.state.ms, r.ms);
    let counter = 0;
    if (ms === this.state.ms && ms === r.ms) counter = Math.max(this.state.counter, r.counter) + 1;
    else if (ms === this.state.ms) counter = this.state.counter + 1;
    else if (ms === r.ms) counter = r.counter + 1;
    this.state = this.bump(ms, counter);
  }

  last(): string {
    return formatHlc(this.state);
  }

  private bump(ms: number, counter: number): Hlc {
    return counter > MAX_COUNTER ? { ms: ms + 1, counter: 0, node: this.state.node } : { ms, counter, node: this.state.node };
  }
}
