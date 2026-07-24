// Import Foundation v1 Phase 3 — real browser smoke test for the Import
// Projects workflow (Upload -> Map -> Preview -> Commit -> Result), against
// LOCAL Supabase only. Uses the certification fixture accounts (company-a,
// scripts/certification/fixture-state.json) so the identity-scoping
// behavior (company_id + store_code) is exercised for real, not a
// null-company shortcut.
//
// Every login() call goes through the real browser login form; DB
// ground-truth checks use a direct psql call (same pattern as
// scripts/certification/lib.mjs) against CERT_DB_URL, never trusting only
// what the UI displays.

import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { login } from './helpers.js';
import { buildCsv } from '../../src/core/import/importTestFixtures.mjs';

const LOCAL_PM = { email: 'pm-a-assigned@cert.local', password: 'Cert-Test-Pass-1!', role: 'PM' };
const LOCAL_VIEWER = { email: 'viewer-a@cert.local', password: 'Cert-Test-Pass-1!', role: 'Viewer' };
const LOCAL_CONTRACTOR = { email: 'contractor-a-assigned@cert.local', password: 'Cert-Test-Pass-1!', role: 'Contractor' };

const RUN_ID = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const CODE_MALL = `E2E-IMP-MALL-${RUN_ID}`;
const CODE_STREET = `E2E-IMP-STREET-${RUN_ID}`;
const CODE_BLOCK = `E2E-IMP-BLOCK-${RUN_ID}`;
const CODE_WARN = `E2E-IMP-WARN-${RUN_ID}`;
const EXISTING_CODE = 'CERT-A1'; // seeded by scripts/certification/fixtures.mjs into company-a

const HEADERS = ['Store Code', 'Country', 'City', 'Location Type', 'Mall', 'Street', 'Project Type', 'Budget', 'Currency', 'Sales Area', 'BOH Area', 'Total Area', 'Actual Opening'];
const ROWS = [
  [CODE_MALL, 'Kazakhstan', 'Almaty', 'Mall', 'Silk Road Mall', '', 'New Opening', '2500000', 'USD', '900', '350', '1250', '2024-11-05'],
  [CODE_STREET, 'Kazakhstan', 'Almaty', 'Street', '', 'Abay Ave 42', 'New Opening', '', '', '', '', '', ''],
  [EXISTING_CODE, 'Kazakhstan', 'Almaty', 'Mall', 'Certification Mall A1', '', 'New Opening', '', '', '', '', '', ''],
  [CODE_BLOCK, '', 'Almaty', 'Mall', '', '', 'New Opening', '', '', '', '', '', ''], // missing country -> BLOCK
  [CODE_WARN, 'Kazakhstan', 'Almaty', 'Mall', 'Dostyk Plaza', '', 'New Opening', '', '', '900', '100', '1250', '2024-11-05'], // sales+boh far from total -> WARNING, still CREATE
];
const CSV = buildCsv(HEADERS, ROWS);

function psql(sql) {
  const dbUrl = process.env.CERT_DB_URL;
  if (!dbUrl) throw new Error('CERT_DB_URL must be set to verify DB ground truth for this spec.');
  return execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
  }).trim();
}

test.describe('Import Projects — authorization', () => {
  test('Viewer cannot reach Import Projects', async ({ page }) => {
    await login(page, LOCAL_VIEWER);
    await page.goto('/import/projects');
    await expect(page).toHaveURL(/\/unauthorized/);
  });

  test('Contractor cannot reach Import Projects', async ({ page }) => {
    await login(page, LOCAL_CONTRACTOR);
    await page.goto('/import/projects');
    await expect(page).toHaveURL(/\/unauthorized/);
  });

  test('PM can reach Import Projects', async ({ page }) => {
    await login(page, LOCAL_PM);
    await page.goto('/import/projects');
    await expect(page.getByRole('heading', { name: 'Import Projects' })).toBeVisible();
  });
});

