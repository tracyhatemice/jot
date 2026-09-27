import { describe, expect, it } from 'vitest';
import { createTauriDriver } from './tauri';

describe('createTauriDriver', () => {
  it('runs IPC calls one at a time, in call order', async () => {
    const log: string[] = [];
    const delays: Record<string, number> = { first: 30, second: 0 };
    const fakeInvoke = async <T>(cmd: string, args: Record<string, unknown>): Promise<T> => {
      const tag = (args.sql as string) ?? cmd;
      log.push(`start ${tag}`);
      await new Promise((r) => setTimeout(r, delays[tag] ?? 0));
      log.push(`end ${tag}`);
      return [] as T;
    };
    const driver = createTauriDriver(fakeInvoke);
    await Promise.all([driver.query('first'), driver.query('second')]);
    expect(log).toEqual(['start first', 'end first', 'start second', 'end second']);
  });

  it('keeps going after a failed call', async () => {
    const fakeInvoke = async <T>(cmd: string, args: Record<string, unknown>): Promise<T> => {
      if (args.sql === 'bad') throw new Error('boom');
      return [{ ok: 1 }] as T;
    };
    const driver = createTauriDriver(fakeInvoke);
    await expect(driver.query('bad')).rejects.toThrow('boom');
    await expect(driver.query('good')).resolves.toEqual([{ ok: 1 }]);
  });
});
