// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { reportError } from '../data/errors';
import { initI18n } from '../i18n';
import { ErrorBanner } from './ErrorBanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ErrorBanner', () => {
  it('shows a reported error until it is dismissed', async () => {
    await initI18n();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(ErrorBanner)));
    expect(host.querySelector('[role="alert"]')).toBeNull();

    await act(async () => reportError(new Error('disk full')));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('disk full');

    await act(async () => (host.querySelector('button') as HTMLButtonElement).click());
    expect(host.querySelector('[role="alert"]')).toBeNull();

    await act(async () => root.unmount());
    quiet.mockRestore();
  });
});
