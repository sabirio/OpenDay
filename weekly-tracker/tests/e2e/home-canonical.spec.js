import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { getLocalFixturePassword } from '../../scripts/certification/fixturePassword.mjs';
import { login, logout } from './helpers.js';

const SCREENSHOTS = 'artifacts/g1.7-home';
const LOCAL_PASSWORD = getLocalFixturePassword();
const CREDENTIALS = {
  admin: { email: 'admin-a@cert.local', password: LOCAL_PASSWORD },
  pm: { email: 'pm-a-assigned@cert.local', password: LOCAL_PASSWORD },
  viewer: { email: 'viewer-a@cert.local', password: LOCAL_PASSWORD },
  contractor: { email: 'contractor-a-assigned@cert.local', password: LOCAL_PASSWORD },
};

test.describe('G1.7 Home canonical operational briefing', () => {
  test.beforeAll(() => mkdirSync(SCREENSHOTS, { recursive: true }));

  test('Admin desktop renders the canonical briefing and preserves actions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, CREDENTIALS.admin);

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await expect(page.locator('.ds-attention-surface')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Operational snapshot' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Recent activity' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Continue work' })).toBeVisible();
    await expect(page.locator('.dashboard-summary-card')).toHaveCount(0);

    const geometry = await page.evaluate(() => {
      const box = selector => document.querySelector(selector)?.getBoundingClientRect();
      const sidebar = box('.sidebar');
      const main = box('.main-content');
      const home = box('.home-page');
      const header = box('.page-header');
      const attentionSurface = box('.ds-attention-surface');
      const attentionRegion = box('.home-attention-region');
      const snapshot = box('.home-snapshot');
      const activity = box('.home-recent-activity');
      const continueWork = box('.home-continue-work');
      return {
        sidebarWidth: sidebar?.width,
        mainX: main?.x,
        homeX: home?.x,
        homeWidth: home?.width,
        pageHeaderHeight: header?.height,
        attentionHeight: attentionSurface?.height,
        attentionRegionHeight: attentionRegion?.height,
        sectionGap: snapshot?.top - attentionRegion?.bottom,
        contentBottom: Math.max(activity?.bottom || 0, continueWork?.bottom || 0),
        viewportHeight: window.innerHeight,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geometry.sidebarWidth).toBe(224);
    expect(geometry.mainX).toBe(224);
    expect(geometry.homeX).toBe(256);
    expect(geometry.homeWidth).toBe(1120);
    expect(geometry.sectionGap).toBe(16);
    expect(geometry.overflowX).toBe(0);
    console.log(`HOME_DESKTOP_GEOMETRY ${JSON.stringify(geometry)}`);

    const shortcuts = page.locator('.home-quick-links a');
    await expect(shortcuts).toHaveCount(4);
    await expect(shortcuts).toContainText([
      'Project Dashboard',
      'Weekly Reports',
      'Risk Dashboard',
      'Site Visit',
    ]);

    const firstPriority = page.locator('.home-priority-link').first();
    if (await firstPriority.count()) {
      await firstPriority.click();
      await expect(page).toHaveURL(/\/?project=/);
      await page.goBack();
      await expect(page).toHaveURL(/\/home$/);
    }

    await page.screenshot({ path: `${SCREENSHOTS}/home-admin-desktop.png`, fullPage: true });
    await logout(page);
  });

  test('Admin mobile preserves action-first order and 44px shortcuts', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, CREDENTIALS.admin);
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible({ timeout: 20_000 });

    const order = await page.evaluate(() => {
      const top = selector => document.querySelector(selector)?.getBoundingClientRect().top;
      return {
        attention: top('.home-attention-region'),
        continueWork: top('.home-continue-work'),
        snapshot: top('.home-snapshot'),
        activity: top('.home-recent-activity'),
      };
    });
    expect(order.attention).toBeLessThan(order.continueWork);
    expect(order.continueWork).toBeLessThan(order.snapshot);
    expect(order.snapshot).toBeLessThan(order.activity);

    const shortcutHeights = await page.locator('.home-quick-links a').evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().height));
    expect(shortcutHeights).toHaveLength(4);
    expect(shortcutHeights.every(height => height >= 44)).toBe(true);
    await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');

    const mobileGeometry = await page.evaluate(() => {
      const box = selector => document.querySelector(selector)?.getBoundingClientRect();
      const header = box('.page-header');
      const attentionSurface = box('.ds-attention-surface');
      const attentionRegion = box('.home-attention-region');
      const continueWork = box('.home-continue-work');
      const snapshot = box('.home-snapshot');
      const activity = box('.home-recent-activity');
      return {
        contentStart: box('.home-page')?.left,
        pageHeaderHeight: header?.height,
        attentionHeight: attentionSurface?.height,
        attentionRegionHeight: attentionRegion?.height,
        attentionToContinueGap: continueWork?.top - attentionRegion?.bottom,
        continueToSnapshotGap: snapshot?.top - continueWork?.bottom,
        snapshotToActivityGap: activity?.top - snapshot?.bottom,
        contentBottom: activity?.bottom,
        viewportHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(mobileGeometry.overflowX).toBe(0);
    console.log(`HOME_MOBILE_GEOMETRY ${JSON.stringify(mobileGeometry)}`);

    await page.screenshot({ path: `${SCREENSHOTS}/home-admin-mobile.png`, fullPage: true });
  });

  test('PM and Viewer shortcuts follow the canonical permission source', async ({ page }) => {
    await login(page, CREDENTIALS.pm);
    await expect(page.locator('.home-quick-links a')).toHaveCount(4);
    await expect(page.getByRole('link', { name: /Site Visit — record PM evidence/ })).toBeVisible();
    await logout(page);

    await login(page, CREDENTIALS.viewer);
    await expect(page.locator('.home-quick-links a')).toHaveCount(1);
    await expect(page.getByRole('link', { name: /Project Dashboard — inspect project attention/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Weekly Reports —/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Risk Dashboard —/ })).toHaveCount(0);
    await logout(page);
  });

  test('Contractor remains outside the Home permission boundary', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await expect(page).toHaveURL(/\/contractor-select/);
    await expect(page.locator('.home-page')).toHaveCount(0);
  });
});
