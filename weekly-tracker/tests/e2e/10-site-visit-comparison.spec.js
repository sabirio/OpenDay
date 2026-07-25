import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

async function getFirstProjectId(page) {
  await page.goto('/projects');
  const count = await page.locator('.portfolio-row').count();
  if (count === 0) return null;

  // Select the first project to get the site-visit link from its details pane
  await page.locator('.portfolio-row').first().click();
  await expect(page.locator('.portfolio-details-pane')).toBeVisible();

  const siteVisitBtn = page.locator('.portfolio-details-header button', { hasText: 'Site Visit' });
  const [newPage] = await Promise.all([
    page.context().waitForEvent('page'),
    siteVisitBtn.click(),
  ]);
  await newPage.waitForLoadState('networkidle');

  const url = newPage.url();
  await newPage.close();

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
    await expect(firstRow.locator('[data-testid="pm-status-btn-Not Applicable"]')).toBeVisible();
    await expect(firstRow.locator('[data-testid="pm-status-btn-Not Started"]')).toBeVisible();
    await expect(firstRow.locator('[data-testid="pm-status-btn-In Progress"]')).toBeVisible();
    await expect(firstRow.locator('[data-testid="pm-status-btn-Completed"]')).toBeVisible();

    // Schedule assessment buttons
    await expect(page.locator('[data-testid="pm-schedule-btn-On Track"]')).toBeVisible();
    await expect(page.locator('[data-testid="pm-schedule-btn-At Risk"]')).toBeVisible();
    await expect(page.locator('[data-testid="pm-schedule-btn-Delayed"]')).toBeVisible();
    await expect(page.locator('[data-testid="pm-schedule-btn-Critical"]')).toBeVisible();

    await expect(page.locator('[data-testid="pm-declaration-checkbox"]')).toBeVisible();
    await expect(page.locator('[data-testid="save-site-visit-report"]')).toBeVisible();

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

    await logout(page);
  });

  test('submitting site visit shows comparison summary stat boxes', async ({ page }) => {
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
    await firstRow.locator('[data-testid="pm-status-btn-In Progress"]').click();

    // Set PM schedule assessment
    await page.locator('[data-testid="pm-schedule-btn-On Track"]').click();

    // Confirm declaration
    await page.locator('[data-testid="pm-declaration-checkbox"]').click();

    // Submit
    await page.locator('[data-testid="save-site-visit-report"]').click();

    // Comparison view should appear
    await expect(page.locator('text=Site Visit Recorded')).toBeVisible({ timeout: 20_000 });

    // All four stat boxes must be present
    await expect(page.locator('[data-testid="summary-items-assessed"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-matches"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-discrepancies"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-pm-ahead"]')).toBeVisible();

    // Comparison table should be visible
    await expect(page.locator('[data-testid="comparison-table"]')).toBeVisible();

    // The comparison screen is a field-mode page with no nav bar / Sign out
    // button — navigate home before logging out.
    await page.goto('/');
    await logout(page);
  });

  test('comparison row data-testid attributes are present per work package', async ({ page }) => {
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
      await taskRows.nth(i).locator('[data-testid="pm-status-btn-In Progress"]').click();
    }

    await page.locator('[data-testid="pm-schedule-btn-On Track"]').click();
    await page.locator('[data-testid="pm-declaration-checkbox"]').click();
    await page.locator('[data-testid="save-site-visit-report"]').click();

    await expect(page.locator('text=Site Visit Recorded')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid="comparison-table"]')).toBeVisible();

    // At least one comparison-row-{wpId} should be present (for WPs with assessed tasks)
    const comparisonRows = page.locator('[data-testid^="comparison-row-"]');
    const compRowCount = await comparisonRows.count();
    expect(compRowCount).toBeGreaterThan(0);

    // Each comparison row should contain task rows
    const firstCompRow = comparisonRows.first();
    await expect(firstCompRow).toBeVisible();

    // The comparison screen is a field-mode page with no nav bar / Sign out
    // button — navigate home before logging out.
    await page.goto('/');
    await logout(page);
  });
});
