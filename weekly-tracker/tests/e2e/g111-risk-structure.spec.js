import { test, expect } from '@playwright/test';
import { getLocalFixturePassword } from '../../scripts/certification/fixturePassword.mjs';
import { login } from './helpers.js';

const admin = { email: 'admin-a@cert.local', password: getLocalFixturePassword() };
const projectId = '910001';

async function openProjectRisk(page) {
  await login(page, admin);
  await page.goto(`/risk?project=${projectId}`);
  await expect(page.locator(`.risk-master-row[data-project-id="${projectId}"]`)).toHaveClass(/is-selected/);
  await expect(page.locator('.risk-detail-identity')).toBeVisible();
}

test.describe('G1.11 Risk structural unification', () => {
  test('selected project exposes conclusion, why, impact, evidence, and response boundary without expansion', async ({ page }) => {
    await openProjectRisk(page);

    for (const heading of [
      'Current risk conclusion',
      'Why this state',
      'Operational impact',
      'Evidence provenance',
      'Supporting signals',
      'Response boundary',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }

    await expect(page.locator('.risk-conclusion-copy')).toBeVisible();
    await expect(page.locator('.risk-evidence-ledger')).toContainText('Risk engine output');
    await expect(page.locator('.risk-evidence-ledger')).toContainText('Readiness engine');
    await expect(page.locator('.risk-response-section')).toContainText(/does not create an Action or Snag/i);
    await expect(page.locator('.risk-master-row[aria-current="true"] .master-row-bottom > span').first()).not.toBeEmpty();
    await page.screenshot({ path: 'test-results/g111-risk-desktop.png', fullPage: true });

    const tabs = page.getByRole('tab');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Drivers' })).toHaveAttribute('aria-selected', 'true');
  });

  test('mobile project handoff remains coherent at the four required widths', async ({ page }) => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 412, height: 915 },
    ]) {
      await page.setViewportSize(viewport);
      if (page.url() === 'about:blank') await openProjectRisk(page);
      else await page.goto(`/risk?project=${projectId}`);

      await expect(page.locator('.risk-detail-identity')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Current risk conclusion' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${viewport.width}px viewport overflow`).toBeLessThanOrEqual(1);

      const back = page.getByRole('button', { name: /^back$/i });
      const backBox = await back.boundingBox();
      expect(backBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      await back.click();
      const forecastButtons = page.locator('.risk-forecast-control button');
      for (const button of await forecastButtons.all()) {
        const box = await button.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/risk?project=${projectId}`);
    await expect(page.getByRole('heading', { name: 'Current risk conclusion' })).toBeVisible();
    await page.screenshot({ path: 'test-results/g111-risk-mobile.png', fullPage: true });
  });
});
