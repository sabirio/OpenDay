import { defineConfig, devices } from '@playwright/test';
import { assertP1RehearsalTarget } from './scripts/certification/p1RehearsalGuard.mjs';

const target = assertP1RehearsalTarget();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: target.frontend.origin,
    trace: 'off',
    screenshot: 'off',
    headless: true,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npm.cmd run dev -- --host 127.0.0.1 --port ${target.frontend.port}`,
    url: target.frontend.origin,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
