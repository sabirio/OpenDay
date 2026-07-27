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

  test('selecting a project opens its canonical detail workspace', async ({ page }) => {
    const projectRows = page.locator('[data-testid="dashboard-master-project"]');
    await expect(projectRows.first()).toBeVisible({ timeout: 15_000 });

    await projectRows.first().click();

    await expect(projectRows.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.dashboard-project-overview')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy report link' })).toBeVisible();
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
