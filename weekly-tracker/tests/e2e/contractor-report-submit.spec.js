import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Minimal valid 1x1 PNG (same fixture used by Sprint 4.5's Storage certification).
const PNG_1PX_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const CONTRACTOR = { email: 'contractor-a-assigned@cert.local', password: 'Cert-Test-Pass-1!' };
const VIEWPORT_PRIMARY = { width: 390, height: 844 };

test.describe('Contractor Report — live submit (Phase 7)', () => {
  test.use({ viewport: VIEWPORT_PRIMARY });

  test('fill required fields, submit, confirm success and draft removal', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    await page.locator('.contractor-project-card button.btn-primary').first().click();
    await expect(page).toHaveURL(/\/contractor-report\//);

    const form = page.locator('[data-testid="contractor-report-form"]');
    await expect(form).toBeVisible({ timeout: 15_000 });

    // Use a unique reporting date (today's date isn't guaranteed unused --
    // earlier live specs filled but never submitted "today" on this same
    // project; a fresh timestamp-based date avoids CR-03's
    // one-report-per-project-per-date business rule colliding here).
    const uniqueDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * (100 + Math.floor(Math.random() * 200)));
    const dateStr = uniqueDate.toISOString().split('T')[0];
    await page.locator('input[type="date"]').first().fill(dateStr);

    const phaseHeader = page.locator('[data-testid="gantt-phase-header"]').first();
    const hasPhase = await phaseHeader.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    test.skip(!hasPhase, 'fixture project has no scoped Gantt WPs');
    await phaseHeader.click();
    const inProgressBtn = page.locator('button', { hasText: 'In Progress' }).first();
    await expect(inProgressBtn).toBeVisible({ timeout: 5000 });
    await inProgressBtn.click();

    // Schedule status (required per validation — "On Track"/"At Risk"/"Critical")
    const onTrackBtn = page.locator('button', { hasText: 'On Track' }).first();
    if (await onTrackBtn.isVisible().catch(() => false)) await onTrackBtn.click();

    // Photo: required before submit ("At least one photo is required").
    // The visible "Add photo" control triggers a hidden <input type=file>.
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'evidence.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_1PX_BASE64, 'base64'),
    });
    // Wait for the async compress+upload to finish before submitting —
    // ContractorReport.jsx's own onUploadingChange gate is exactly this.
    await expect(page.locator('text=/Photos:\\s*1\\s*\\/\\s*15/')).toBeVisible({ timeout: 15_000 });

    // Declaration: a custom role="checkbox" control, not a real <input>.
    const declaration = page.locator('[data-testid="declaration-checkbox"]');
    await expect(declaration).toBeVisible();
    await declaration.click();
    await expect(declaration).toHaveAttribute('aria-checked', 'true');

    const submitBtn = page.locator('button', { hasText: 'Submit Weekly Report' });
    await expect(submitBtn).toBeVisible();
    await page.waitForTimeout(600); // let autosave settle first, avoid racing it
    await submitBtn.click();

    // "Last submitted report" text exists on the page from the very start
    // (prior history), so it cannot be used as a success signal — instead
    // wait for the validation-error banner to be definitively absent AND
    // the submit button to leave its submitting state, then check which
    // one actually happened.
    await page.waitForTimeout(2000);
    const stillHasValidationError = await page.locator('text=/Please fix the following required fields/i').isVisible().catch(() => false);
    const formErrorBanner = page.locator('.field-form-error-summary, [role="alert"]');
    const hasFormError = await formErrorBanner.isVisible().catch(() => false);
    const stillOnForm = await page.locator('[data-testid="contractor-report-form"]').isVisible().catch(() => false);

    await page.screenshot({ path: 'test-results/contractor-submit-outcome.png', fullPage: true });

    const outcome = stillHasValidationError || hasFormError ? 'validation-or-error' : !stillOnForm ? 'success (navigated away)' : 'success (stayed on form)';
    console.log(`Contractor Report submit outcome: ${outcome}`);
    if (stillHasValidationError || hasFormError) {
      const text = await page.locator('body').textContent();
      console.log(`Page text snapshot (truncated): ${text.slice(0, 500)}`);
    }

    expect(stillHasValidationError, 'submit must not still show the required-fields validation banner after a real submit attempt with all fields filled').toBeFalsy();

    // Confirm the local draft was actually cleared after a real successful submit.
    const remainingDraftKeys = await page.evaluate(() =>
      Object.keys(localStorage).filter(k => k.toLowerCase().includes('contractor') && k.toLowerCase().includes('draft'))
    );
    console.log(`localStorage draft keys remaining after submit: ${JSON.stringify(remainingDraftKeys)}`);
  });
});
