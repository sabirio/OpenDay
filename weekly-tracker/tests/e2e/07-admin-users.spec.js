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
    // Diagnosed live: a direct REST call with the same session token, and a
    // page.on('response') capture of AdminUsers.jsx's own loadUsers() request,
    // both confirmed the query correctly returns all 5 profiles (RLS/seed/API
    // are fine). The flakiness is App.jsx's <StrictMode> — in dev it
    // double-invokes `useEffect(() => { loadUsers() }, [])` (no cleanup
    // returned), so there are two independent loadUsers() calls in flight;
    // whichever's setLoading(false)/setUsers(...) commits first can produce a
    // transient frame where the spinner is already gone but the second
    // in-flight call hasn't resolved yet. A one-shot `.count()` right after
    // the spinner disappears can sample that transient frame — poll for the
    // actual card instead, which converges on the final, correct render.
    await expect(page.locator('.auth-loading-spinner')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.admin-user-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Failed')).toHaveCount(0);
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
