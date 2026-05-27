import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

test.describe('Weekly Reports page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/weekly-reports');
    await expect(page.locator('h1')).toContainText('Weekly Reports', { timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('renders the weekly reports page without crashing', async ({ page }) => {
    // Page loaded in beforeEach — no errors
    await expect(page.locator('h1')).toContainText('Weekly Reports');
  });

  test('shows a table or empty-state when no reports', async ({ page }) => {
    const hasContent = (await page.locator('table').count()) > 0 ||
                       (await page.locator('text=No reports').count()) > 0 ||
                       (await page.locator('text=no reports').count()) > 0 ||
                       (await page.locator('.dashboard-summary-card').count()) > 0;
    expect(hasContent).toBeTruthy();
  });

  test('project filter dropdown is present', async ({ page }) => {
    // Reports page typically has a project filter
    const hasSelect = await page.locator('select').count() > 0;
    const hasFilter = await page.locator('input[placeholder*="Search"], input[placeholder*="search"]').count() > 0;
    expect(hasSelect || hasFilter).toBeTruthy();
  });
});
