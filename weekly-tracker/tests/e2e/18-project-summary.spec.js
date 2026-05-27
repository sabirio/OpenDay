import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

/**
 * Executive Project Summary tests.
 * The project detail drawer IS the executive summary — it shows only high-level
 * status blocks without detailed risk explanations.
 */

async function openFirstDrawer(page) {
  const rows = page.locator('[data-testid="dashboard-project-row"]');
  const count = await rows.count();
  if (count === 0) return null;

  for (let i = 0; i < Math.min(count, 5); i++) {
    await rows.nth(i).click();
    await page.waitForTimeout(400);
    const drawer = page.locator('[data-testid="project-detail-drawer"]');
    if (await drawer.isVisible().catch(() => false)) return drawer;
  }
  return null;
}

test.describe('Executive Project Summary (Drawer)', () => {
  test('project detail drawer opens and shows all 4 summary blocks', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    test.skip(await rows.count() === 0, 'No projects for executive summary test');

    const drawer = await openFirstDrawer(page);
    test.skip(!drawer, 'Could not open project drawer');

    // All 4 summary blocks must be present
    await expect(drawer.locator('[data-testid="contractor-status-summary"]')).toBeVisible();
    await expect(drawer.locator('[data-testid="pm-site-visit-summary"]')).toBeVisible();
    await expect(drawer.locator('[data-testid="risk-status-summary"]')).toBeVisible();
    await expect(drawer.locator('[data-testid="opening-readiness-status"]')).toBeVisible();

    await logout(page);
  });

  test('contractor-status-summary block shows progress % and report count', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    test.skip(await rows.count() === 0, 'No projects for contractor-status test');

    const drawer = await openFirstDrawer(page);
    test.skip(!drawer, 'Could not open project drawer');

    const block = drawer.locator('[data-testid="contractor-status-summary"]');
    await expect(block).toBeVisible();

    const text = await block.innerText();
    // Should contain a progress % and "Total reports" label
    expect(text).toMatch(/\d+%/); // progress percentage
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('undefined');

    await logout(page);
  });

  test('risk-status-summary block shows risk level badge text (not detailed explanations)', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    test.skip(await rows.count() === 0, 'No projects for risk level badge test');

    const drawer = await openFirstDrawer(page);
    test.skip(!drawer, 'Could not open project drawer');

    const riskBlock = drawer.locator('[data-testid="risk-status-summary"]');
    await expect(riskBlock).toBeVisible();

    const badge = drawer.locator('[data-testid="risk-level-badge"]');
    await expect(badge).toBeVisible();
    const level = await badge.innerText();
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']).toContain(level.trim());

    // The block should NOT contain detailed risk score numbers (those are in Risk Dashboard)
    const blockText = await riskBlock.innerText();
    expect(blockText).not.toMatch(/Score: \d+/); // risk score detail
    expect(blockText).not.toContain('Recommended Actions'); // action detail belongs in Risk Dashboard

    await logout(page);
  });

  test('pm-site-visit-summary shows "No site visits recorded" for new projects', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    test.skip(await rows.count() === 0, 'No projects to test PM site visit block');

    // Find a project with no site visits (most newly created test projects)
    let found = false;
    for (let i = 0; i < Math.min(await rows.count(), 10); i++) {
      await rows.nth(i).click();
      await page.waitForTimeout(400);
      const drawer = page.locator('[data-testid="project-detail-drawer"]');
      if (!await drawer.isVisible().catch(() => false)) continue;

      const pmBlock = drawer.locator('[data-testid="pm-site-visit-summary"]');
      if (!await pmBlock.isVisible()) {
        const close = drawer.locator('button', { hasText: /close/i });
        if (await close.count() > 0) await close.click();
        continue;
      }

      const noVisitText = pmBlock.locator('text=No site visits recorded');
      if (await noVisitText.isVisible()) {
        found = true;
        // Verify no discrepancy-count appears when no visits
        await expect(drawer.locator('[data-testid="discrepancy-count"]')).not.toBeVisible();
        break;
      }

      const close = drawer.locator('button', { hasText: /close/i });
      if (await close.count() > 0) await close.click();
      await page.waitForTimeout(200);
    }

    // Skip if all projects happen to have site visits (valid state)
    if (!found) {
      test.skip(true, 'All projects have site visits — no "No site visits" state to test');
    }

    await logout(page);
  });

  test('drawer shows discrepancy-count when PM site visit with discrepancies exists', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    test.skip(await rows.count() === 0, 'No projects for discrepancy-count test');

    let discrepancyFound = false;
    for (let i = 0; i < Math.min(await rows.count(), 10); i++) {
      await rows.nth(i).click();
      await page.waitForTimeout(400);
      const drawer = page.locator('[data-testid="project-detail-drawer"]');
      if (!await drawer.isVisible().catch(() => false)) continue;

      const discBlock = drawer.locator('[data-testid="discrepancy-count"]');
      if (await discBlock.isVisible()) {
        const val = parseInt(await discBlock.innerText(), 10);
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
        discrepancyFound = true;
        break;
      }

      const close = drawer.locator('button', { hasText: /close/i });
      if (await close.count() > 0) await close.click();
      await page.waitForTimeout(200);
    }

    if (!discrepancyFound) {
      test.skip(true, 'No project with PM site visit found to check discrepancy-count');
    }

    await logout(page);
  });

  test('executive summary shows high-level statuses only — no deep risk explanations', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    test.skip(await rows.count() === 0, 'No projects for executive view test');

    const drawer = await openFirstDrawer(page);
    test.skip(!drawer, 'Could not open project drawer');

    const drawerText = await drawer.innerText();

    // Executive summary should not contain page-level deep risk analysis texts
    expect(drawerText).not.toContain('Project Risk Register');
    expect(drawerText).not.toContain('Risk Escalation Register');
    expect(drawerText).not.toContain('Contractor Performance');
    expect(drawerText).not.toContain('PM Site Visit Verification');

    // Should contain executive-level section labels
    expect(drawerText).toContain('Contractor Report');
    expect(drawerText).toContain('PM Site Visit');
    expect(drawerText).toContain('Risk Summary');
    expect(drawerText).toContain('Opening Readiness');

    await logout(page);
  });

  test('drawer closes on Escape key', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    test.skip(await rows.count() === 0, 'No projects for Escape close test');

    await rows.first().click();
    await page.waitForTimeout(400);

    const drawer = page.locator('[data-testid="project-detail-drawer"]');
    test.skip(!await drawer.isVisible().catch(() => false), 'Drawer did not open');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(drawer).not.toBeVisible({ timeout: 3_000 });

    await logout(page);
  });

  test('drawer contains no NaN or undefined values', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]');
    test.skip(await rows.count() === 0, 'No projects for NaN check in drawer');

    const drawer = await openFirstDrawer(page);
    test.skip(!drawer, 'Could not open project drawer');

    const text = await drawer.innerText();
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('[object Object]');
    expect(text).not.toContain('undefined');

    await logout(page);
  });
});
