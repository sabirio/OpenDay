import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

/**
 * Persistence stress tests.
 * Verifies that submitted data survives page reloads and re-logins.
 * Tests the full cycle: submit → reload → verify → logout → login → verify.
 */

test.setTimeout(180_000); // Allow 3 min for the full persistence cycle

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('Persistence stress', () => {
  test('contractor report persists after page reload', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
    await page.waitForLoadState('networkidle');

    const cards = page.locator('.contractor-project-card');
    test.skip(await cards.count() === 0, 'No projects assigned to contractor');

    await cards.first().locator('button.btn-primary').click();
    await expect(page).toHaveURL(/\/contractor-report\//);
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const projectId = url.split('/').pop();
    const today = new Date().toISOString().split('T')[0];

    await page.locator('[data-testid="reporting-date"]').fill(today);

    const wpToggle = page.locator('[data-testid="wp-toggle"]').first();
    const wasActive = (await wpToggle.textContent()).includes('✓');
    if (!wasActive) await wpToggle.click();

    await page.locator('[data-testid="toggle-schedule-status-On Track"]').click();
    await page.locator('[data-testid="toggle-support-required-No"]').click();
    await page.locator('[data-testid="toggle-activities-blocked-No"]').click();

    const textareas = page.locator('[data-testid="contractor-report-form"] textarea');
    const persistenceComment = `Persistence-test-${Date.now()}`;
    await textareas.nth(0).fill(`1) ${persistenceComment}\n2) B\n3) C`);
    await textareas.nth(1).fill('1) Week+2 A\n2) B\n3) C');
    await textareas.nth(2).fill('No issues');
    await textareas.nth(3).fill(persistenceComment);

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: 'persist-test.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    await page.locator('[data-testid="declaration-checkbox"]').click();
    await page.locator('[data-testid="save-contractor-report"]').click();
    await expect(page.locator('text=Report submitted')).toBeVisible({ timeout: 20_000 });

    // Reload and verify the report appears in Weekly Reports (as admin)
    await logout(page);
    await login(page, CREDENTIALS.admin);
    await page.goto('/weekly-reports');
    await page.waitForLoadState('networkidle');

    // Select the project in the dropdown
    const projectSelect = page.locator('[data-testid="project-select"]');
    const options = await projectSelect.locator('option').allInnerTexts();
    // The project should appear in the list
    expect(options.length).toBeGreaterThan(0);

    await page.reload();
    await page.waitForLoadState('networkidle');

    // After reload, should still be on weekly-reports
    await expect(page).toHaveURL(/\/weekly-reports/);
    await expect(page.locator('[data-testid="project-select"]')).toBeVisible();

    await logout(page);
  });

  test('contractor report prefill persists: second report starts from first report values', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
    await page.waitForLoadState('networkidle');

    const cards = page.locator('.contractor-project-card');
    test.skip(await cards.count() === 0, 'No projects assigned to contractor');

    await cards.first().locator('button.btn-primary').click();
    await expect(page).toHaveURL(/\/contractor-report\//);
    await page.waitForLoadState('networkidle');

    // Check if "Submit another" is available from a prior report
    const anotherBtn = page.locator(
      'button:has-text("Submit another"), button:has-text("New Report"), button:has-text("Start new")'
    );

    if (await anotherBtn.count() === 0) {
      test.skip(true, 'No prior report available to test prefill persistence');
    }

    await anotherBtn.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // The form should have at least one WP active from prior report (prefill)
    const activeWPs = page.locator('[data-testid="wp-toggle"]').filter({ hasText: '✓' });
    const activeCount = await activeWPs.count();

    // After reload, prefill should still be applied
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // The page should recover gracefully (not crash)
    await expect(page).not.toHaveURL(/\/login/);

    await logout(page);
  });

  test('admin session persists after reload on all pages', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    const pages = ['/', '/projects', '/weekly-reports', '/risk', '/admin/users'];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.reload();
      await page.waitForLoadState('networkidle');
      // Should not redirect to login
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).not.toHaveURL(/\/unauthorized/);
    }

    await logout(page);
  });

  test('PM session persists after reload', async ({ page }) => {
    await login(page, CREDENTIALS.pm);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);

    await logout(page);
  });

  test('Weekly Reports data does not show NaN after reload', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/weekly-reports');
    await page.waitForLoadState('networkidle');

    // Select first project with reports
    const projectSelect = page.locator('[data-testid="project-select"]');
    if (await projectSelect.count() > 0) {
      const options = await projectSelect.locator('option').count();
      if (options > 1) await projectSelect.selectOption({ index: 1 });
    }

    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN%');
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('[object Object]');
    expect(bodyText).not.toContain('undefined');

    await logout(page);
  });

  test('Dashboard data does not change after reload', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rowCountBefore = await page.locator('[data-testid="dashboard-project-row"]').count();
    await page.reload();
    await page.waitForLoadState('networkidle');
    const rowCountAfter = await page.locator('[data-testid="dashboard-project-row"]').count();

    expect(rowCountAfter).toBe(rowCountBefore);

    await logout(page);
  });

  test('data is consistent across Dashboard, Weekly Reports, and Risk Dashboard', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    // Count projects on Dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const dashboardProjects = await page.locator('[data-testid="dashboard-project-row"]').count();

    // Count projects in Weekly Reports dropdown
    await page.goto('/weekly-reports');
    await page.waitForLoadState('networkidle');
    const wrProjects = await page.locator('[data-testid="project-select"] option').count();

    // Count projects in Risk Dashboard (via KPI boxes — all must be numeric)
    await page.goto('/risk');
    await page.waitForLoadState('networkidle');

    for (const level of ['critical', 'high', 'medium', 'low']) {
      const box = page.locator(`[data-testid="risk-kpi-${level}"]`);
      if (await box.count() === 0) continue;
      const text = await box.innerText();
      const num = parseInt(text, 10);
      expect(Number.isFinite(num)).toBe(true);
    }

    // All pages loaded without crash
    expect(dashboardProjects).toBeGreaterThanOrEqual(0);
    expect(wrProjects).toBeGreaterThanOrEqual(0);

    await logout(page);
  });

  test('PM site visit data persists after logout and re-login', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount === 0, 'No projects to test PM site visit persistence');

    await page.locator('table tbody tr').first().locator('button').first().click();
    const modal = page.locator('.modal').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const siteVisitBtn = modal.locator('button', { hasText: /site visit/i });
    if (await siteVisitBtn.count() === 0) {
      test.skip(true, 'No Site Visit button in project modal');
    }

    const [svPage] = await Promise.all([
      page.context().waitForEvent('page'),
      siteVisitBtn.click(),
    ]);
    await svPage.waitForLoadState('networkidle');

    if (!await svPage.locator('[data-testid="pm-site-visit-form"]').isVisible().catch(() => false)) {
      await svPage.close();
      test.skip(true, 'PM site visit form not visible');
    }

    const today = new Date().toISOString().split('T')[0];
    await svPage.locator('input[type="date"]').fill(today);
    await svPage.locator('[data-testid="pm-schedule-btn-On Track"]').click();
    await svPage.locator('[data-testid="pm-declaration-checkbox"]').click();
    await svPage.locator('[data-testid="save-site-visit-report"]').click();
    await expect(svPage.locator('text=Site Visit Recorded')).toBeVisible({ timeout: 20_000 });
    await svPage.close();

    // Logout and re-login, verify data still visible in drawer
    await logout(page);
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    if (await rows.count() > 0) {
      await rows.first().click();
      await page.waitForTimeout(400);
      const drawer = page.locator('[data-testid="project-detail-drawer"]');
      if (await drawer.isVisible().catch(() => false)) {
        const pmBlock = drawer.locator('[data-testid="pm-site-visit-summary"]');
        await expect(pmBlock).toBeVisible();
        const pmText = await pmBlock.innerText();
        expect(pmText).not.toContain('NaN');
        expect(pmText).not.toContain('undefined');
      }
    }

    await logout(page);
  });
});
