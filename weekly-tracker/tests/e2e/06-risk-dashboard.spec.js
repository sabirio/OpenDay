import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

test.describe('Risk Dashboard — Admin', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/risk');
    await expect(page.locator('h1')).toContainText('Risk', { timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('renders Risk Dashboard without crashing', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Risk');
  });

  test('shows risk table or empty state', async ({ page }) => {
    const hasTable = await page.locator('table').count() > 0;
    const hasCards = await page.locator('.dashboard-summary-card').count() > 0;
    const isEmpty  = await page.locator('text=No projects').count() > 0;
    expect(hasTable || hasCards || isEmpty).toBeTruthy();
  });

  test('shows risk score columns when projects exist', async ({ page }) => {
    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount === 0, 'No project rows to check risk scores');
    const hasRiskHeader = await page.locator('table thead').locator('text=/Risk|Score|Trend/i').count() > 0;
    expect(hasRiskHeader).toBeTruthy();
  });
});

test.describe('Risk Dashboard — PM', () => {
  test('PM can access Risk Dashboard', async ({ page }) => {
    await login(page, CREDENTIALS.pm);
    await page.goto('/risk');
    await expect(page.locator('h1')).toContainText('Risk', { timeout: 10_000 });
    await logout(page);
  });
});
