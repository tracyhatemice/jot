// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveTextFile } from './files';
import type { InvokeFn } from './tauri';

describe('saveTextFile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads the file in the browser', async () => {
    const clicked: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    expect(await saveTextFile('jot-library-20260927-0905.json', '{}', null)).toBeNull();
    expect(clicked).toEqual(['jot-library-20260927-0905.json']);
  });

  it('on the desktop, hands the file to the app, which says where it went', async () => {
    const calls: unknown[] = [];
    const call = (async (cmd: string, args: Record<string, unknown>) => {
      calls.push([cmd, args]);
      return '/home/u/Downloads/jot-library-20260927-0905.json';
    }) as InvokeFn;
    expect(await saveTextFile('jot-library-20260927-0905.json', '{}', call)).toBe('/home/u/Downloads/jot-library-20260927-0905.json');
    expect(calls).toEqual([['save_text_file', { name: 'jot-library-20260927-0905.json', text: '{}' }]]);
  });
});
