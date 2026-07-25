import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

test.describe('Project Dashboard — Admin', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Project Dashboard', { timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('renders summary KPI cards', async ({ page }) => {
    await expect(page.locator('.dashboard-summary-card').first()).toBeVisible();
  });

  test('renders a project table or project list', async ({ page }) => {
    const hasTable = await page.locator('table').count() > 0;
    const hasEmpty = await page.locator('text=No projects').count() > 0;
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test('clicking a project row opens the detail drawer', async ({ page }) => {
    // Real project rows have a <strong> storeCode element.
    // Wait for at least one to appear (avoids clicking the empty "No matching projects." placeholder).
    const projectRows = page.locator('table.status-matrix-table tbody tr').filter({ has: page.locator('strong') });
    await expect(projectRows.first()).toBeVisible({ timeout: 15_000 });

    await projectRows.first().click();

    // Drawer appears with a "Copy link" button unique to its header
    await expect(
      page.locator('button', { hasText: 'Copy link' })
    ).toBeVisible({ timeout: 8_000 });

    // Close the drawer (Escape handler) so the fixed overlay doesn't block afterEach logout
    await page.keyboard.press('Escape');
    await expect(page.locator('button', { hasText: 'Copy link' })).not.toBeVisible();
  });
});

test.describe('Project Dashboard — PM', () => {
  test('PM sees Project Dashboard with no Users nav item', async ({ page }) => {
    await login(page, CREDENTIALS.pm);
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Project Dashboard', { timeout: 10_000 });
    await expect(page.locator('aside nav').getByRole('link', { name: 'Users', exact: true })).not.toBeVisible();
    await logout(page);
  });
});
