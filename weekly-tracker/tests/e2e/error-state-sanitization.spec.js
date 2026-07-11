// Sprint 5 — Phase 3: the global data-load error screen (App.jsx's
// GlobalErrorScreen) must never show a raw Supabase/Postgres error message
// to the user. Verified live by forcing the projects fetch to fail via
// request interception (no direct Supabase client in this file — routes
// through the same local dev server as the other mobile-workflow specs).

import { test, expect } from '@playwright/test';

test.describe('Global data-load error screen — no raw backend error text', () => {
  test('a failed projects fetch shows a friendly message, not the raw Postgres/Supabase error', async ({ page }) => {
    // Force every REST call to the local Supabase project's `projects`
    // resource to fail with a realistic Postgres-shaped error body, the
    // same shape a real RLS/connection failure would return.
    await page.route('**/rest/v1/projects*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'relation "public.projects" does not exist', code: '42P01' }),
      })
    );

    await page.goto('/login');
    await page.locator('#email').fill('admin-a@cert.local');
    await page.locator('#password').fill('Cert-Test-Pass-1!');
    await page.locator('button[type="submit"]').click();

    const errorScreen = page.locator('[role="alert"]').filter({ hasText: 'Failed to load data' });
    await expect(errorScreen).toBeVisible({ timeout: 15_000 });

    const bodyText = await errorScreen.textContent();
    expect(bodyText, 'error screen must not leak the raw Postgres error code/relation name').not.toContain('42P01');
    expect(bodyText, 'error screen must not leak the raw Postgres error message').not.toContain('relation "public.projects" does not exist');
    expect(bodyText).toContain('Could not connect to the database');

    // Retry button present (read retry — safe to re-attempt).
    await expect(page.locator('button', { hasText: 'Retry' })).toBeVisible();
  });
});
