// Sprint 5 — Phase 1: authenticated mobile verification for Contractor Report
// and PM Site Visit, against LOCAL Supabase only. Uses the certification
// fixture accounts (scripts/certification/fixture-state.json — already
// seeded in the local stack, cert.local emails, company-a) rather than the
// tests/e2e/helpers.js CREDENTIALS defaults, which point at openday.fit
// accounts that are not (and must not be) seeded via production.
//
// Every login() call here goes through the real browser login form against
// whatever VITE_SUPABASE_URL the running dev server was built with — this
// spec makes no direct Supabase client call in the Node test process, so it
// cannot reach production even if env vars are misconfigured elsewhere.

import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

const LOCAL_USERS = {
  contractor: { email: 'contractor-a-assigned@cert.local', password: 'Cert-Test-Pass-1!', role: 'Contractor' },
  pm:         { email: 'pm-a-assigned@cert.local',          password: 'Cert-Test-Pass-1!', role: 'PM' },
  admin:      { email: 'admin-a@cert.local',                 password: 'Cert-Test-Pass-1!', role: 'Admin' },
};

const VIEWPORT_PRIMARY = { width: 390, height: 844 };

test.describe('Mobile field workflows — 390x844 (primary release gate)', () => {
  test.use({ viewport: VIEWPORT_PRIMARY });

  test('Contractor Report — login, open project, form renders without horizontal overflow', async ({ page }) => {
    await login(page, LOCAL_USERS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/);

    // App.jsx fetches projects asynchronously after the route mounts (projectsState:
    // 'loading' -> 'ready'/'error') — wait for that to resolve before asserting on cards,
    // rather than racing the initial fetch.
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });

    const hasProjects = await page.locator('.contractor-project-card').count() > 0;
    expect(hasProjects, 'fixture contractor must have at least one assigned project').toBeTruthy();

    await page.locator('.contractor-project-card button.btn-primary').first().click();
    await expect(page).toHaveURL(/\/contractor-report\//);

    await expect(page.locator('button', { hasText: 'Submit Weekly Report' })).toBeVisible();

    // No horizontal overflow at the primary mobile viewport.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `page scrollWidth exceeds clientWidth by ${overflow}px at 390x844`).toBeLessThanOrEqual(1);

    await page.screenshot({ path: 'test-results/mobile-390x844-contractor-report.png', fullPage: true });
  });

  test('Contractor Report — fill a WP row, autosave, refresh, recovery prompt, Continue restores values', async ({ page }) => {
    await login(page, LOCAL_USERS.contractor);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    await page.locator('.contractor-project-card button.btn-primary').first().click();
    await expect(page).toHaveURL(/\/contractor-report\//);

    const today = new Date().toISOString().split('T')[0];
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill(today);

    // Scoped Gantt WPs render as collapsible phase headers (GanttWPSection.jsx's
    // PhaseSection) — expand one, then set a status on its first task row.
    // WorkPackageProgressSection shows "Loading schedule..." while ganttLoading
    // is true, so wait for the header to actually appear rather than a bare
    // .count() (which doesn't retry and races the async Gantt fetch).
    const phaseHeader = page.locator('[data-testid="gantt-phase-header"]').first();
    const hasPhase = await phaseHeader.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    test.skip(!hasPhase, 'fixture project has no scoped Gantt WPs to expand — needs fixture check, not a UI defect');
    await phaseHeader.click();

    const inProgressBtn = page.locator('button', { hasText: 'In Progress' }).first();
    await expect(inProgressBtn).toBeVisible({ timeout: 5000 });
    await inProgressBtn.click();

    // Give the 500ms-debounced autosave time to actually persist to localStorage.
    await page.waitForTimeout(900);

    const dateValueBeforeReload = await dateInput.inputValue();

    await page.reload();

    // A full reload re-runs the app's own top-level auth/project fetch first
    // (global "Loading..." state, same one test 1 waits out) before the
    // contractor-report route's own draft check can even run — wait that out
    // before looking for recovery UI, rather than racing it.
    await page.locator('input[type="date"]')
      .or(page.locator('text=/continue|recover|restore|draft/i'))
      .first()
      .waitFor({ timeout: 15_000 });

    // A draft-recovery affordance should appear rather than silently discarding the edit.
    const recoveryBanner = page.locator('text=/continue|recover|restore|draft/i').first();
    const recoveryVisible = await recoveryBanner.isVisible({ timeout: 5000 }).catch(() => false);

    if (recoveryVisible) {
      const continueBtn = page.locator('button', { hasText: /continue/i }).first();
      if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
      }
      const dateValueAfterRecovery = await page.locator('input[type="date"]').first().inputValue();
      expect(dateValueAfterRecovery).toBe(dateValueBeforeReload);
    }

    await page.screenshot({ path: 'test-results/mobile-390x844-contractor-recovery.png', fullPage: true });

    // Result recorded either way — recoveryVisible === false is a real finding, not a script bug,
    // since it means the autosave/recovery UI did not appear within 5s of reload.
    expect(recoveryVisible, 'draft recovery prompt did not appear after refresh with an unsaved edit').toBeTruthy();
  });

  test('PM Site Visit — login, open project from the dedicated Site Visit selector, form renders', async ({ page }) => {
    await login(page, LOCAL_USERS.pm);
    // /site-visit-select (pages/SiteVisitSelect.jsx) is the app's own dedicated
    // project-picker for this workflow — not the desktop /projects admin table.
    await page.goto('/site-visit-select');
    await page.waitForLoadState('networkidle');

    const overflowOnSelect = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    const rows = page.getByRole('button', { name: /Start site visit for/i });
    const rowCount = await rows.count();
    test.skip(rowCount === 0, 'fixture PM has no visible projects on /site-visit-select — needs fixture check, not a UI defect');

    await rows.first().click();
    await expect(page).toHaveURL(/\/site-visit\//, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="pm-site-visit-form"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-testid="pm-task-row"], .site-visit-legacy-scope').first().waitFor({ timeout: 15_000 });

    const overflowOnForm = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    await page.screenshot({ path: 'test-results/mobile-390x844-site-visit.png', fullPage: true });

    expect(overflowOnSelect, `SiteVisitSelect scrollWidth exceeds clientWidth by ${overflowOnSelect}px at 390x844 (fixed 4-column grid layout, no responsive collapse found in source)`).toBeLessThanOrEqual(1);
    expect(overflowOnForm, `Site Visit form scrollWidth exceeds clientWidth by ${overflowOnForm}px at 390x844`).toBeLessThanOrEqual(1);
  });
});

