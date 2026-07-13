import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

test.describe('guarded local authentication smoke', () => {
  test('all fixture roles authenticate and no request leaves loopback', async ({ page }) => {
    const remoteRequests = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) {
        remoteRequests.push(request.url());
      }
    });

    for (const credentials of Object.values(CREDENTIALS)) {
      await login(page, credentials);
      await page.goto('/');
      await logout(page);
    }

    await page.goto('/login');
    await page.locator('#email').fill(CREDENTIALS.admin.email);
    await page.locator('#password').fill('invalid-local-fixture-password');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(remoteRequests).toEqual([]);
  });
});
