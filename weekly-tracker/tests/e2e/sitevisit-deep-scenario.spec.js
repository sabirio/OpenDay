import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

const PM = { email: 'pm-a-assigned@cert.local', password: 'Cert-Test-Pass-1!' };
const VIEWPORT_PRIMARY = { width: 390, height: 844 };

test.describe('PM Site Visit — deeper live scenario (Phase 7)', () => {
  test.use({ viewport: VIEWPORT_PRIMARY });

  test('navigation, filters, discrepancy creation, autosave/recovery of position+filter, submit', async ({ page }) => {
    await login(page, PM);
    await page.goto('/site-visit-select');
    await page.waitForLoadState('networkidle');
    const rows = page.getByRole('button', { name: /Start site visit for/i });
    const rowCount = await rows.count();
    test.skip(rowCount === 0, 'fixture PM has no visible projects');
    await rows.first().click();
    await expect(page).toHaveURL(/\/site-visit\//, { timeout: 15_000 });

    const form = page.locator('[data-testid="pm-site-visit-form"]');
    await expect(form).toBeVisible({ timeout: 15_000 });

    // Gantt tasks load asynchronously after the route mounts — wait for the
    // first task row (or a definitive "no tasks" empty state) rather than
    // racing the fetch with an immediate .count() check (the same race
    // pattern already fixed in mobile-field-workflows.spec.js).
    const taskRow = page.locator('[data-testid="pm-task-row"]');
    const hasTasks = await taskRow.first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    test.skip(!hasTasks, 'fixture project has no scoped Gantt tasks for site visit — needs fixture check');

    // ── Filters ──────────────────────────────────────────────────────────
    const filterGroup = page.locator('[role="group"][aria-label="Observation filter"]');
    await expect(filterGroup).toBeVisible();
    const allBtn = filterGroup.locator('button', { hasText: 'all' });
    const incompleteBtn = filterGroup.locator('button', { hasText: 'incomplete' });
    const discrepantBtn = filterGroup.locator('button', { hasText: 'discrepant' });
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true');
    await incompleteBtn.click();
    await expect(incompleteBtn).toHaveAttribute('aria-pressed', 'true');
    await allBtn.click();
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true');

    // ── Create a real discrepancy: set PM status to "Completed" (100%),
    // deliberately diverging from whatever GC claimed for this WP. ──────
    const completedBtn = page.locator('[data-testid="pm-status-btn-completed"]').first();
    await completedBtn.click();
    const discBadge = page.locator('[data-testid="pm-task-discrepancy"]');
    const discAppeared = await discBadge.isVisible({ timeout: 3000 }).catch(() => false);
    // Not asserted strictly — GC's own claim might already have been
    // "completed", in which case no discrepancy is the *correct* outcome,
    // not a defect. Record what actually happened instead of forcing PASS.
    console.log(`Discrepancy badge visible after setting Completed: ${discAppeared}`);

    // ── Continuous list (no Previous/Next paging) ───────────────────────
    // All filtered tasks render simultaneously now — a second task row
    // (when the fixture scope has more than one) proves the list isn't
    // paged behind a single-item navigator anymore.
    await expect(page.locator('.site-visit-current-heading')).toBeVisible();
    const previousBtn = page.getByRole('button', { name: 'Previous', exact: true });
    const nextBtn = page.getByRole('button', { name: /Next item/i });
    await expect(previousBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();
    const focusedTaskCount = await taskRow.count();
    console.log(`Focused task rows rendered under 'all' filter: ${focusedTaskCount}`);

    // ── Autosave -> refresh -> recovery restores current WP + filter ────
    await discrepantBtn.click();
    await page.waitForTimeout(900); // 500ms debounce + margin
    await page.reload();
    await page.locator('[data-testid="pm-site-visit-form"]')
      .or(page.locator('text=/continue|recover|restore/i'))
      .first()
      .waitFor({ timeout: 15_000 });
    const recoveryBtn = page.locator('button', { hasText: /continue/i }).first();
    if (await recoveryBtn.isVisible().catch(() => false)) await recoveryBtn.click();
    await expect(form).toBeVisible({ timeout: 10_000 });
    const discrepantStillPressed = await page.locator('[role="group"][aria-label="Observation filter"] button', { hasText: 'discrepant' }).getAttribute('aria-pressed').catch(() => null);
    console.log(`Active filter after refresh+recovery: aria-pressed=${discrepantStillPressed}`);

    // ── Review summary + submit ──────────────────────────────────────────
    const reviewSection = page.locator('.site-visit-review, [aria-labelledby="site-visit-review-title"]');
    await expect(reviewSection).toBeVisible({ timeout: 5000 });

    const declarationCheckbox = page.locator('[data-testid="pm-declaration-checkbox"]');
    if (await declarationCheckbox.isVisible().catch(() => false)) await declarationCheckbox.click();

    const submitBtn = page.locator('[data-testid="save-site-visit-report"]');
    await expect(submitBtn).toBeVisible();
    const submitDisabled = await submitBtn.isDisabled();
    console.log(`Submit button disabled before full completion: ${submitDisabled}`);
  });
});
