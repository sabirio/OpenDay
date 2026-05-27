import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

const UNIQUE_CODE = `TEST-${Date.now()}`;

test.describe('Projects page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await expect(page.locator('h1')).toContainText('Projects');
  });

  test.afterEach(async ({ page }) => {
    // Navigate away first to close any open modals, then logout
    await page.goto('/');
    await logout(page);
  });

  test('loads project list and shows table headers', async ({ page }) => {
    await expect(page.locator('table thead')).toContainText('Store Code');
    await expect(page.locator('table thead')).toContainText('Mall');
    await expect(page.locator('table thead')).toContainText('Status');
    await expect(page.locator('table thead')).toContainText('GC Access');
  });

  test('opens new project form via Add New Project button', async ({ page }) => {
    await page.locator('button.primary-button', { hasText: 'Add New Project' }).click();
    // Form should appear with Store Code field
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
  });

  test('creates a new project and it appears in the table', async ({ page }) => {
    await page.locator('button.primary-button', { hasText: 'Add New Project' }).click();

    await page.locator('input[name="storeCode"]').fill(UNIQUE_CODE);
    await page.locator('input[name="shoppingMallName"]').fill('Playwright Test Mall');
    await page.locator('input[name="city"]').fill('Testville');
    await page.locator('input[name="country"]').fill('Testland');

    // Save
    await page.locator('button.primary-button', { hasText: 'Create Project' }).click();

    // Wait for form to close and table to update
    await expect(page.locator('input[name="storeCode"]')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.locator('table')).toContainText(UNIQUE_CODE, { timeout: 15_000 });
  });

  test('opens project detail view by clicking store code', async ({ page }) => {
    // Click the first project store code button in the table
    const firstCode = page.locator('table tbody tr').first().locator('button').first();
    const codeName = await firstCode.textContent();
    await firstCode.click();

    // Modal/detail view should open
    await expect(page.locator('.modal')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.modal')).toContainText(codeName.trim());
  });

  test('opens edit form from project detail modal', async ({ page }) => {
    await page.locator('table tbody tr').first().locator('button').first().click();
    await expect(page.locator('.modal')).toBeVisible();

    await page.locator('.modal button', { hasText: 'Edit Project' }).click();
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
  });

  test('GC Invite button opens invite modal', async ({ page }) => {
    // Find first GC Invite / ✓ GC Invited button
    const gcBtn = page.locator('table tbody button.text-button').filter({ hasText: /GC Invite|GC Invited/ }).first();
    await expect(gcBtn).toBeVisible();
    await gcBtn.click();

    // Modal with email input should appear
    await expect(page.locator('.modal')).toBeVisible();
    await expect(page.locator('.modal input[type="email"], .modal input[placeholder*="email" i], .modal input[placeholder*="@"]')).toBeVisible();
  });

  test('search filter narrows the project list', async ({ page }) => {
    // Only run if there are multiple projects
    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount < 2, 'Need at least 2 projects to test filter');

    const firstCode = await page.locator('table tbody tr').first().locator('button').first().textContent();
    await page.locator('input[placeholder="Search…"]').fill(firstCode.trim());

    // Should see only rows matching that code
    await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 5_000 });
  });
});
