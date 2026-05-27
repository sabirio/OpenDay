import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

test.describe('Admin Users page — Admin', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/admin/users');
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('loads and shows User Management heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('User Management', { timeout: 10_000 });
  });

  test('renders user cards from Supabase', async ({ page }) => {
    // Wait for loading spinner to disappear
    await expect(page.locator('.auth-loading-spinner')).not.toBeVisible({ timeout: 15_000 });
    const hasCards = await page.locator('.admin-user-card').count() > 0;
    const hasError = await page.locator('text=Failed').count() > 0;
    expect(hasCards).toBeTruthy();
    expect(hasError).toBeFalsy();
  });
});

test.describe('Admin Users page — PM access', () => {
  test('PM cannot access /admin/users', async ({ page }) => {
    await login(page, CREDENTIALS.pm);
    await page.goto('/admin/users');

    // React Router redirects to /unauthorized
    await page.waitForURL((url) => !url.pathname.includes('/admin/users'), { timeout: 10_000 });

    // Should land on /unauthorized with Access Denied heading
    await expect(page.locator('h1')).toContainText('Access Denied', { timeout: 8_000 });
    // No logout needed — each test has its own browser context
  });
});
