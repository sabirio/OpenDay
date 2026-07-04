/**
 * Shared test helpers and credentials for the Construction PM Portal E2E suite.
 *
 * Credentials are read from env vars (process.env) so they can be set per-environment
 * without touching this file. Fallback values match the default Supabase test accounts.
 * Set E2E_* vars in .env.local or CI secrets to override.
 */

export const CREDENTIALS = {
  admin: {
    email:    process.env.E2E_ADMIN_EMAIL    ?? 'admin@openday.fit',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin',
    role: 'Admin',
  },
  pm: {
    email:    process.env.E2E_PM_EMAIL    ?? 'pm@openday.fit',
    password: process.env.E2E_PM_PASSWORD ?? 'Pm',
    role: 'PM',
  },
  contractor: {
    email:    process.env.E2E_CONTRACTOR_EMAIL    ?? 'gc@openday.fit',
    password: process.env.E2E_CONTRACTOR_PASSWORD ?? 'Gc',
    role: 'Contractor',
  },
  // viewer: requires a viewer@construction.com user in Supabase Auth with role='viewer'.
  // Create it manually in the Dashboard before running viewer-scoped tests.
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
 * Log out via the "Sign out" button and wait for redirect to /login.
 * @param {import('@playwright/test').Page} page
 */
export async function logout(page) {
  // Press Escape first to dismiss any open drawer/modal, then force-click the
  // Sign out button (overlay from open drawer can intercept pointer events)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /sign out/i }).first().click({ force: true });
  await page.waitForURL('**/login', { timeout: 15_000 });
}
