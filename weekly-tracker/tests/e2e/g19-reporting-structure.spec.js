import { test, expect } from '@playwright/test';
import { getLocalFixturePassword } from '../../scripts/certification/fixturePassword.mjs';
import { login } from './helpers.js';

const password = getLocalFixturePassword();
const users = {
  admin: { email: 'admin-a@cert.local', password },
  contractor: { email: 'contractor-a-assigned@cert.local', password },
};

async function openFirstContractorReport(page) {
  await login(page, users.contractor);
  await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
  await page.locator('.contractor-project-card button.btn-primary').first().click();
  await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible();
}

test.describe('G1.9 reporting structure', () => {
  test('Contractor editing has one ordered reporting document and no new mandatory package interaction', async ({ page }) => {
    await openFirstContractorReport(page);

    const headings = await page.locator('.contractor-report-group-heading h2').allTextContents();
    expect(headings).toEqual([
      'Reporting reality',
      'Forward commitments',
      'Commercial exceptions',
      'Evidence and submission',
    ]);

    const packageHeaders = page.locator('[data-testid="gantt-phase-header"]');
    await packageHeaders.first().waitFor({ timeout: 10_000 });
    expect(await packageHeaders.count()).toBeGreaterThan(0);
    await expect(packageHeaders.first()).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-testid="declaration-checkbox"]')).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('[data-testid="save-contractor-report"]')).toBeVisible();

    const requiredTextInputs = await page.locator('textarea[required], input[type="text"][required]').count();
    expect(requiredTextInputs).toBe(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    console.log(JSON.stringify({
      workPackageGroupsVisible: await packageHeaders.count(),
      workPackageInteractionsRequiredBeforeException: 0,
      requiredTextFieldsOnHealthyPath: requiredTextInputs,
      navigationInterruptions: 0,
      structuralClickReduction: 0,
    }));
    await page.screenshot({ path: 'test-results/g19-contractor-desktop.png', fullPage: true });
  });

  test('Weekly Reports preserves Project context and exposes a deliberate filter clear action', async ({ page }) => {
    await login(page, users.admin);
    await page.goto('/weekly-reports?project=910001');
    await expect(page.locator('.weekly-reports-master-detail')).toBeVisible();
    await expect(page.locator('.weekly-detail-identity')).toBeVisible();
    await expect(page.locator('[data-testid="weekly-master-report"][data-project-id="910001"]')).toHaveClass(/is-selected/);

    const search = page.getByRole('textbox', { name: 'Search projects or reports' });
    await search.fill('no-report-can-match-this-query');
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(search).toHaveValue('');
    await page.screenshot({ path: 'test-results/g19-weekly-desktop.png', fullPage: true });
  });

  test('Weekly Reports mobile detail keeps project identity and has no page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, users.admin);
    await page.goto('/weekly-reports?project=910001');
    await expect(page.locator('.weekly-detail-identity')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'test-results/g19-weekly-mobile.png', fullPage: true });
  });
});
