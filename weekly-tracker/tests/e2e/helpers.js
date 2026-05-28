/**
 * Shared test helpers and credentials for the Construction PM Portal E2E suite.
 */

export const CREDENTIALS = {
  admin: {
    email: 'admin@construction.com',
    password: 'Admin',
    role: 'Admin',
  },
  pm: {
    email: 'pm@construction.com',
    password: 'Pm',
    role: 'PM',
  },
  contractor: {
    email: 'gc@construction.com',
    password: 'Gc',
    role: 'Contractor',
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
