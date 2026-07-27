import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

/**
 * Executive Project Summary tests.
 * The project detail drawer IS the executive summary — it shows only high-level
 * status blocks without detailed risk explanations.
 */

async function openFirstDrawer(page) {
  const rows = page.locator('[data-testid="dashboard-master-project"]');
  const count = await rows.count();
  if (count === 0) return null;

  for (let i = 0; i < Math.min(count, 5); i++) {
    await rows.nth(i).click();
    await page.waitForTimeout(400);
    const drawer = page.locator('.dashboard-project-overview');
    if (await drawer.isVisible().catch(() => false)) return drawer;
  }
  return null;
}

test.describe('Executive Project Summary (Drawer)', () => {
  test('project detail workspace shows the four current executive concerns', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-master-project"]');
    test.skip(await rows.count() === 0, 'No projects for executive summary test');

    const drawer = await openFirstDrawer(page);
    test.skip(!drawer, 'Could not open project drawer');

    for (const label of ['Canonical progress', 'PM comparison', 'Overall risk', 'Opening readiness']) {
      await expect(drawer.locator('.dashboard-detail-field').filter({ hasText: label })).toBeVisible();
    }

    await logout(page);
  });

  test('detail workspace shows progress percentage and report count', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-master-project"]');
    test.skip(await rows.count() === 0, 'No projects for contractor-status test');

    const drawer = await openFirstDrawer(page);
    test.skip(!drawer, 'Could not open project drawer');

    await expect(drawer.locator('.dashboard-detail-field').filter({ hasText: 'Canonical progress' })).toContainText(/\d+%/);
    await expect(drawer.locator('.dashboard-detail-field').filter({ hasText: 'Reports submitted' })).toContainText(/\d+/);

    await logout(page);
  });

  test('risk-status-summary block shows risk level badge text (not detailed explanations)', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-master-project"]');
    test.skip(await rows.count() === 0, 'No projects for risk level badge test');

    const drawer = await openFirstDrawer(page);
    test.skip(!drawer, 'Could not open project drawer');

    const riskBlock = drawer.locator('.dashboard-detail-section').filter({ hasText: 'Latest Risks' });
    await expect(riskBlock).toBeVisible();

    const riskField = riskBlock.locator('.dashboard-detail-field').filter({ hasText: 'Overall risk' });
    await expect(riskField).toContainText(/LOW|MEDIUM|HIGH|CRITICAL|UNKNOWN/i);

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

    const rows = page.locator('[data-testid="dashboard-master-project"]');
    test.skip(await rows.count() === 0, 'No projects to test PM site visit block');

    // Find a project with no site visits (most newly created test projects)
    let found = false;
    for (let i = 0; i < Math.min(await rows.count(), 10); i++) {
      await rows.nth(i).click();
      await page.waitForTimeout(400);
      const drawer = page.locator('.dashboard-project-overview');
      if (!await drawer.isVisible().catch(() => false)) continue;

      const pmBlock = drawer.locator('.dashboard-detail-field').filter({ hasText: 'PM comparison' });
      if (!await pmBlock.isVisible()) {
        const close = drawer.locator('button', { hasText: /close/i });
        if (await close.count() > 0) await close.click();
        continue;
      }

      const noVisitText = pmBlock.locator('text=No site visits recorded');
      if (await noVisitText.isVisible()) {
        found = true;
        // Verify no discrepancy-count appears when no visits
        await expect(pmBlock).toContainText('No site visit');
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

    const rows = page.locator('[data-testid="dashboard-master-project"]');
    test.skip(await rows.count() === 0, 'No projects for discrepancy-count test');

    let discrepancyFound = false;
    for (let i = 0; i < Math.min(await rows.count(), 10); i++) {
      await rows.nth(i).click();
      await page.waitForTimeout(400);
      const drawer = page.locator('.dashboard-project-overview');
      if (!await drawer.isVisible().catch(() => false)) continue;

      const discBlock = drawer.locator('.dashboard-detail-field').filter({ hasText: 'PM comparison' });
      if (await discBlock.isVisible()) {
        const text = await discBlock.innerText();
        if (/discrepanc/i.test(text)) {
          const val = Number(text.match(/\d+/)?.[0]);
          expect(Number.isFinite(val)).toBe(true);
          expect(val).toBeGreaterThanOrEqual(0);
          discrepancyFound = true;
          break;
        }
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

    const rows = page.locator('[data-testid="dashboard-master-project"]');
    test.skip(await rows.count() === 0, 'No projects for executive view test');

    const drawer = await openFirstDrawer(page);
    test.skip(!drawer, 'Could not open project drawer');

    // Section headers render through CSS text-transform: uppercase — compare
    // case-insensitively so this doesn't depend on that styling choice.
    const drawerText = (await drawer.innerText()).toLowerCase();

    // Executive summary should not contain page-level deep risk analysis texts
    expect(drawerText).not.toContain('project risk register');
    expect(drawerText).not.toContain('risk escalation register');
    expect(drawerText).not.toContain('contractor performance');
    expect(drawerText).not.toContain('pm site visit verification');

    // Should contain executive-level section labels
    expect(drawerText).toContain('recent reports');
    expect(drawerText).toContain('pm comparison');
    expect(drawerText).toContain('latest risks');
    expect(drawerText).toContain('opening readiness');

    await logout(page);
  });

  test('inline detail selection persists when Escape is pressed', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-master-project"]');
    test.skip(await rows.count() === 0, 'No projects for Escape close test');

    await rows.first().click();
    await page.waitForTimeout(400);

    const drawer = page.locator('.dashboard-project-overview');
    test.skip(!await drawer.isVisible().catch(() => false), 'Drawer did not open');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(drawer).toBeVisible();
    await expect(rows.first()).toHaveAttribute('aria-pressed', 'true');

    await logout(page);
  });

  test('drawer contains no NaN or undefined values', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-master-project"]');
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
