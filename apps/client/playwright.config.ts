import { defineConfig, devices } from '@playwright/test';

/** Browsers run in the `playwright` compose service; this runner connects to them over WebSocket. */
const wsEndpoint = process.env.PW_WS;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    ...(wsEndpoint ? { connectOptions: { wsEndpoint } } : {}),
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
