import { Library, type SqlDriver } from '@jot/db';
import { conformanceCases, type ConformanceCase } from '@jot/db/conformance';

export interface CaseResult {
  name: string;
  ok: boolean;
  error?: string;
}

export interface DiagnosticsReport {
  sqliteVersion: string;
  bootCount: number;
  deviceId: string;
  cases: CaseResult[];
  ok: boolean;
}

/** Opens (and migrates) the library, bumps a launch counter, and runs the driver conformance suite. */
export async function runDiagnostics(driver: SqlDriver, cases: ConformanceCase[] = conformanceCases): Promise<DiagnosticsReport> {
  const lib = await Library.open(driver);
  await driver.batch([
    {
      sql: "INSERT INTO kv (k, v) VALUES ('diag_boot_count', '1') ON CONFLICT (k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT)",
    },
  ]);
  const [boot] = await driver.query<{ v: string }>("SELECT v FROM kv WHERE k = 'diag_boot_count'");
  const [version] = await driver.query<{ v: string }>('SELECT sqlite_version() AS v');
  const results: CaseResult[] = [];
  for (const c of cases) {
    try {
      await c.run(driver);
      results.push({ name: c.name, ok: true });
    } catch (err) {
      results.push({ name: c.name, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return {
    sqliteVersion: version.v,
    bootCount: Number(boot.v),
    deviceId: lib.deviceId,
    cases: results,
    ok: results.every((r) => r.ok),
  };
}
