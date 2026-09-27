import type { SqlDriver } from '@jot/db';
import { useEffect, useState } from 'react';
import type { Platform } from '../platform';
import { runDiagnostics, type DiagnosticsReport } from './runDiagnostics';

let started: Promise<DiagnosticsReport> | null = null;

/** Runs once per page load, even if React mounts the component twice. */
function runOnce(driver: SqlDriver): Promise<DiagnosticsReport> {
  started ??= runDiagnostics(driver);
  return started;
}

/** Developer screen at #/diagnostics (English only by design). */
export function Diagnostics({ driver, platform }: { driver: SqlDriver; platform: Platform }) {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    runOnce(driver).then(
      (r) => {
        if (active) setReport(r);
      },
      (e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      active = false;
    };
  }, [driver]);

  if (error) return <p data-testid="db-unavailable">Diagnostics failed: {error}</p>;
  if (!report) return <p data-testid="diag-loading">Running diagnostics…</p>;
  return (
    <main style={{ fontFamily: 'system-ui, "Noto Sans CJK SC", sans-serif', padding: 24 }}>
      <h1>Jot storage diagnostics</h1>
      <dl>
        <dt>Status</dt>
        <dd data-testid="diag-status">{report.ok ? 'ok' : 'failed'}</dd>
        <dt>Platform</dt>
        <dd data-testid="platform">{platform}</dd>
        <dt>SQLite</dt>
        <dd data-testid="sqlite-version">{report.sqliteVersion}</dd>
        <dt>Device</dt>
        <dd>{report.deviceId}</dd>
        <dt>Launches</dt>
        <dd data-testid="boot-count">{report.bootCount}</dd>
      </dl>
      <ul>
        {report.cases.map((c) => (
          <li key={c.name} data-testid="diag-case">
            {c.ok ? '✓' : '✗'} {c.name}
            {c.error ? ` — ${c.error}` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}
