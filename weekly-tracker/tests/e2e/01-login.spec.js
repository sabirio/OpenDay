import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

test.describe('Login page', () => {
  test('loads with email/password fields and demo buttons', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('h1')).toContainText('Construction PM Portal');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Sign in');

    // Three demo account buttons
    for (const label of ['Admin', 'PM', 'Contractor']) {
      await expect(page.locator(`.login-demo-btn`, { hasText: label })).toBeVisible();
    }
  });

  test('demo buttons pre-fill credentials', async ({ page }) => {
    await page.goto('/login');

    await page.locator('.login-demo-btn', { hasText: 'PM' }).click();
    await expect(page.locator('#email')).toHaveValue(CREDENTIALS.pm.email);
    await expect(page.locator('#password')).toHaveValue(CREDENTIALS.pm.password);
  });

  test('shows error on blank submit', async ({ page }) => {
    await page.goto('/login');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.login-error')).toContainText('fill in all fields');
  });

  test('shows error on wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('wrong@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();
    // Supabase returns an error; loader disappears and error shows
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 10_000 });
  });

  test('redirects authenticated user away from /login', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/login');
    // Should be redirected to dashboard, not stay on /login
    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe('Admin login', () => {
  test('redirects to Today and shows all nav items', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('aside.sidebar')).toBeVisible();

    for (const label of ['Today', 'Portfolio', 'Projects', 'Weekly Reports', 'Risk Dashboard', 'Users']) {
      await expect(page.locator('aside nav').getByRole('link', { name: label, exact: true })).toBeVisible();
    }

    // Role badge shows Admin
    await expect(page.locator('.sidebar-role-badge')).toContainText('Admin');

    await logout(page);
  });
});

test.describe('PM login', () => {
  test('redirects to Today and hides Users nav item', async ({ page }) => {
    await login(page, CREDENTIALS.pm);

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('.sidebar-role-badge')).toContainText('PM');

    // Users link must NOT be present for PM
    await expect(page.locator('aside nav').getByRole('link', { name: 'Users', exact: true })).not.toBeVisible();

    // Allowed nav items are visible
    for (const label of ['Today', 'Portfolio', 'Projects', 'Weekly Reports', 'Risk Dashboard']) {
      await expect(page.locator('aside nav').getByRole('link', { name: label, exact: true })).toBeVisible();
    }

    await logout(page);
  });
});

test.describe('Contractor login', () => {
  test('redirects to /contractor-select and shows project grid', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);

    await expect(page).toHaveURL(/\/contractor-select/);
    await expect(page.locator('h1')).toContainText('Submit Weekly Report');
    await expect(page.locator('.contractor-role-badge')).toContainText('Contractor');

    await logout(page);
  });
});

test.describe('Logout', () => {
  test('sign out redirects to login page', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await logout(page);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('h1')).toContainText('Construction PM Portal');
  });
});
