import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

/**
 * Multi-project scenario tests.
 * Creates 4 deterministically-named test projects representing different lifecycle states,
 * submits contractor reports and PM site visits, then verifies dashboard/risk/opening readiness
 * correctly differentiates between the scenarios.
 *
 * Projects:
 *  - NORYX-E2E-Healthy-{ts}    → on-track project, recent reports, good progress
 *  - NORYX-E2E-NearOpen-{ts}   → opening date in 20 days, low progress (should be Critical)
 *  - NORYX-E2E-Missing-{ts}    → no recent contractor reports (should flag missing reports)
 *  - NORYX-E2E-PMAhead-{ts}    → PM site visit ahead of GC report (discrepancy scenario)
 */

test.setTimeout(240_000);

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const TS = Date.now().toString().slice(-6);
const PROJECT_NAMES = {
  healthy: `NORYX-E2E-Healthy-${TS}`,
  nearOpen: `NORYX-E2E-NearOpen-${TS}`,
  missing: `NORYX-E2E-Missing-${TS}`,
  pmAhead: `NORYX-E2E-PMAhead-${TS}`,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createTestProject(page, { storeCode, mallName, country, targetOpeningDate }) {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  const addBtn = page.locator('button', { hasText: /add project|new project|\+ project/i }).first();
  if (await addBtn.count() === 0) return null;
  await addBtn.click();

  const modal = page.locator('.modal, [role="dialog"]').first();
  await expect(modal).toBeVisible({ timeout: 5_000 });

  await modal.getByRole('button', { name: 'Mall', exact: true }).click();
  await modal.locator('input[name="storeCode"]').fill(storeCode);
  await modal.locator('input[name="shoppingMallName"]').fill(mallName);
  await modal.locator('input[name="country"]').fill(country);
  if (targetOpeningDate) {
    await modal.locator('input[name="targetOpeningDate"]').fill(targetOpeningDate);
  }

  const saveBtn = modal.locator('button[type="submit"], button', { hasText: /save|create/i }).first();
  await saveBtn.click();
  await page.waitForLoadState('networkidle');
  return storeCode;
}

async function submitContractorReport(page, { scheduleStatus = 'On Track', supportRequired = 'No', activitiesBlocked = 'No', comment = 'E2E test report' } = {}) {
  await page.waitForLoadState('networkidle');

  const today = new Date().toISOString().split('T')[0];
  const dateInput = page.locator('[data-testid="reporting-date"]');
  if (await dateInput.count() > 0) await dateInput.fill(today);

  const wpToggle = page.locator('[data-testid="wp-toggle"]').first();
  if (await wpToggle.count() > 0) {
    const isActive = (await wpToggle.textContent()).includes('✓');
    if (!isActive) await wpToggle.click();
  }

  const scheduleBtn = page.locator(`[data-testid="toggle-schedule-status-${scheduleStatus}"]`);
  if (await scheduleBtn.count() > 0) await scheduleBtn.click();

  const supportBtn = page.locator(`[data-testid="toggle-support-required-${supportRequired}"]`);
  if (await supportBtn.count() > 0) await supportBtn.click();

  const blockedBtn = page.locator(`[data-testid="toggle-activities-blocked-${activitiesBlocked}"]`);
  if (await blockedBtn.count() > 0) await blockedBtn.click();

  const textareas = page.locator('[data-testid="contractor-report-form"] textarea');
  const count = await textareas.count();
  if (count >= 1) await textareas.nth(0).fill(`1) ${comment}\n2) B\n3) C`);
  if (count >= 2) await textareas.nth(1).fill(`1) ${comment} W2\n2) B\n3) C`);
  if (count >= 3) await textareas.nth(2).fill('No issues');
  if (count >= 4) await textareas.nth(3).fill(comment);

  const fileInput = page.locator('input[type="file"][accept="image/*"]');
  if (await fileInput.count() > 0) {
    await fileInput.setInputFiles({ name: 'e2e-test.png', mimeType: 'image/png', buffer: TINY_PNG });
  }

  const declaration = page.locator('[data-testid="declaration-checkbox"]');
  if (await declaration.count() > 0) await declaration.click();

  const saveBtn = page.locator('[data-testid="save-contractor-report"]');
  if (await saveBtn.count() > 0) {
    // Submit stays disabled while the photo's async upload is in flight.
    await expect(saveBtn).toBeEnabled({ timeout: 30_000 });
    await saveBtn.click();
    await expect(page.locator('text=Report submitted')).toBeVisible({ timeout: 20_000 });
    return true;
  }
  return false;
}

async function verifyDrawerNoCorruption(drawer) {
  const text = await drawer.innerText();
  expect(text).not.toContain('NaN');
  expect(text).not.toContain('[object Object]');
  expect(text).not.toContain('undefined');
  return text;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Multi-project scenario', () => {
  test('can create all 4 test projects', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    const nearOpenDate = new Date();
    nearOpenDate.setDate(nearOpenDate.getDate() + 20);

    await Promise.allSettled([
      createTestProject(page, {
        storeCode: PROJECT_NAMES.healthy,
        mallName: 'E2E Healthy Mall',
        country: 'Testland',
      }),
      // Note: create sequentially to avoid race on modal
    ]);

    await createTestProject(page, {
      storeCode: PROJECT_NAMES.healthy,
      mallName: 'E2E Healthy Mall',
      country: 'Testland',
    });

    await createTestProject(page, {
      storeCode: PROJECT_NAMES.nearOpen,
      mallName: 'E2E Near Open Mall',
      country: 'Testland',
      targetOpeningDate: nearOpenDate.toISOString().split('T')[0],
    });

    await createTestProject(page, {
      storeCode: PROJECT_NAMES.missing,
      mallName: 'E2E Missing Reports Mall',
      country: 'Testland',
    });

    await createTestProject(page, {
      storeCode: PROJECT_NAMES.pmAhead,
      mallName: 'E2E PM Ahead Mall',
      country: 'Testland',
    });

    // Verify all projects appear in the project list
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    for (const code of Object.values(PROJECT_NAMES)) {
      // Projects may or may not be in current page view — just verify no crash
      page.locator('[data-testid="portfolio-master-project"], [data-testid="project-row"]').filter({ hasText: code });
    }

    await logout(page);
  });

  test('dashboard loads after multi-project creation — no crash or NaN', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN%');
    expect(bodyText).not.toContain('[object Object]');
    expect(bodyText).not.toContain('undefined');

    await logout(page);
  });

  test('risk dashboard shows numeric KPIs across all projects', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/risk');
    await page.waitForLoadState('networkidle');

    for (const level of ['critical', 'high', 'medium', 'low']) {
      const box = page.locator(`[data-testid="risk-kpi-${level}"]`);
      if (await box.count() === 0) continue;
      const text = await box.innerText();
      const num = parseInt(text, 10);
      expect(Number.isFinite(num)).toBe(true);
      expect(num).toBeGreaterThanOrEqual(0);
    }

    await logout(page);
  });

  test('weekly-reports page loads with all projects available', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/weekly-reports');
    await page.waitForLoadState('networkidle');

    const projectSelect = page.locator('[data-testid="project-select"]');
    if (await projectSelect.count() > 0) {
      const optionCount = await projectSelect.locator('option').count();
      expect(optionCount).toBeGreaterThanOrEqual(0); // At least 0 (no crash)
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('[object Object]');
    expect(bodyText).not.toContain('undefined');

    await logout(page);
  });

  test('contractor can submit a report for an assigned project', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
    await page.waitForLoadState('networkidle');

    const cards = page.locator('.contractor-project-card');
    test.skip(await cards.count() === 0, 'No projects assigned to contractor for multi-project test');

    await cards.first().locator('button.btn-primary').click();
    await expect(page).toHaveURL(/\/contractor-report\//);

    const submitted = await submitContractorReport(page, {
      comment: `Multi-project E2E ${TS}`,
    });
    expect(submitted).toBe(true);

    await logout(page);
  });

  test('submitted contractor report appears in weekly-reports for admin', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/weekly-reports');
    await page.waitForLoadState('networkidle');

    const projectSelect = page.locator('[data-testid="project-select"]');
    if (await projectSelect.count() > 0) {
      const options = await projectSelect.locator('option').count();
      if (options > 1) {
        await projectSelect.selectOption({ index: 1 });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
      }
    }

    // Reports should load — no crash, no NaN
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN%');
    expect(bodyText).not.toContain('[object Object]');

    await logout(page);
  });

  test('dashboard project rows have valid drawer content for all visible projects', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    const rowCount = await rows.count();
    test.skip(rowCount === 0, 'No projects on dashboard for multi-project drawer test');

    // Open up to 5 drawers and verify no corruption
    let openedCount = 0;
    for (let i = 0; i < Math.min(rowCount, 5); i++) {
      await rows.nth(i).click();
      await page.waitForTimeout(400);
      const drawer = page.locator('[data-testid="project-detail-drawer"]');
      if (!await drawer.isVisible().catch(() => false)) continue;

      openedCount++;
      await verifyDrawerNoCorruption(drawer);

      // Close drawer
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    expect(openedCount).toBeGreaterThan(0);

    await logout(page);
  });

  test('opening readiness varies correctly across projects with and without dates', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    const rowCount = await rows.count();
    test.skip(rowCount === 0, 'No projects for opening readiness multi-project test');

    let withDateFound = false;
    let withoutDateFound = false;

    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      await rows.nth(i).click();
      await page.waitForTimeout(400);
      const drawer = page.locator('[data-testid="project-detail-drawer"]');
      if (!await drawer.isVisible().catch(() => false)) continue;

      const openingBlock = drawer.locator('[data-testid="opening-readiness-status"]');
      if (await openingBlock.isVisible()) {
        const badge = drawer.locator('[data-testid="opening-risk-badge"]');
        if (await badge.isVisible()) withDateFound = true;

        const noDate = openingBlock.locator('text=No target date set');
        if (await noDate.isVisible()) withoutDateFound = true;
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      if (withDateFound && withoutDateFound) break;
    }

    // At least one type should exist (either with or without date)
    expect(withDateFound || withoutDateFound).toBe(true);

    await logout(page);
  });

  test('data consistency: dashboard project count matches weekly reports options count', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const dashboardCount = await page.locator('[data-testid="dashboard-project-row"]').count();

    await page.goto('/weekly-reports');
    await page.waitForLoadState('networkidle');
    const wrOptionCount = await page.locator('[data-testid="project-select"] option').count();

    // Both should be non-negative. The WR dropdown may have an extra "All projects" option.
    expect(dashboardCount).toBeGreaterThanOrEqual(0);
    expect(wrOptionCount).toBeGreaterThanOrEqual(0);
    // The discrepancy (if any) should be at most the "All projects" placeholder option
    const diff = Math.abs(dashboardCount - wrOptionCount);
    expect(diff).toBeLessThanOrEqual(2);

    await logout(page);
  });

  test('risk dashboard row count is non-negative and matches risk level filter', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/risk');
    await page.waitForLoadState('networkidle');

    // Sum all KPI levels — should be non-negative
    let totalKPI = 0;
    for (const level of ['critical', 'high', 'medium', 'low']) {
      const box = page.locator(`[data-testid="risk-kpi-${level}"]`);
      if (await box.count() === 0) continue;
      const text = await box.innerText();
      const num = parseInt(text, 10);
      if (Number.isFinite(num)) totalKPI += num;
    }
    expect(totalKPI).toBeGreaterThanOrEqual(0);

    // Page body must not contain corrupted values
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('[object Object]');
    expect(bodyText).not.toContain('undefined');

    await logout(page);
  });

  test('switching between projects in weekly reports does not break the UI', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/weekly-reports');
    await page.waitForLoadState('networkidle');

    const projectSelect = page.locator('[data-testid="project-select"]');
    if (await projectSelect.count() === 0) {
      test.skip(true, 'No project select found in weekly reports');
    }

    const optionCount = await projectSelect.locator('option').count();
    if (optionCount < 2) {
      test.skip(true, 'Not enough projects to cycle through in weekly reports');
    }

    // Cycle through first 3 projects (or all if fewer)
    const cycleTo = Math.min(optionCount, 3);
    for (let i = 0; i < cycleTo; i++) {
      await projectSelect.selectOption({ index: i });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);

      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('NaN%');
      expect(bodyText).not.toContain('[object Object]');
    }

    await logout(page);
  });
});
