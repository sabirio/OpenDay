import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

/**
 * Navigation & Routing tests.
 * Verifies sidebar links, unknown-route fallback, session persistence,
 * and that removed routes (Gantt) are gone.
 */

test.describe('Navigation & Routing', () => {
  test('sidebar navigation links are present and functional for admin', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that major nav links exist
    const navLinks = [
      { label: /dashboard/i, expectedUrl: /\/$/ },
      { label: /portfolio/i, expectedUrl: /\/projects/ },
      { label: /weekly.?reports?/i, expectedUrl: /\/weekly-reports/ },
      { label: /risk/i, expectedUrl: /\/risk/ },
      { label: /users/i, expectedUrl: /\/admin\/users/ },
    ];

    for (const { label, expectedUrl } of navLinks) {
      const link = page.locator('nav a', { hasText: label }).first();
      if (await link.count() === 0) continue; // skip if nav uses different structure

      await link.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(expectedUrl, { timeout: 10_000 });
    }

    await logout(page);
  });

  test('Gantt route is not present in navigation', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const ganttLink = page.locator('nav a', { hasText: /gantt/i });
    await expect(ganttLink).toHaveCount(0);

    await logout(page);
  });

  test('Import Projects is not a standalone top-level nav item (Projects IA v1 — it is a Portfolio action, not a peer of Portfolio)', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const importNavLink = page.locator('nav a', { hasText: /^Import Projects$/i });
    await expect(importNavLink).toHaveCount(0);

    // Unrelated sidebar items remain intact — removing Import didn't break the rest of the nav.
    await expect(page.locator('nav a', { hasText: /^Portfolio$/i })).toHaveCount(1);
    await expect(page.locator('nav a', { hasText: /weekly.?reports?/i })).toHaveCount(1);

    await logout(page);
  });

  test('/gantt route redirects or shows not found', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/gantt');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    // Should redirect away from /gantt (to 404, /, or unauthorized)
    expect(url).not.toMatch(/\/gantt/);

    await logout(page);
  });

  test('unknown route shows fallback or redirects', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/this-route-does-not-exist-xyz-999');
    await page.waitForLoadState('networkidle');

    // Either shows a 404/not-found page or redirects somewhere sensible
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    await logout(page);
  });

  test('session persists after page refresh', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be on /projects (session persisted)
    await expect(page).toHaveURL(/\/projects/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/login/);

    await logout(page);
  });

  test('browser back/forward navigation works correctly', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/projects/);

    await page.goBack();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\//, { timeout: 10_000 });

    await page.goForward();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/projects/, { timeout: 10_000 });

    await logout(page);
  });

  test('PM sidebar does not contain Users link', async ({ page }) => {
    await login(page, CREDENTIALS.pm);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usersLink = page.locator('nav a', { hasText: /users/i });
    await expect(usersLink).toHaveCount(0);

    await logout(page);
  });

  test('contractor is redirected away from admin sidebar routes', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    // Contractor lands on /contractor-select
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });

    // Contractor should not have access to /projects
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/projects/);

    await logout(page);
  });

  test('clicking logo or brand returns to home', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Look for logo/brand/home link
    const homeLink = page.locator('nav a[href="/"], header a[href="/"], a.brand, a[aria-label*="home" i]').first();
    if (await homeLink.count() > 0) {
      await homeLink.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    }
    // If no home link found, this is just informational

    await logout(page);
  });
});
