// Staging cloud E2E — Step 6a: Contractor Report full submit path against
// the deployed staging frontend + staging Supabase, using real fixture
// users from scripts/staging/fixtures.mjs.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'scripts', 'staging', 'staging-fixture-state.json'), 'utf8'));
const CONTRACTOR = { email: state.users.contractorAAssigned.email, password: state.password };

const BYPASS_SECRET = process.env.STAGING_VERCEL_AUTOMATION_BYPASS_SECRET;
const PNG_1PX_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test.use({
  extraHTTPHeaders: {
    'x-vercel-protection-bypass': BYPASS_SECRET,
    'x-vercel-set-bypass-cookie': 'true',
  },
});

test.describe('Staging cloud E2E — Contractor Report', () => {
  test('login, open project, fill required fields, upload photo, submit, confirm success', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(CONTRACTOR.email);
    await page.locator('#password').fill(CONTRACTOR.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 });

    await expect(page).toHaveURL(/\/contractor-select/);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    const hasProjects = await page.locator('.contractor-project-card').count() > 0;
    expect(hasProjects, 'staging fixture contractor must have an assigned project').toBeTruthy();

    await page.locator('.contractor-project-card button.btn-primary').first().click();
    await expect(page).toHaveURL(/\/contractor-report\//);
    await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible({ timeout: 15_000 });

    const uniqueDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * (100 + Math.floor(Math.random() * 500)));
    await page.locator('input[type="date"]').first().fill(uniqueDate.toISOString().split('T')[0]);

    const phaseHeader = page.locator('[data-testid="gantt-phase-header"]').first();
    await expect(phaseHeader, 'staging fixture project must have scoped Gantt WPs').toBeVisible({ timeout: 10_000 });
    await phaseHeader.click();
    const inProgressBtn = page.locator('button', { hasText: 'In Progress' }).first();
    await expect(inProgressBtn).toBeVisible({ timeout: 5000 });
    await inProgressBtn.click();

    const onTrackBtn = page.locator('button', { hasText: 'On Track' }).first();
    if (await onTrackBtn.isVisible().catch(() => false)) await onTrackBtn.click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1PX_BASE64, 'base64') });
    await expect(page.locator('text=/Photos:\\s*1\\s*\\/\\s*15/')).toBeVisible({ timeout: 20_000 });

    const declaration = page.locator('[data-testid="declaration-checkbox"]');
    await expect(declaration).toBeVisible();
    await declaration.click();
    await expect(declaration).toHaveAttribute('aria-checked', 'true');

    await page.waitForTimeout(600);
    await page.locator('button', { hasText: 'Submit Weekly Report' }).click();

    await page.waitForTimeout(2500);
    const stillHasValidationError = await page.locator('text=/Please fix the following required fields/i').isVisible().catch(() => false);
    await page.screenshot({ path: 'test-results/staging-contractor-submit.png', fullPage: true });
    expect(stillHasValidationError, 'submit must not still show the validation banner with all required fields filled').toBeFalsy();

    const successVisible = await page.locator('text=/Report submitted/i').isVisible({ timeout: 10_000 }).catch(() => false);
    console.log(`Staging Contractor Report submit — success screen visible: ${successVisible}`);
    expect(successVisible, 'expected the real "Report submitted" success screen').toBeTruthy();
  });
});
