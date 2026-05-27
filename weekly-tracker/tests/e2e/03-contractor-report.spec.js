import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

test.describe('Contractor report flow', () => {
  test('contractor lands on /contractor-select and can navigate to a project', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/);

    // If no projects are assigned, just verify the page loads
    const hasProjects = await page.locator('.contractor-project-card').count() > 0;
    if (!hasProjects) {
      await expect(page.locator('.contractor-no-projects')).toBeVisible();
      await logout(page);
      return;
    }

    // Navigate to first project's report
    await page.locator('.contractor-project-card button.btn-primary').first().click();
    await expect(page).toHaveURL(/\/contractor-report\//);

    // Form should be visible
    await expect(page.locator('button', { hasText: 'Submit Weekly Report' })).toBeVisible();

    await logout(page);
  });

  test('admin can open contractor report for any project', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/contractor-select');

    const cards = page.locator('.contractor-project-card');
    const count = await cards.count();
    test.skip(count === 0, 'No projects available for this test');

    await cards.first().locator('button.btn-primary').click();
    await expect(page).toHaveURL(/\/contractor-report\//);

    // Reporting date field visible
    await expect(page.locator('input[type="date"]').first()).toBeVisible();

    // Work packages grid visible
    await expect(page.locator('text=Active Work Packages')).toBeVisible();

    await page.goto('/');
    await logout(page);
  });

  test('contractor report form: select work package, set schedule status, confirm declaration', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/contractor-select');

    const count = await page.locator('.contractor-project-card').count();
    test.skip(count === 0, 'No projects available');

    await page.locator('.contractor-project-card button.btn-primary').first().click();
    await expect(page).toHaveURL(/\/contractor-report\//);

    // Set reporting date to today
    const today = new Date().toISOString().split('T')[0];
    await page.locator('input[type="date"]').first().fill(today);

    // Toggle first work package
    const wpBtn = page.locator('button[type="button"]').filter({ hasText: /Demolition|Construction|Finishes/ }).first();
    await wpBtn.click();

    // Set schedule status to "On Track"
    const onTrackBtn = page.locator('button[type="button"]', { hasText: 'On Track' }).first();
    if (await onTrackBtn.isVisible()) {
      await onTrackBtn.click();
    }

    // Confirm declaration
    const declarationBox = page.locator('div').filter({ has: page.locator('text=I confirm that the reported information') }).locator('div').first();
    if (await declarationBox.isVisible()) {
      await declarationBox.click();
    }

    // Submit button should be present
    await expect(page.locator('button', { hasText: 'Submit Weekly Report' })).toBeVisible();

    await page.goto('/');
    await logout(page);
  });
});
