import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

const fixture = JSON.parse(readFileSync(new URL('../../scripts/certification/fixture-state.json', import.meta.url), 'utf8'));
const projectId = fixture.projects.PROJECT_A;
const screenshots = join(process.cwd(), 'artifacts', 'g1.12');

test('G1.12 Snag desktop and field-mobile visual contract', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(screenshots, { recursive: true });
  await login(page, { email: fixture.users.pmAAssigned.email, password: fixture.password });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${projectId}/snags`);
  const firstRow = page.getByTestId('site-snag-master-row').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  await expect(page).toHaveURL(/\/projects\/\d+\/snags\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel('Selected item workspace')).toBeVisible();
  await expect(page.getByLabel('Observation operational summary')).toBeVisible();
  const desktopGeometry = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
    const sidebar = rect('.sidebar');
    const master = rect('.master-pane');
    const detail = rect('.detail-pane');
    return {
      sidebarWidth: sidebar?.width,
      masterWidth: master?.width,
      masterDetailGap: detail && master ? detail.left - master.right : null,
      alignmentDelta: detail && master ? detail.top - master.top : null,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(Math.abs(desktopGeometry.sidebarWidth - 224)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(desktopGeometry.masterWidth - 336)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(desktopGeometry.masterDetailGap - 8)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(desktopGeometry.alignmentDelta)).toBeLessThanOrEqual(1);
  expect(desktopGeometry.overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: join(screenshots, 'desktop-master-detail.png'), fullPage: true });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/field-snag/${projectId}?tab=list`);
    await expect(page.locator('.snag-field-shell')).toBeVisible();
    const mobile = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      tabTargets: [...document.querySelectorAll('.snag-field-tab')].map(node => node.getBoundingClientRect().height),
      filterTarget: document.querySelector('.snag-field-filter-trigger')?.getBoundingClientRect().height,
    }));
    expect(mobile.overflow).toBeLessThanOrEqual(0);
    expect(mobile.tabTargets.every(height => height >= 44)).toBeTruthy();
    expect(mobile.filterTarget).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: join(screenshots, `mobile-list-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const activeCard = page.locator('.snag-field-card').filter({ hasText: 'In progress' }).first();
  await (await activeCard.count() ? activeCard : page.locator('.snag-field-card').first()).click();
  await expect(page.getByLabel('Observation operational summary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: join(screenshots, 'mobile-published-detail-390x844.png'), fullPage: true });
});
