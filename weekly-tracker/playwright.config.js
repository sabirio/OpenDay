import { defineConfig, devices } from '@playwright/test';
import { assertLocalTarget } from './scripts/certification/localTargetGuard.mjs';

assertLocalTarget({
  apiUrl: process.env.VITE_SUPABASE_URL,
  dbUrl: process.env.CERT_DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';
const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || 'node scripts/certification/playwrightPreflight.mjs && npm.cmd run dev -- --host 127.0.0.1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  globalTeardown: './tests/e2e/global-teardown.js',

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: skipWebServer ? undefined : {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
