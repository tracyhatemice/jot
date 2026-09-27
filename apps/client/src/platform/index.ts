import type { SqlDriver } from '@jot/db';
import { createTauriDriver, isTauri } from './tauri';

export type Platform = 'web' | 'desktop';

export interface OpenedDriver {
  driver: SqlDriver;
  platform: Platform;
}

let opened: Promise<OpenedDriver> | null = null;

/** Dev-only: `?storage=memory` opens a throwaway in-memory library (used by WebKit e2e, which has no OPFS). */
function wantsMemoryStorage(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get('storage') === 'memory';
}

/** Opens the library database once per page: native SQLite under Tauri, OPFS in the browser. */
export function openPlatformDriver(): Promise<OpenedDriver> {
  if (opened) return opened;
  if (isTauri()) {
    opened = Promise.resolve<OpenedDriver>({ driver: createTauriDriver(), platform: 'desktop' });
  } else if (wantsMemoryStorage()) {
    opened = import('@jot/driver-web/memory').then(
      async ({ createMemoryDriver }): Promise<OpenedDriver> => ({ driver: await createMemoryDriver(), platform: 'web' }),
    );
  } else {
    opened = import('@jot/driver-web').then(
      async ({ createWebDriver }): Promise<OpenedDriver> => ({ driver: await createWebDriver(), platform: 'web' }),
    );
  }
  return opened;
}
