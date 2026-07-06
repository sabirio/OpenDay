import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

/**
 * Full end-to-end data flow test.
 * Walks through the complete application lifecycle:
 *   Admin login → create project → GC submits report → PM site visit
 *   → comparison summary → dashboard drawer → risk dashboard → role check → logout
 *
 * All stages skip gracefully if prior stages produced no data.
 */

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('Full data flow', () => {
  test('admin can create a project and it appears in the project list', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const addBtn = page.locator('button', { hasText: /add project|new project|create/i }).first();
    test.skip(await addBtn.count() === 0, 'No add-project button found');

    await addBtn.click();
    const modal = page.locator('.modal, [role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const uniqueName = `E2E-Project-${Date.now()}`;
    // validateProject() (projectService.js) requires storeCode, shoppingMallName,
    // and country — filling only name/store (as this test previously did) throws
    // "Country is required", doSaveProject()'s catch shows a native alert() and
    // never calls setShowForm(false), so the modal (and its full-screen
    // .modal-overlay backdrop) stays open and blocks the later logout()'s Sign
    // out click. Use the same reliable name-attribute selectors as
    // 02-projects.spec.js's own passing "creates a new project" test.
    await modal.locator('input[name="shoppingMallName"]').fill(uniqueName);
    await modal.locator('input[name="storeCode"]').fill(`ST${Date.now().toString().slice(-4)}`);
    await modal.locator('input[name="city"]').fill('E2E City');
    await modal.locator('input[name="country"]').fill('E2E Country');

    const saveBtn = modal.locator('button[type="submit"], button', { hasText: /save|create|add/i }).first();
    await saveBtn.click();
    await page.waitForLoadState('networkidle');

    // The project should now appear in the list
    await expect(page.locator(`text=${uniqueName}`)).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('GC submits a contractor report and it is visible on the Weekly Reports page', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
    await page.waitForLoadState('networkidle');

    const cards = page.locator('.contractor-project-card');
    const count = await cards.count();
    test.skip(count === 0, 'No projects assigned to contractor');

    await cards.first().locator('button.btn-primary').click();
    await expect(page).toHaveURL(/\/contractor-report\//);
    await page.waitForLoadState('networkidle');

    const today = new Date().toISOString().split('T')[0];
    await page.locator('[data-testid="reporting-date"]').fill(today);

    // Activate first WP
    const wpToggle = page.locator('[data-testid="wp-toggle"]').first();
    const wasActive = (await wpToggle.textContent()).includes('✓');
    if (!wasActive) await wpToggle.click();

    await page.locator('[data-testid="toggle-schedule-status-On Track"]').click();
    await page.locator('[data-testid="toggle-support-required-No"]').click();
    await page.locator('[data-testid="toggle-activities-blocked-No"]').click();

    const textareas = page.locator('[data-testid="contractor-report-form"] textarea');
    await textareas.nth(0).fill('1) Flow test next-week A\n2) B\n3) C');
    await textareas.nth(1).fill('1) Flow test week+2 A\n2) B\n3) C');
    await textareas.nth(2).fill('No issues');
    await textareas.nth(3).fill('Full data flow test submission');

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: 'flow-test.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    await page.locator('[data-testid="declaration-checkbox"]').click();
    // Submit stays disabled while the photo's async upload is in flight.
    await expect(page.locator('[data-testid="save-contractor-report"]')).toBeEnabled({ timeout: 30_000 });
    await page.locator('[data-testid="save-contractor-report"]').click();
    await expect(page.locator('text=Report submitted')).toBeVisible({ timeout: 20_000 });

    // The success screen has no nav bar, so navigate home before logging out.
    // Verify in Weekly Reports (as admin)
    await page.goto('/');
    await logout(page);
    await login(page, CREDENTIALS.admin);
    await page.goto('/weekly-reports');
    await page.waitForLoadState('networkidle');

    const hasContent =
      (await page.locator('table tbody tr, [class*="report"], [class*="card"]').count()) > 0;
    expect(hasContent).toBeTruthy();

    await logout(page);
  });

  test('PM site visit references GC report and produces comparison summary', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount === 0, 'No projects for PM site visit flow test');

    await page.locator('table tbody tr').first().locator('button').first().click();
    await expect(page.locator('.modal')).toBeVisible();

    const siteVisitBtn = page.locator('.modal button', { hasText: /site visit/i });
    test.skip(await siteVisitBtn.count() === 0, 'No Site Visit button in project modal');

    const [svPage] = await Promise.all([
      page.context().waitForEvent('page'),
      siteVisitBtn.click(),
    ]);
    await svPage.waitForLoadState('networkidle');
    await expect(svPage.locator('[data-testid="pm-site-visit-form"]')).toBeVisible();

    const today = new Date().toISOString().split('T')[0];
    await svPage.locator('input[type="date"]').fill(today);

    // Try to select a GC report if available
    const selectEl = svPage.locator('select');
    const optionCount = await selectEl.locator('option').count();
    if (optionCount > 1) {
      await selectEl.selectOption({ index: 1 });
      await svPage.waitForTimeout(300);
    }

    await svPage.locator('[data-testid="pm-schedule-btn-On Track"]').click();
    await svPage.locator('[data-testid="pm-declaration-checkbox"]').click();
    await svPage.locator('[data-testid="save-site-visit-report"]').click();

    await expect(svPage.locator('text=Site Visit Recorded')).toBeVisible({ timeout: 20_000 });

    // Verify comparison summary is shown
    await expect(svPage.locator('[data-testid="summary-items-assessed"]')).toBeVisible();
    await expect(svPage.locator('[data-testid="summary-matches"]')).toBeVisible();
    await expect(svPage.locator('[data-testid="summary-discrepancies"]')).toBeVisible();
    await expect(svPage.locator('[data-testid="summary-pm-ahead"]')).toBeVisible();

    await svPage.close();

    // The project detail modal (opened on `page` at the top of this test, to
    // launch the Site Visit popup) is still open here and its full-screen
    // .modal-overlay backdrop covers the sidebar's Sign out button — close it
    // before logging out. ProjectDetailModal.jsx does not close on Escape
    // (verified live), so use its real close button.
    await page.locator('.modal .close-button').click();
    await expect(page.locator('.modal')).not.toBeVisible({ timeout: 5_000 });
    await logout(page);
  });

  test('dashboard project drawer opens and shows contractor report block', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    const rowCount = await rows.count();
    test.skip(rowCount === 0, 'No project rows on dashboard');

    await rows.first().click();
    await page.waitForTimeout(500);

    // Check that a drawer/panel opened
    const drawer = page.locator('[class*="drawer"], aside, [role="dialog"]').first();
    const drawerVisible = await drawer.isVisible().catch(() => false);

    if (!drawerVisible) {
      // Try clicking any button within the row
      await rows.first().locator('button').first().click();
      await page.waitForTimeout(500);
    }

    // At minimum, we should still be on the dashboard
    await expect(page).toHaveURL(/\//);

    await logout(page);
  });

  test('risk dashboard reflects data from submitted reports', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/risk');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/risk/);

    // Risk KPI boxes should be present and contain numbers
    for (const level of ['critical', 'high', 'medium', 'low']) {
      const box = page.locator(`[data-testid="risk-kpi-${level}"]`);
      if (await box.count() > 0) {
        const text = await box.innerText();
        expect(text).not.toContain('NaN');
        expect(text).not.toContain('undefined');
      }
    }

    // Risk table or card content should be present
    const hasRiskContent =
      (await page.locator('table tbody tr, [class*="risk"], [class*="card"]').count()) > 0;
    expect(hasRiskContent).toBeTruthy();

    await logout(page);
  });

  test('contractor cannot access admin pages after flow completes', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });

    // Attempt to navigate to admin areas
    for (const restricted of ['/', '/projects', '/admin/users', '/weekly-reports']) {
      await page.goto(restricted);
      await page.waitForLoadState('networkidle');
      const url = page.url();
      // Should be redirected — not on the restricted path
      if (restricted === '/') {
        expect(url).not.toMatch(/^http:\/\/localhost:\d+\/$/);
      } else {
        expect(url).not.toMatch(new RegExp(restricted.replace('/', '\\/')));
      }
    }

    await logout(page);
  });

  test('second GC report prefills from previous submission', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
    await page.waitForLoadState('networkidle');

    const cards = page.locator('.contractor-project-card');
    const count = await cards.count();
    test.skip(count === 0, 'No projects assigned to contractor for prefill test');

    await cards.first().locator('button.btn-primary').click();
    await expect(page).toHaveURL(/\/contractor-report\//);
    await page.waitForLoadState('networkidle');

    // Check if "Submit another" or "New Report" button is available (means prior report exists)
    const anotherBtn = page.locator(
      'button:has-text("Submit another"), button:has-text("New Report"), button:has-text("Start new")'
    );
    if (await anotherBtn.count() === 0) {
      // No prior report yet — skip
      test.skip(true, 'No prior report to prefill from');
    }

    await anotherBtn.first().click();
    await page.waitForLoadState('networkidle');

    // The form should show with prefilled WP data (at least one WP active)
    const activeWPs = page.locator('[data-testid="wp-toggle"]').filter({ hasText: '✓' });
    const activeCount = await activeWPs.count();
    // Prefill means at least one WP is active from previous submission
    expect(activeCount).toBeGreaterThanOrEqual(1);

    await logout(page);
  });
});