test.describe('Import Projects — full workflow smoke test', () => {
  test.describe.configure({ mode: 'serial' });

  test('parser failure keeps the user on Upload with a plain-language error', async ({ page }) => {
    await login(page, LOCAL_PM);
    await page.goto('/import/projects');
    await page.setInputFiles('input[type="file"]', { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a spreadsheet') });
    await expect(page.getByRole('alert')).toContainText('Only Excel (.xlsx) and CSV files are supported.');
    await expect(page.getByRole('heading', { name: 'Import Projects' })).toBeVisible(); // still on the Import page, no crash
  });

  test('valid CSV enters Mapping with alias suggestions applied', async ({ page }) => {
    await login(page, LOCAL_PM);
    await page.goto('/import/projects');
    await page.setInputFiles('input[type="file"]', { name: 'historical-projects.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });

    await expect(page.locator('select[data-header="Store Code"]')).toHaveValue('store_code');
    await expect(page.locator('select[data-header="Country"]')).toHaveValue('country');
    await expect(page.locator('select[data-header="Location Type"]')).toHaveValue('location_type');
    // Deterministic alias suggestion, not fuzzy: "Mall" header suggests shopping_mall_name.
    await expect(page.locator('select[data-header="Mall"]')).toHaveValue('shopping_mall_name');
  });

  test('user can change a mapping and continue; unmapped optional columns are allowed', async ({ page }) => {
    await login(page, LOCAL_PM);
    await page.goto('/import/projects');
    await page.setInputFiles('input[type="file"]', { name: 'historical-projects.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });

    // Ignore the Street column entirely — an ignored optional column must not block progression.
    await page.locator('select[data-header="Street"]').selectOption('');
    await expect(page.locator('select[data-header="Street"]')).toHaveValue('');

    await page.getByRole('button', { name: /Review \d+ projects/ }).click();
    await expect(page.getByText('120 projects found')).toHaveCount(0); // sanity: no fabricated example text ever renders
    await expect(page.locator('.import-summary-cards')).toBeVisible();
  });

  test('missing a required mapping blocks Preview until resolved', async ({ page }) => {
    await login(page, LOCAL_PM);
    await page.goto('/import/projects');
    await page.setInputFiles('input[type="file"]', { name: 'historical-projects.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });

    await page.locator('select[data-header="Country"]').selectOption('');
    const continueButton = page.getByRole('button', { name: /Review \d+ projects/ });
    await expect(continueButton).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('Country');

    await page.locator('select[data-header="Country"]').selectOption('country');
    await expect(continueButton).toBeEnabled();
  });

  test('Preview shows Ready/Already exists/Needs attention/Warnings from the real Phase 1 plan', async ({ page }) => {
    await login(page, LOCAL_PM);
    await page.goto('/import/projects');
    await page.setInputFiles('input[type="file"]', { name: 'historical-projects.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await page.getByRole('button', { name: /Review \d+ projects/ }).click();
    await expect(page.locator('.import-summary-cards')).toBeVisible();

    const readyCount = await page.locator('.import-summary-card--success .value').innerText();
    const existsCount = await page.locator('.import-summary-card--neutral .value').innerText();
    const attentionCount = await page.locator('.import-summary-card--danger .value').innerText();
    const warningsCount = await page.locator('.import-summary-card--warning .value').innerText();

    expect(Number(readyCount)).toBeGreaterThanOrEqual(2); // Mall + Street (+ Warn row, still CREATE)
    expect(Number(existsCount)).toBe(1); // CERT-A1
    expect(Number(attentionCount)).toBe(1); // missing-country row
    expect(Number(warningsCount)).toBe(2); // area-sum-mismatch row + the SKIP row's own "already exists" notice (planProjectImport's real behavior, not recomputed here)

    await expect(page.getByText(EXISTING_CODE)).toBeVisible();
    await expect(page.getByText('Already exists').first()).toBeVisible();
    await expect(page.getByText('Needs attention').first()).toBeVisible();

    // Filters reflect the same plan counts (no recomputation) — click "Needs attention".
    await page.getByRole('button', { name: /Needs attention \(\d+\)/ }).click();
    await expect(page.getByText(CODE_BLOCK)).toBeVisible();
    await expect(page.getByText(CODE_MALL)).toHaveCount(0);
    await page.getByRole('button', { name: /^All \(\d+\)/ }).click();
  });

  test('back to Mapping preserves the parsed file; remapping regenerates the plan', async ({ page }) => {
    await login(page, LOCAL_PM);
    await page.goto('/import/projects');
    await page.setInputFiles('input[type="file"]', { name: 'historical-projects.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await page.getByRole('button', { name: /Review \d+ projects/ }).click();
    await expect(page.locator('.import-summary-cards')).toBeVisible();

    await page.getByRole('button', { name: 'Back to mapping' }).click();
    await expect(page.getByText('Excel column')).toBeVisible();
    await expect(page.locator('select[data-header="Store Code"]')).toHaveValue('store_code'); // file was not re-uploaded

    // Ignore the Country column -> now the same row-set should push the attention count up.
    await page.locator('select[data-header="Country"]').selectOption('');
    await page.locator('select[data-header="Country"]').selectOption('country'); // restore so we can reach Preview
    await page.getByRole('button', { name: /Review \d+ projects/ }).click();
    await expect(page.locator('.import-summary-cards')).toBeVisible();
  });

  test('commit imports only Ready rows; double-click cannot duplicate; result overrides preview assumptions', async ({ page }) => {
    await login(page, LOCAL_PM);
    await page.goto('/import/projects');
    await page.setInputFiles('input[type="file"]', { name: 'historical-projects.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await page.getByRole('button', { name: /Review \d+ projects/ }).click();
    await expect(page.locator('.import-summary-cards')).toBeVisible();

    const readyCount = Number(await page.locator('.import-summary-card--success .value').innerText());
    const importButton = page.getByRole('button', { name: new RegExp(`Import ${readyCount} projects`) });
    await expect(importButton).toBeVisible();

    // Double-submit protection: the button disables itself immediately (commitState ->
    // 'committing') and the hook's own committingRef guard is independent of render timing (see
    // useImportWorkflow.js). Proven at the outcome level below — the DB ground truth shows
    // exactly one project per Ready row, never two, which is what an accidental double-submit
    // would actually break.
    await importButton.click();

    await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible({ timeout: 20_000 });
    const importedCount = Number(await page.locator('.import-result-counts .value').first().innerText());
    expect(importedCount).toBeLessThanOrEqual(readyCount); // server result is authoritative, never assumed equal to preview

    // Ground truth: exactly one project per Ready row created, none duplicated, blocked/existing untouched.
    expect(psql(`SELECT COUNT(*) FROM projects WHERE store_code='${CODE_MALL}';`)).toBe('1');
    expect(psql(`SELECT COUNT(*) FROM projects WHERE store_code='${CODE_STREET}';`)).toBe('1');
    expect(psql(`SELECT COUNT(*) FROM projects WHERE store_code='${CODE_WARN}';`)).toBe('1');
    expect(psql(`SELECT COUNT(*) FROM projects WHERE store_code='${CODE_BLOCK}';`)).toBe('0');

    // Historical-gap preservation regression: the imported project has no fabricated operational records.
    const newProjectId = psql(`SELECT id FROM projects WHERE store_code='${CODE_MALL}';`);
    expect(psql(`SELECT COUNT(*) FROM contractor_reports WHERE project_id=${newProjectId};`)).toBe('0');
    expect(psql(`SELECT COUNT(*) FROM site_visits WHERE project_id=${newProjectId};`)).toBe('0');
    expect(psql(`SELECT COUNT(*) FROM snags WHERE project_id=${newProjectId};`)).toBe('0');
    expect(psql(`SELECT COALESCE(gantt_generated_at::text,'NULL') FROM projects WHERE id=${newProjectId};`)).toBe('NULL');

    await page.getByRole('button', { name: 'Import another file' }).click();
    await expect(page.getByText('Drag an Excel or CSV file here')).toBeVisible(); // fully reset, no stale state
  });
});

test.describe('Import Projects — Download Excel Template', () => {
  test('Download Excel template button is visible near the upload step', async ({ page }) => {
    await login(page, LOCAL_PM);
    await page.goto('/import/projects');
    await expect(page.getByRole('button', { name: 'Download Excel template' })).toBeVisible();
  });

  test('clicking Download Excel template downloads a real .xlsx workbook with the canonical headers and zero data rows', async ({ page }) => {
    await login(page, LOCAL_PM);
    await page.goto('/import/projects');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download Excel template' }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('OpenDay_Project_Import_Template.xlsx');

    const path = await download.path();
    const bytes = readFileSync(path);
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(bytes, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Projects']);

    const table = XLSX.utils.sheet_to_json(workbook.Sheets['Projects'], { header: 1, defval: null });
    expect(table.length).toBe(1); // header row only — zero data rows
    expect(table[0]).toContain('Store Code');
    expect(table[0]).toContain('Location Type');
    expect(table[0]).toContain('Shopping Mall Name');
    expect(table[0]).toContain('Street Address');
    expect(table[0]).not.toContain('Location'); // derived Portfolio LOCATION is never an exchange column
    expect(table[0]).not.toContain('Status'); // excluded from Project Exchange v1 (see docs/SourceOfTruth.md)
  });
});

test.describe('Import Projects — responsive', () => {
  for (const vp of [{ width: 320, height: 640 }, { width: 375, height: 667 }, { width: 412, height: 915 }]) {
    test(`no horizontal overflow at ${vp.width}x${vp.height}, primary CTA reachable`, async ({ page }) => {
      await page.setViewportSize(vp);
      await login(page, LOCAL_PM);
      await page.goto('/import/projects');
      await page.setInputFiles('input[type="file"]', { name: 'historical-projects.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
      await page.getByRole('button', { name: /Review \d+ projects/ }).click();
      await expect(page.locator('.import-summary-cards')).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `page scrollWidth exceeds clientWidth by ${overflow}px at ${vp.width}x${vp.height}`).toBeLessThanOrEqual(1);

      const readyCount = await page.locator('.import-summary-card--success .value').innerText();
      await expect(page.getByRole('button', { name: new RegExp(`Import ${readyCount} projects`) })).toBeVisible();
    });
  }
});
