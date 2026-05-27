import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

/**
 * Visual / Content Regression tests.
 * Checks that calculated fields display clean values (no NaN, undefined, null, [object Object])
 * and that removed UI elements (e.g. "Delayed" status button) are gone.
 */

const BANNED_PATTERNS = [
  'NaN%',
  'NaN',
  '[object Object]',
  'undefined',
  'null%',
  /\bnull\b/,   // literal null as display text
];

async function assertNoCorruptedText(page, context) {
  const bodyText = await page.locator('body').innerText();
  for (const pattern of BANNED_PATTERNS) {
    if (typeof pattern === 'string') {
      if (bodyText.includes(pattern)) {
        throw new Error(`Found "${pattern}" in page body on ${context}`);
      }
    } else {
      if (pattern.test(bodyText)) {
        throw new Error(`Pattern ${pattern} matched page body on ${context}`);
      }
    }
  }
}

test.describe('Visual / Content regression', () => {
  test('Dashboard shows no NaN or undefined values', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await assertNoCorruptedText(page, 'Dashboard');
    await logout(page);
  });

  test('Projects page shows no NaN or undefined values', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await assertNoCorruptedText(page, 'Projects');
    await logout(page);
  });

  test('Weekly Reports page shows no NaN% in progress values', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/weekly-reports');
    await page.waitForLoadState('networkidle');

    const projectSelect = page.locator('[data-testid="project-select"]');
    if (await projectSelect.count() > 0) {
      const options = await projectSelect.locator('option').count();
      if (options > 1) {
        await projectSelect.selectOption({ index: 1 });
        await page.waitForLoadState('networkidle');
      }
    }

    await assertNoCorruptedText(page, 'Weekly Reports');
    await logout(page);
  });

  test('Risk Dashboard shows no NaN or undefined values', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/risk');
    await page.waitForLoadState('networkidle');
    await assertNoCorruptedText(page, 'Risk Dashboard');
    await logout(page);
  });

  test('Contractor Report form does not contain "Delayed" status button', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/contractor-select');
    await page.waitForLoadState('networkidle');

    const projectCards = page.locator('.contractor-project-card');
    const cardCount = await projectCards.count();
    test.skip(cardCount === 0, 'No projects to open contractor report');

    await projectCards.first().locator('button.btn-primary').click();
    await expect(page).toHaveURL(/\/contractor-report\//);
    await page.waitForLoadState('networkidle');

    // Open a WP to reveal task rows and status buttons
    const wpToggle = page.locator('[data-testid="wp-toggle"]').first();
    if (await wpToggle.count() > 0) {
      await wpToggle.click();
      await page.waitForTimeout(300);
    }

    // "Delayed" must not appear as an active status button option
    const delayedBtn = page.locator('[data-testid="status-btn-Delayed"]');
    await expect(delayedBtn).toHaveCount(0);

    await logout(page);
  });

  test('KPI cards on Dashboard display numeric values only', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const kpiCards = page.locator('[data-testid="kpi-card"]');
    const count = await kpiCards.count();
    test.skip(count === 0, 'No KPI cards on dashboard');

    for (let i = 0; i < count; i++) {
      const card = kpiCards.nth(i);
      const text = await card.innerText();
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('[object Object]');
      expect(text).not.toContain('undefined');
    }

    await logout(page);
  });

  test('Risk KPI boxes on Risk Dashboard show valid counts', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/risk');
    await page.waitForLoadState('networkidle');

    for (const level of ['critical', 'high', 'medium', 'low']) {
      const box = page.locator(`[data-testid="risk-kpi-${level}"]`);
      if (await box.count() === 0) continue;

      const text = await box.innerText();
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('undefined');
      // The count should be a non-negative integer or percentage
    }

    await logout(page);
  });

  test('contractor-select page shows no broken project data', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
    await page.waitForLoadState('networkidle');
    await assertNoCorruptedText(page, 'Contractor Select');
    await logout(page);
  });

  test('PM Site Visit form shows no NaN or undefined values', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount === 0, 'No projects for site visit visual check');

    await page.locator('table tbody tr').first().locator('button').first().click();
    const modal = page.locator('.modal');
    if (await modal.count() === 0) {
      test.skip(true, 'No project modal opened');
    }
    await expect(modal).toBeVisible();

    const siteVisitBtn = modal.locator('button', { hasText: /site visit/i });
    if (await siteVisitBtn.count() === 0) {
      test.skip(true, 'No Site Visit button in modal');
    }

    const [svPage] = await Promise.all([
      page.context().waitForEvent('page'),
      siteVisitBtn.click(),
    ]);
    await svPage.waitForLoadState('networkidle');

    const svText = await svPage.locator('body').innerText();
    expect(svText).not.toContain('NaN');
    expect(svText).not.toContain('[object Object]');
    expect(svText).not.toContain('undefined');

    await svPage.close();
    await logout(page);
  });
});
