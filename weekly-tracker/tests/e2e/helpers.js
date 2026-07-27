/**
 * Shared test helpers and credentials for the Construction PM Portal E2E suite.
 *
 * Credentials are read from env vars (process.env) so they can be set per-environment
 * without touching this file. Fallback values match the default Supabase test accounts.
 * Set E2E_* vars in .env.local or CI secrets to override.
 *
 * All 4 accounts below are created/repaired by `node scripts/seed-test-users.mjs`
 * (run it before any auth-dependent E2E run — it's idempotent, safe to re-run).
 */

/**
 * Deterministic, collision-free "reporting date" values for specs that
 * submit a contractor report to fixture project 910001 as CREDENTIALS
 * .contractor (gc@openday.fit). The database correctly enforces one report
 * per project + contractor + reporting date; three specs independently
 * filling in wall-clock "today" meant whichever ran second legitimately hit
 * that constraint and its confirmation heading never appeared — a real
 * fixture collision, not a performance or timeout issue (see the PHASE 5E.2/
 * 5E.3 investigation). Fixed, far-past, mutually distinct offsets make every
 * affected spec's submission unique regardless of execution order, repeat
 * runs, or which specs happen to run together — add a new distinct offset
 * here for any future spec that submits a contractor report to this same
 * project + contractor combination.
 */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export const CONTRACTOR_REPORT_DATES = {
  FULL_DATA_FLOW: daysAgo(101),
  PERSISTENCE_STRESS: daysAgo(102),
  MULTI_PROJECT_SCENARIO: daysAgo(103),
};

export const CREDENTIALS = {
  admin: {
    email:    process.env.E2E_ADMIN_EMAIL    ?? 'admin@openday.fit',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!',
    role: 'Admin',
  },
  pm: {
    email:    process.env.E2E_PM_EMAIL    ?? 'pm@openday.fit',
    password: process.env.E2E_PM_PASSWORD ?? 'Pm123!',
    role: 'PM',
  },
  contractor: {
    email:    process.env.E2E_CONTRACTOR_EMAIL    ?? 'gc@openday.fit',
    password: process.env.E2E_CONTRACTOR_PASSWORD ?? 'Gc123!',
    role: 'Contractor',
  },
  viewer: {
    email:    process.env.E2E_VIEWER_EMAIL    ?? 'viewer@construction.com',
    password: process.env.E2E_VIEWER_PASSWORD ?? 'Viewer',
    role: 'Viewer',
  },
};

/**
 * Log in via the login form and wait for navigation to complete.
 * @param {import('@playwright/test').Page} page
 * @param {{ email: string, password: string }} creds
 */
export async function login(page, creds) {
  await page.goto('/login');
  await page.locator('#email').fill(creds.email);
  await page.locator('#password').fill(creds.password);
  await page.locator('button[type="submit"]').click();
  // Wait until we leave the login page
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 });
}

/**
 * Log out via the "Sign out" button and wait for the login form to reappear.
 *
 * NOTE: field-mode pages (contractor report form, its success screen, PM site
 * visit form) intentionally have no nav bar / Sign out button by design — do
 * not call logout() directly from one of those; navigate to `/` first.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function logout(page) {
  const { expect } = await import('@playwright/test');
  // Press Escape first to dismiss any open drawer/modal that could otherwise
  // intercept the Sign out button's click.
  await page.keyboard.press('Escape');
  const signOutBtn = page.getByRole('button', { name: /sign out/i }).first();
  await expect(signOutBtn).toBeVisible({ timeout: 10_000 });
  await signOutBtn.click();
  // Wait for the login form itself rather than just the URL — more robust
  // than a bare waitForURL against slow client-side routing under load.
  await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });
}
