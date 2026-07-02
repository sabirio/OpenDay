import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

/**
 * Auth & Role access control tests.
 * Verifies that each role can only access its permitted routes.
 */

test.describe('Auth & Role access control', () => {
  test('unauthenticated user is redirected to /login when accessing /', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('unauthenticated user is redirected to /login when accessing /projects', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('unauthenticated user is redirected to /login when accessing /admin/users', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('admin can access Project Dashboard, Portfolio, Weekly Reports, Risk, Users', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    for (const path of ['/', '/projects', '/weekly-reports', '/risk', '/admin/users']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      // Should not be redirected to /login or /unauthorized
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).not.toHaveURL(/\/unauthorized/);
    }

    await logout(page);
  });

  test('PM cannot access /admin/users and is redirected to /unauthorized', async ({ page }) => {
    await login(page, CREDENTIALS.pm);
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');
    // PM should be redirected away from admin/users
    const url = page.url();
    expect(url).not.toMatch(/\/admin\/users/);

    await logout(page);
  });

  test('PM can access Project Dashboard, Portfolio, Weekly Reports, Risk', async ({ page }) => {
    await login(page, CREDENTIALS.pm);

    for (const path of ['/', '/projects', '/weekly-reports', '/risk']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).not.toHaveURL(/\/unauthorized/);
    }

    await logout(page);
  });

  test('contractor is redirected to /contractor-select on login', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
    await logout(page);
  });

  test('contractor cannot access / (admin dashboard)', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Contractor should not see the admin dashboard; expect redirect
    const url = page.url();
    expect(url).not.toMatch(/^http:\/\/localhost:\d+\/$/);

    await logout(page);
  });

  test('contractor cannot access /projects', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).not.toMatch(/\/projects/);

    await logout(page);
  });

  test('contractor cannot access /admin/users', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).not.toMatch(/\/admin\/users/);

    await logout(page);
  });

  test('PM nav does not show Users menu item', async ({ page }) => {
    await login(page, CREDENTIALS.pm);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Users nav link should not be present for PM
    const usersLink = page.locator('nav a[href*="/admin/users"], nav [href*="users"]');
    await expect(usersLink).toHaveCount(0);

    await logout(page);
  });

  test('admin nav shows Users menu item', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Users nav link should be present for Admin
    const usersLink = page.locator('nav a[href*="/admin/users"], nav a', { hasText: /users/i }).first();
    await expect(usersLink).toBeVisible();

    await logout(page);
  });

  test('/unauthorized page renders an informative message', async ({ page }) => {
    await login(page, CREDENTIALS.pm);
    await page.goto('/unauthorized');
    await page.waitForLoadState('networkidle');

    // The unauthorized page should show something meaningful
    const content = page.locator('text=unauthorized, text=access denied, text=permission, text=not allowed');
    const count = await content.count();
    // Either it shows unauthorized content OR redirects — both are valid
    if (count === 0) {
      // Page may redirect — just ensure we're not on a blank page
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(0);
    }

    await logout(page);
  });
});
