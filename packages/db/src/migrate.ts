import type { SqlDriver } from './driver';
import { migrations as defaultMigrations, type Migration } from './migrations';

/** Applies pending migrations, each in its own transaction together with its `user_version` bump. */
export async function migrate(driver: SqlDriver, list: Migration[] = defaultMigrations): Promise<number> {
  const [row] = await driver.query<{ user_version: number }>('PRAGMA user_version');
  let current = Number(row?.user_version ?? 0);
  for (const m of [...list].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    await driver.batch([...m.statements.map((sql) => ({ sql })), { sql: `PRAGMA user_version = ${m.version}` }]);
    current = m.version;
  }
  return current;
}
