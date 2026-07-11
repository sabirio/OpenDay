// Staging cloud E2E — Step 6b: PM Site Visit against the deployed staging
// frontend + staging Supabase, using real fixture users.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'scripts', 'staging', 'staging-fixture-state.json'), 'utf8'));
const PM = { email: state.users.pmAAssigned.email, password: state.password };

const BYPASS_SECRET = process.env.STAGING_VERCEL_AUTOMATION_BYPASS_SECRET;

test.use({
  extraHTTPHeaders: {
    'x-vercel-protection-bypass': BYPASS_SECRET,
    'x-vercel-set-bypass-cookie': 'true',
  },
});

test.describe('Staging cloud E2E — PM Site Visit', () => {
  test('login, open project, set a status, submit', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(PM.email);
    await page.locator('#password').fill(PM.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 });

    await page.goto('/site-visit-select');
    await page.waitForLoadState('networkidle');
    // SiteVisitSelect.jsx's row carries role="button" (Phase 1 accessibility
    // fix) — target that directly rather than a loose `div` text filter,
    // which over-matches ancestor wrapper divs that also contain the text
    // but have no click handler.
    const rows = page.locator('[role="button"]').filter({ hasText: 'Start Visit' });
    await expect(rows.first(), 'staging fixture PM must have a visible project').toBeVisible();
    await rows.first().click();
    await expect(page).toHaveURL(/\/site-visit\//, { timeout: 15_000 });
    await expect(page.locator('[data-testid="pm-site-visit-form"]')).toBeVisible({ timeout: 15_000 });

    const taskRow = page.locator('[data-testid="pm-task-row"]');
    await expect(taskRow.first(), 'staging fixture project must have scoped Gantt tasks').toBeVisible({ timeout: 10_000 });

    const inProgressBtn = page.locator('[data-testid="pm-status-btn-in_progress"]').first();
    await inProgressBtn.click();
    await expect(inProgressBtn).toHaveAttribute('aria-pressed', 'true');

    // PM schedule assessment (On Track / At Risk / Critical) — required,
    // separate from the per-WP status set above (found live: the first
    // submit attempt was correctly rejected with "PM schedule assessment
    // is required" when this was left unset).
    const onTrackBtn = page.locator('button', { hasText: 'On Track' }).first();
    if (await onTrackBtn.isVisible().catch(() => false)) await onTrackBtn.click();

    const declaration = page.locator('[data-testid="pm-declaration-checkbox"]');
    if (await declaration.isVisible().catch(() => false)) await declaration.click();

    await page.waitForTimeout(600);
    const submitBtn = page.locator('[data-testid="save-site-visit-report"]');
    await expect(submitBtn).toBeVisible();
    const disabled = await submitBtn.isDisabled();
    console.log(`Submit button disabled: ${disabled}`);
    if (!disabled) {
      await submitBtn.click();
      await page.waitForTimeout(2500);
    }

    await page.screenshot({ path: 'test-results/staging-pm-site-visit.png', fullPage: true });

    const errorBanner = page.locator('.field-form-error-summary, [role="alert"]');
    const hasError = await errorBanner.isVisible().catch(() => false);
    if (hasError) {
      const text = await errorBanner.textContent().catch(() => '(could not read)');
      console.log(`Error banner text: ${text}`);
    }
    expect(hasError, 'submit must not still show a validation error banner with all required fields filled').toBeFalsy();

    const successVisible = await page.locator('text=/visit (recorded|submitted|confirmed)/i').isVisible({ timeout: 10_000 }).catch(() => false);
    console.log(`Success indicator visible: ${successVisible}`);
    expect(successVisible, 'expected the real site-visit success indicator').toBeTruthy();
  });
});
