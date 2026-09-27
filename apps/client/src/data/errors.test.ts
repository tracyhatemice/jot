import { describe, expect, it, vi } from 'vitest';
import { onError, reportError } from './errors';

describe('reportError', () => {
  it('passes errors to every listener until it unsubscribes', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: string[] = [];
    const off = onError((e) => seen.push(e.message));
    reportError(new Error('disk full'));
    off();
    reportError(new Error('ignored'));
    expect(seen).toEqual(['disk full']);
    quiet.mockRestore();
  });

  it('wraps values that are not errors', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: Error[] = [];
    const off = onError((e) => seen.push(e));
    reportError('boom');
    off();
    expect(seen[0]).toBeInstanceOf(Error);
    expect(seen[0].message).toBe('boom');
    quiet.mockRestore();
  });
});
