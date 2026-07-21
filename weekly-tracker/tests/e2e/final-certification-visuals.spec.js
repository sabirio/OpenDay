import { test, expect } from '@playwright/test';
import { CREDENTIALS, login } from './helpers.js';

async function certifyScreen(page, path, screenshotName) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });

  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow, `${path} has ${overflow}px horizontal overflow`).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `test-results/final-certification/${screenshotName}.png`, fullPage: true });
}

const desktopScreens = [
  { name: 'admin-dashboard-1366x768', viewport: { width: 1366, height: 768 }, role: 'admin', path: '/' },
  { name: 'admin-users-1440x900', viewport: { width: 1440, height: 900 }, role: 'admin', path: '/admin/users' },
  { name: 'viewer-dashboard-1920x1080', viewport: { width: 1920, height: 1080 }, role: 'viewer', path: '/' },
];

for (const screen of desktopScreens) {
  test.describe(`${screen.name} visual certification`, () => {
    test.use({ viewport: screen.viewport });

    test('renders authenticated content without horizontal overflow', async ({ page }) => {
      await login(page, CREDENTIALS[screen.role]);
      await certifyScreen(page, screen.path, screen.name);
    });
  });
}

test.describe('PM Snag List 375x812 visual certification', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('keeps the field workflow usable without horizontal overflow', async ({ page }) => {
    await login(page, CREDENTIALS.pm);
    await certifyScreen(page, '/snags', 'pm-snags-375x812');
  });
});
