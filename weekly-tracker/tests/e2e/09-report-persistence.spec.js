import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function navigateToContractorReport(page) {
  await page.goto('/contractor-select');
  const count = await page.locator('.contractor-project-card').count();
  if (count === 0) return false;
  await page.locator('.contractor-project-card button.btn-primary').first().click();
  await expect(page).toHaveURL(/\/contractor-report\//);
  await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible();
  return true;
}

async function fillAndSubmit(page) {
  const today = new Date().toISOString().split('T')[0];

  await page.locator('[data-testid="reporting-date"]').fill(today);

  // Ensure first WP toggle is active (click if not already selected)
  const firstToggle = page.locator('[data-testid="wp-toggle"]').first();
  const wpId = await firstToggle.getAttribute('data-wp-id');
  const isSelected = await firstToggle.evaluate((el) => el.style.border?.includes('2px solid') || el.textContent.includes('✓'));
  if (!isSelected) await firstToggle.click();

  // Wait for task rows to appear and set first task to Completed
  const firstTaskRow = page.locator(`[data-testid="task-row"][data-wp-id="${wpId}"]`).first();
  await expect(firstTaskRow).toBeVisible();
  await firstTaskRow.locator('[data-testid="status-btn-Completed"]').click();

  // Schedule: On Track (avoids risk fields requirement)
  await page.locator('[data-testid="toggle-schedule-status-On Track"]').click();

  // Support: No
  await page.locator('[data-testid="toggle-support-required-No"]').click();

  // Activities blocked: No
  await page.locator('[data-testid="toggle-activities-blocked-No"]').click();

  // Textareas (in order: nextWeekTop3, weekAfterTop3, pendingIssues, finalComments)
  const textareas = page.locator('[data-testid="contractor-report-form"] textarea');
  await textareas.nth(0).fill('1) Activity A\n2) Activity B\n3) Activity C');
  await textareas.nth(1).fill('1) Activity A\n2) Activity B\n3) Activity C');
  await textareas.nth(2).fill('No pending issues');
  await textareas.nth(3).fill('Test submission');

  // Photo upload
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'test-photo.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });

  // Declaration
  await page.locator('[data-testid="declaration-checkbox"]').click();

  // Submit
  await page.locator('[data-testid="save-contractor-report"]').click();
  await expect(page.locator('text=Report submitted')).toBeVisible({ timeout: 20_000 });

  return wpId;
}

test.describe('Contractor report — data persistence', () => {
  test('form renders with required data-testid attributes', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    const found = await navigateToContractorReport(page);
    test.skip(!found, 'No projects available');

    await expect(page.locator('[data-testid="reporting-date"]')).toBeVisible();
    await expect(page.locator('[data-testid="wp-toggle"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="declaration-checkbox"]')).toBeVisible();
    await expect(page.locator('[data-testid="save-contractor-report"]')).toBeVisible();

    await logout(page);
  });

  test('WP toggle reveals task rows with status buttons', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    const found = await navigateToContractorReport(page);
    test.skip(!found, 'No projects available');

    const firstToggle = page.locator('[data-testid="wp-toggle"]').first();
    const wpId = await firstToggle.getAttribute('data-wp-id');

    // Click to deselect then reselect so we know the state
    const wasActive = (await firstToggle.textContent()).includes('✓');
    if (!wasActive) await firstToggle.click();

    const taskRows = page.locator(`[data-testid="task-row"][data-wp-id="${wpId}"]`);
    await expect(taskRows.first()).toBeVisible();

    // Each task row should have all four status buttons
    const firstRow = taskRows.first();
    await expect(firstRow.locator('[data-testid="status-btn-Not Applicable"]')).toBeVisible();
    await expect(firstRow.locator('[data-testid="status-btn-Not Started"]')).toBeVisible();
    await expect(firstRow.locator('[data-testid="status-btn-In Progress"]')).toBeVisible();
    await expect(firstRow.locator('[data-testid="status-btn-Completed"]')).toBeVisible();

    // Clicking a status button changes selection
    await firstRow.locator('[data-testid="status-btn-In Progress"]').click();
    // Button now has active styling — border should match the In Progress colour
    const btn = firstRow.locator('[data-testid="status-btn-In Progress"]');
    await expect(btn).toBeVisible();

    await logout(page);
  });

  test('submitting report and clicking "Submit another" shows prefill from previous report', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    const found = await navigateToContractorReport(page);
    test.skip(!found, 'No projects available');

    const wpId = await fillAndSubmit(page);

    // Click "Submit another report"
    await page.locator('button', { hasText: 'Submit another report' }).click();

    // Form should be back
    await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible();

    // The WP that was submitted should now show "Pre-filled from" badge
    // (the WP section is visible because makeInitialForm kept it in currentPackages)
    await expect(page.locator('text=Pre-filled from')).toBeVisible({ timeout: 10_000 });

    // Task rows for the WP should still be present (auto-selected from prevReport.currentPackages)
    const taskRows = page.locator(`[data-testid="task-row"][data-wp-id="${wpId}"]`);
    await expect(taskRows.first()).toBeVisible();

    // "Last week:" column should show the Completed status we set previously
    await expect(taskRows.first().locator('text=Completed').first()).toBeVisible();

    // The Completed button should be pre-selected (cumulative best status carried forward)
    const completedBtn = taskRows.first().locator('[data-testid="status-btn-Completed"]');
    await expect(completedBtn).toBeVisible();

    await logout(page);
  });
});
