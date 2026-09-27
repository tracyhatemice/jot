import { describe, expect, it } from 'vitest';
import { trackSave, whenSaved } from './saves';

describe('memo save tracking', () => {
  it('lets a reopen wait for every in-flight save of that memo', async () => {
    const log: string[] = [];
    let finish: () => void = () => {};
    trackSave('m1', new Promise<void>((resolve) => (finish = resolve)).then(() => log.push('saved')));
    const waiting = whenSaved('m1').then(() => log.push('reopened'));
    await Promise.resolve();
    expect(log).toEqual([]);
    finish();
    await waiting;
    expect(log).toEqual(['saved', 'reopened']);
  });

  it('does not wait for other memos, and survives a failed save', async () => {
    trackSave('m2', Promise.reject(new Error('disk full')).catch(() => undefined));
    await expect(whenSaved('m3')).resolves.toBeUndefined();
    await expect(whenSaved('m2')).resolves.toBeUndefined();
  });
});
