import { describe, expect, it } from 'vitest';
import { createLock } from './lock';

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('createLock', () => {
  it('runs critical sections one at a time in call order', async () => {
    const lock = createLock();
    const log: string[] = [];
    await Promise.all([
      lock.run(async () => {
        log.push('a:start');
        await tick();
        log.push('a:end');
      }),
      lock.run(async () => {
        log.push('b:start');
        log.push('b:end');
      }),
    ]);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('keeps working after a section throws', async () => {
    const lock = createLock();
    await expect(lock.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(lock.run(async () => 42)).resolves.toBe(42);
  });
});
