// Dedicated Playwright config for staging cloud E2E (tests/staging-e2e/).
// Deliberately separate from playwright.config.js: no webServer (staging
// is already deployed, nothing to start locally), baseURL comes from
// PLAYWRIGHT_BASE_URL (sourced from .env.staging by the caller — this
// file does not read any .env file itself, matching the same
// explicit-env-only discipline as scripts/staging/*.mjs).

import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
if (!baseURL) {
  throw new Error('PLAYWRIGHT_BASE_URL is required — source .env.staging before running this config.');
}

export default defineConfig({
  testDir: './tests/staging-e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
    headless: true,
  },

  projects: [
    { name: 'chromium', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
