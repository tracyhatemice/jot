import { useEffect, useState } from 'react';
import { openPlatformDriver, type Platform } from '../platform';
import { runDiagnostics, type DiagnosticsReport } from './runDiagnostics';

type Outcome =
  | { kind: 'done'; platform: Platform; report: DiagnosticsReport }
  | { kind: 'locked' }
  | { kind: 'unavailable'; message: string };

let started: Promise<Outcome> | null = null;

/** Runs once per page load, even if React mounts the component twice. */
function loadOnce(): Promise<Outcome> {
  started ??= (async (): Promise<Outcome> => {
    try {
      const { driver, platform } = await openPlatformDriver();
      return { kind: 'done', platform, report: await runDiagnostics(driver) };
    } catch (err) {
      if (err instanceof Error && err.name === 'DatabaseLockedError') return { kind: 'locked' };
      return { kind: 'unavailable', message: err instanceof Error ? err.message : String(err) };
    }
  })();
  return started;
}

export function Diagnostics() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let active = true;
    void loadOnce().then((o) => {
      if (active) setOutcome(o);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!outcome) return <p data-testid="diag-loading">Opening library…</p>;
  if (outcome.kind === 'locked') {
    return <p data-testid="db-locked">Jot is already open in another tab. Close it to continue here.</p>;
  }
  if (outcome.kind === 'unavailable') {
    return <p data-testid="db-unavailable">Storage is unavailable: {outcome.message}</p>;
  }

  const { platform, report } = outcome;
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
