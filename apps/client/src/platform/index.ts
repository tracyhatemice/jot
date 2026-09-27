import type { SqlDriver } from '@jot/db';
import { createTauriDriver, isTauri } from './tauri';

export type Platform = 'web' | 'desktop';

export interface OpenedDriver {
  driver: SqlDriver;
  platform: Platform;
}

let opened: Promise<OpenedDriver> | null = null;

/** Opens the library database once per page: native SQLite under Tauri, OPFS in the browser. */
export function openPlatformDriver(): Promise<OpenedDriver> {
  opened ??= isTauri()
    ? Promise.resolve<OpenedDriver>({ driver: createTauriDriver(), platform: 'desktop' })
    : import('@jot/driver-web').then(
        async ({ createWebDriver }): Promise<OpenedDriver> => ({ driver: await createWebDriver(), platform: 'web' }),
      );
  return opened;
}
