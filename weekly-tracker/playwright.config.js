import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const eq = line.indexOf('=');
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv('.env');
loadDotEnv('.env.local');

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';
const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || 'npm run dev';

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
