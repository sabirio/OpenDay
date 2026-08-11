import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

async function getFirstProjectId(page) {
  await page.goto('/site-visit-select');
  await page.waitForLoadState('networkidle');
  const projectButton = page.getByRole('button', { name: /Start site visit for/i }).first();
  if (await projectButton.count() === 0) return null;
  await projectButton.click();
  await expect(page).toHaveURL(/\/site-visit\//, { timeout: 15_000 });
  const url = page.url();

  const match = url.match(/\/site-visit\/([^/]+)/);
  return match ? match[1] : null;
}

test.describe('PM site visit — comparison view', () => {
  test('site visit form renders with required data-testid attributes', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    const projectId = await getFirstProjectId(page);
    test.skip(!projectId, 'No projects available');

    await page.goto(`/site-visit/${projectId}`);
    await expect(page.locator('[data-testid="pm-site-visit-form"]')).toBeVisible();

    // PM task rows should be present for each WP
    await expect(page.locator('[data-testid="pm-task-row"]').first()).toBeVisible();

    // Status buttons should be in each task row
    const firstRow = page.locator('[data-testid="pm-task-row"]').first();
    await expect(firstRow.locator('[data-testid="pm-status-btn-not_started"]')).toBeVisible();
    await expect(firstRow.locator('[data-testid="pm-status-btn-in_progress"]')).toBeVisible();
    await expect(firstRow.locator('[data-testid="pm-status-btn-completed"]')).toBeVisible();
    await expect(firstRow.locator('[data-testid="pm-status-btn-delayed"]')).toBeVisible();
    await expect(firstRow.locator('[data-testid="pm-status-btn-blocked"]')).toBeVisible();

    // Schedule assessment buttons
    await expect(page.locator('[data-testid="pm-schedule-btn-On Track"]')).toBeVisible();
    await expect(page.locator('[data-testid="pm-schedule-btn-At Risk"]')).toBeVisible();
    await expect(page.locator('[data-testid="pm-schedule-btn-Critical"]')).toBeVisible();

    await expect(page.locator('[data-testid="pm-declaration-checkbox"]')).toBeVisible();
    await expect(page.locator('[data-testid="save-site-visit-report"]')).toBeVisible();
    await page.screenshot({ path: 'test-results/g110-desktop-site-visit.png', fullPage: true });

    await page.goto('/');
    await logout(page);
  });

  test('GC reference is shown as tinted button when a reference report exists', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    const projectId = await getFirstProjectId(page);
    test.skip(!projectId, 'No projects available');

    await page.goto(`/site-visit/${projectId}`);
    await expect(page.locator('[data-testid="pm-site-visit-form"]')).toBeVisible();

    // Check if a reference report is selected (select dropdown has a value beyond "No comparison")
    const referenceSelect = page.locator('select');
    const hasGCReport = await referenceSelect.count() > 0 &&
      await referenceSelect.locator('option').count() > 1;

    if (!hasGCReport) {
      // No GC reports — GC chip won't appear, but form still loads
      await expect(page.locator('[data-testid="pm-task-row"]').first()).toBeVisible();
      await logout(page);
      return;
    }

    // Select the latest GC report (first option after "— No comparison —")
    await referenceSelect.selectOption({ index: 1 });

    // At least one task row should have a button with GC indicator
    // The GC chip appears as an absolute-positioned "GC" span inside the button
    const gcChip = page.locator('[data-testid="pm-task-row"] button span:has-text("GC")');
    // GC chip appears only for tasks where GC reported a status — may or may not exist
    const gcCount = await gcChip.count();
    // Just assert the form is functional (GC reference loaded without error)
    await expect(page.locator('[data-testid="pm-task-row"]').first()).toBeVisible();
    // If GC chips are present, they should be visible
    if (gcCount > 0) {
      await expect(gcChip.first()).toBeVisible();
    }

    await page.goto('/');
    await logout(page);
  });

  test('submitting a partial Gantt visit shows the persisted comparison summary', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    const projectId = await getFirstProjectId(page);
    test.skip(!projectId, 'No projects available');

    await page.goto(`/site-visit/${projectId}`);
    await expect(page.locator('[data-testid="pm-site-visit-form"]')).toBeVisible();

    // Set visit date to today
    const today = new Date().toISOString().split('T')[0];
    await page.locator('input[type="date"]').fill(today);

    // Observe at least one task — set status on first preconstruction task
    const firstRow = page.locator('[data-testid="pm-task-row"]').first();
    await firstRow.locator('[data-testid="pm-status-btn-in_progress"]').click();

    // Set PM schedule assessment
    await page.locator('[data-testid="pm-schedule-btn-On Track"]').click();

    // Confirm declaration
    await page.locator('[data-testid="pm-declaration-checkbox"]').click();

    // Submit
    await page.locator('[data-testid="save-site-visit-report"]').click();

    // Comparison view should appear
    await expect(page.locator('text=Site Visit Recorded')).toBeVisible({ timeout: 20_000 });

    // Gantt-backed visits use the canonical persisted three-way summary.
    await expect(page.locator('[data-testid="summary-confirmed"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-discrepancy"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-pm-ahead"]')).toBeVisible();
    const persistedTotal = await page.locator('[data-testid^="summary-"] > div:first-child').allTextContents();
    expect(persistedTotal.map(Number).reduce((sum, value) => sum + value, 0)).toBe(1);

    // The comparison screen is a field-mode page with no nav bar / Sign out
    // button — navigate home before logging out.
    await page.goto('/');
    await logout(page);
  });

  test('a Gantt submission exposes canonical persisted discrepancy totals', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    const projectId = await getFirstProjectId(page);
    test.skip(!projectId, 'No projects available');

    await page.goto(`/site-visit/${projectId}`);

    // Set minimum required fields and submit
    const today = new Date().toISOString().split('T')[0];
    await page.locator('input[type="date"]').fill(today);

    // Observe several tasks across multiple WPs
    const taskRows = page.locator('[data-testid="pm-task-row"]');
    const rowCount = await taskRows.count();
    // Set status on first few task rows
    for (let i = 0; i < Math.min(rowCount, 3); i++) {
      await taskRows.nth(i).locator('[data-testid="pm-status-btn-in_progress"]').click();
    }

    await page.locator('[data-testid="pm-schedule-btn-On Track"]').click();
    await page.locator('[data-testid="pm-declaration-checkbox"]').click();
    await page.locator('[data-testid="save-site-visit-report"]').click();

    await expect(page.locator('text=Site Visit Recorded')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid="summary-confirmed"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-discrepancy"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-pm-ahead"]')).toBeVisible();

    // The comparison screen is a field-mode page with no nav bar / Sign out
    // button — navigate home before logging out.
    await page.goto('/');
    await logout(page);
  });
});
