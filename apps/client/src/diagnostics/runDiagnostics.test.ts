import { conformanceCases } from '@jot/db/conformance';
import { createNodeDriver } from '@jot/db/testing/node';
import { describe, expect, it } from 'vitest';
import { runDiagnostics } from './runDiagnostics';

describe('runDiagnostics', () => {
  it('opens the library, counts launches and runs every conformance case', async () => {
    const driver = createNodeDriver();
    const first = await runDiagnostics(driver);
    expect(first.ok).toBe(true);
    expect(first.bootCount).toBe(1);
    expect(first.cases).toHaveLength(conformanceCases.length);
    expect(first.deviceId).toMatch(/^[0-9a-f]{16}$/);
    const second = await runDiagnostics(driver);
    expect(second.bootCount).toBe(2);
    expect(second.deviceId).toBe(first.deviceId);
  });

  it('reports a failing case instead of throwing', async () => {
    const report = await runDiagnostics(createNodeDriver(), [
      { name: 'boom', run: async () => Promise.reject(new Error('nope')) },
    ]);
    expect(report.ok).toBe(false);
    expect(report.cases).toEqual([{ name: 'boom', ok: false, error: 'nope' }]);
  });
});
