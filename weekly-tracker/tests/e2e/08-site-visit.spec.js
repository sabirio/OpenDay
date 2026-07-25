import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

test.describe('Site Visit report', () => {
  test('PM can navigate to site visit for a project', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');

    const count = await page.locator('.portfolio-row').count();
    test.skip(count === 0, 'No projects available');

    // Select the first project — opens its details pane to get the site visit link
    const firstRow = page.locator('.portfolio-row').first();

    await firstRow.click();
    await expect(page.locator('.portfolio-details-pane')).toBeVisible();

    const siteVisitBtn = page.locator('.portfolio-details-header button', { hasText: 'Site Visit' });
    await expect(siteVisitBtn).toBeVisible();

    // Open in same tab — button uses window.open, so intercept navigation
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      siteVisitBtn.click(),
    ]);

    await newPage.waitForLoadState('networkidle');
    await expect(newPage).toHaveURL(/\/site-visit\//);
    await expect(newPage.locator('h1, h2').first()).toBeVisible();

    await newPage.close();
    await logout(page);
  });

  test('site visit page renders work package form sections', async ({ page }) => {
    await login(page, CREDENTIALS.admin);

    // Navigate directly if we can find a project ID
    await page.goto('/projects');
    const count = await page.locator('.portfolio-row').count();
    test.skip(count === 0, 'No projects to test site visit');

    await page.locator('.portfolio-row').first().click();
    await expect(page.locator('.portfolio-details-pane')).toBeVisible();

    const siteVisitBtn = page.locator('.portfolio-details-header button', { hasText: 'Site Visit' });
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      siteVisitBtn.click(),
    ]);

    await newPage.waitForLoadState('networkidle');

    // Verify the form has content
    const hasForm = await newPage.locator('button, select, input').count() > 0;
    expect(hasForm).toBeTruthy();

    await newPage.close();
    await logout(page);
  });
});
