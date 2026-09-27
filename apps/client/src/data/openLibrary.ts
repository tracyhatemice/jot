import { Library, type SqlDriver } from '@jot/db';
import { openPlatformDriver, type Platform } from '../platform';

export type Boot =
  | { kind: 'ready'; lib: Library; driver: SqlDriver; platform: Platform }
  | { kind: 'locked' }
  | { kind: 'unavailable'; message: string };

let boot: Promise<Boot> | null = null;

/** Opens (and migrates) the library once per page load. */
export function openLibraryOnce(): Promise<Boot> {
  boot ??= (async (): Promise<Boot> => {
    try {
      const { driver, platform } = await openPlatformDriver();
      return { kind: 'ready', lib: await Library.open(driver), driver, platform };
    } catch (err) {
      if (err instanceof Error && err.name === 'DatabaseLockedError') return { kind: 'locked' };
      return { kind: 'unavailable', message: err instanceof Error ? err.message : String(err) };
    }
  })();
  return boot;
}
