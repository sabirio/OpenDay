import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

const UNIQUE_CODE = `TEST-${Date.now()}`;
const UNIQUE_STREET_CODE = `TEST-ST-${Date.now()}`;

test.describe('Portfolio page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await expect(page.locator('h1')).toContainText('Portfolio');
  });

  test.afterEach(async ({ page }) => {
    // Navigate away first to close any open modals, then logout
    await page.goto('/');
    await logout(page);
  });

  test('loads project list and shows the frozen v1 column set', async ({ page }) => {
    // Project Information Architecture v1 §3 — exact final column order.
    // Project Manager / Start Date / End Date / Mall / GC Access / Edit are
    // no longer primary Portfolio columns (data/actions still reachable via
    // Store Code and the row's "..." menu, just not as permanent columns).
    const headText = await page.locator('table thead').textContent();
    for (const col of ['Store Code', 'Country', 'City', 'Location Type', 'Location', 'Type', 'Concept', 'Target Opening', 'Status']) {
      expect(headText).toContain(col);
    }
    expect(headText).not.toContain('Project Manager');
    expect(headText).not.toContain('GC Access');
  });

  test('opens new project form via Add New Project button', async ({ page }) => {
    await page.locator('button.primary-button', { hasText: 'Add New Project' }).click();
    // Form should appear with Store Code field
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
  });

  test('creates a new Mall project and Portfolio shows Location Type + Location correctly', async ({ page }) => {
    await page.locator('button.primary-button', { hasText: 'Add New Project' }).click();

    await page.locator('input[name="storeCode"]').fill(UNIQUE_CODE);
    await page.locator('input[name="country"]').fill('Testland');
    await page.locator('input[name="city"]').fill('Testville');

    // Location Type toggle (not a <select>) — click the "Mall" option button.
    await page.getByRole('button', { name: 'Mall', exact: true }).click();
    await page.locator('input[name="shoppingMallName"]').fill('Playwright Test Mall');

    await page.locator('button.primary-button', { hasText: 'Create Project' }).click();

    await expect(page.locator('input[name="storeCode"]')).not.toBeVisible({ timeout: 15_000 });

    const row = page.locator('table tbody tr', { hasText: UNIQUE_CODE });
    await expect(row).toContainText('Mall', { timeout: 15_000 });
    await expect(row).toContainText('Playwright Test Mall');
  });

  test('creates a new Street project and Portfolio shows Street Address as Location, not Mall', async ({ page }) => {
    await page.locator('button.primary-button', { hasText: 'Add New Project' }).click();

    await page.locator('input[name="storeCode"]').fill(UNIQUE_STREET_CODE);
    await page.locator('input[name="country"]').fill('Testland');
    await page.locator('input[name="city"]').fill('Testville');

    await page.getByRole('button', { name: 'Street', exact: true }).click();
    await page.locator('input[name="street"]').fill('Test Ave 1');

    await page.locator('button.primary-button', { hasText: 'Create Project' }).click();

    await expect(page.locator('input[name="storeCode"]')).not.toBeVisible({ timeout: 15_000 });

    const row = page.locator('table tbody tr', { hasText: UNIQUE_STREET_CODE });
    await expect(row).toContainText('Street', { timeout: 15_000 });
    await expect(row).toContainText('Test Ave 1');
  });

  test('switching Location Type from Mall to Street clears the stale mall name field', async ({ page }) => {
    await page.locator('button.primary-button', { hasText: 'Add New Project' }).click();

    await page.getByRole('button', { name: 'Mall', exact: true }).click();
    await page.locator('input[name="shoppingMallName"]').fill('Should Be Cleared');

    await page.getByRole('button', { name: 'Street', exact: true }).click();
    await expect(page.locator('input[name="shoppingMallName"]')).not.toBeVisible();
    await expect(page.locator('input[name="street"]')).toHaveValue('');
  });

  test('opens project detail view by clicking store code and shows Project Information sections', async ({ page }) => {
    const firstCode = page.locator('table tbody tr').first().locator('button').first();
    const codeName = await firstCode.textContent();
    await firstCode.click();

    const modal = page.locator('.modal');
    await expect(modal).toBeVisible({ timeout: 8_000 });
    await expect(modal).toContainText(codeName.trim());
    await expect(modal).toContainText('Identity & Location');
    await expect(modal).toContainText('Classification');
    await expect(modal).toContainText('Areas');
    await expect(modal).toContainText('Planned Dates');
    await expect(modal).toContainText('Financial');
  });

  test('opens edit form from project detail modal', async ({ page }) => {
    await page.locator('table tbody tr').first().locator('button').first().click();
    await expect(page.locator('.modal')).toBeVisible();

    await page.locator('.modal button', { hasText: 'Edit Project' }).click();
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
  });

  test('Add New Project does not show an Actual Cost input', async ({ page }) => {
    await page.locator('button.primary-button', { hasText: 'Add New Project' }).click();
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
    await expect(page.locator('input[name="actualCost"]')).toHaveCount(0);
  });

  test('Edit Project shows an Actual Cost input', async ({ page }) => {
    await page.locator('table tbody tr').first().locator('button').first().click();
    await expect(page.locator('.modal')).toBeVisible();
    await page.locator('.modal button', { hasText: 'Edit Project' }).click();
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
    await expect(page.locator('input[name="actualCost"]')).toBeVisible();
  });

  test('row "..." actions menu opens with Edit Project and GC Invite', async ({ page }) => {
    const menuBtn = page.locator('table tbody tr').first().getByRole('button', { name: /Actions for/ });
    await menuBtn.click();

    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Edit Project' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /GC Invite|GC Invited/ })).toBeVisible();
  });

  test('GC Invite menu item opens invite modal', async ({ page }) => {
    const menuBtn = page.locator('table tbody tr').first().getByRole('button', { name: /Actions for/ });
    await menuBtn.click();
    await page.locator('[role="menu"]').getByRole('menuitem', { name: /GC Invite|GC Invited/ }).click();

    await expect(page.locator('.modal')).toBeVisible();
    await expect(page.locator('.modal input[type="email"], .modal input[placeholder*="email" i], .modal input[placeholder*="@"]')).toBeVisible();
  });

  test('search filter narrows the project list', async ({ page }) => {
    // Only run if there are multiple projects
    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount < 2, 'Need at least 2 projects to test filter');

    const firstCode = await page.locator('table tbody tr').first().locator('button').first().textContent();
    // ProjectFilters.jsx's real placeholder is "Search..." (three literal
    // periods) — the previous selector used a Unicode ellipsis ("…") that
    // never matched, so .fill() silently targeted zero elements and the
    // filter was never actually applied. getByPlaceholder does a substring
    // match, so it's robust to either punctuation style.
    await page.getByPlaceholder('Search').fill(firstCode.trim());

    // Should see only rows matching that code
    await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 5_000 });
  });

  test('Location Type filter narrows the project list to Mall projects only', async ({ page }) => {
    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount < 1, 'Need at least 1 project to test filter');

    // The Location Type <select> is the one whose options include "Mall"/"Street".
    const locationTypeSelect = page.locator('select').filter({ has: page.locator('option[value="Mall"]') });
    await locationTypeSelect.selectOption('Mall');

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText('Mall');
    }
  });
});