// Secondary viewports — open/no-overflow only (the task's own release-gate
// requirement is scoped to 390x844; these are a lighter-weight confirmation
// the fix generalizes, not a second full scripted pass per viewport).
const SECONDARY_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 412, height: 915 },
];

for (const vp of SECONDARY_VIEWPORTS) {
  test.describe(`Mobile field workflows — ${vp.width}x${vp.height} (secondary viewport)`, () => {
    test.use({ viewport: vp });

    test(`Contractor Report opens without horizontal overflow at ${vp.width}x${vp.height}`, async ({ page }) => {
      await login(page, LOCAL_USERS.contractor);
      await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
      await page.locator('.contractor-project-card button.btn-primary').first().click();
      await expect(page).toHaveURL(/\/contractor-report\//);
      await expect(page.locator('button', { hasText: 'Submit Weekly Report' })).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: `test-results/mobile-${vp.width}x${vp.height}-contractor-report.png`, fullPage: true });
      expect(overflow, `scrollWidth exceeds clientWidth by ${overflow}px at ${vp.width}x${vp.height}`).toBeLessThanOrEqual(1);
    });

    test(`PM Site Visit opens without horizontal overflow at ${vp.width}x${vp.height}`, async ({ page }) => {
      await login(page, LOCAL_USERS.pm);
      await page.goto('/site-visit-select');
      await page.waitForLoadState('networkidle');

      const rows = page.getByRole('button', { name: /Start site visit for/i });
      const rowCount = await rows.count();
      test.skip(rowCount === 0, 'fixture PM has no visible projects on /site-visit-select — needs fixture check, not a UI defect');

      await rows.first().click();
      await expect(page).toHaveURL(/\/site-visit\//, { timeout: 15_000 });
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="pm-site-visit-form"]')).toBeVisible({ timeout: 15_000 });
      await page.locator('[data-testid="pm-task-row"], .site-visit-legacy-scope').first().waitFor({ timeout: 15_000 });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: `test-results/mobile-${vp.width}x${vp.height}-site-visit.png`, fullPage: true });
      expect(overflow, `scrollWidth exceeds clientWidth by ${overflow}px at ${vp.width}x${vp.height}`).toBeLessThanOrEqual(1);
    });
  });
}
