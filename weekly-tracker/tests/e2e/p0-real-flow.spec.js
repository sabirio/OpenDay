import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { CREDENTIALS, login, logout } from './helpers.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL and E2E_SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY. Configure .env.local or CI secrets before running real E2E.');
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STORE_CODE = `P0E2E-${RUN_ID}`;
const MALL_NAME = `P0 E2E Mall ${RUN_ID}`;

let adminDb;
let contractorDb;
let projectId;
let contractorReportId;
let photoPaths = [];

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signInAs(creds) {
  const client = makeClient();
  const { error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) throw new Error(`E2E sign-in failed for ${creds.email}: ${error.message}`);
  return client;
}

async function getCurrentUserId(client) {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user?.id;
}

async function cleanup() {
  if (!adminDb) {
    adminDb = await signInAs(CREDENTIALS.admin).catch(() => null);
  }
  if (!adminDb) return;

  const ids = new Set();
  if (projectId) ids.add(projectId);

  const { data: staleProjects } = await adminDb
    .from('projects')
    .select('id')
    .or(`store_code.eq.${STORE_CODE},shopping_mall_name.eq.${MALL_NAME}`);
  for (const row of staleProjects || []) ids.add(row.id);

  for (const id of ids) {
    const { data: reports } = await adminDb
      .from('contractor_reports')
      .select('id, photo_urls')
      .eq('project_id', id);
    for (const report of reports || []) {
      photoPaths.push(...(report.photo_urls || []));
    }

    await adminDb.from('site_visit_discrepancies').delete().eq('project_id', id);
    await adminDb.from('site_visit_wps').delete().eq('project_id', id);
    await adminDb.from('site_visits').delete().eq('project_id', id);
    await adminDb.from('contractor_report_wps').delete().eq('project_id', id);
    await adminDb.from('progress_history').delete().eq('project_id', id);
    await adminDb.from('contractor_reports').delete().eq('project_id', id);
    await adminDb.from('reports').delete().eq('project_id', id);
    await adminDb.from('project_gantt_tasks').delete().eq('project_id', id);
    await adminDb.from('projects').delete().eq('id', id);
  }

  const uniquePhotoPaths = [...new Set(photoPaths.filter(Boolean))];
  if (uniquePhotoPaths.length > 0) {
    await adminDb.storage.from('site-photos').remove(uniquePhotoPaths).catch(() => {});
  }
}

async function createProjectViaUi(page) {
  await login(page, CREDENTIALS.admin);
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  await page.locator('button', { hasText: /add new project|add project|new project|\+ project/i }).first().click();
  const modal = page.locator('.modal, [role="dialog"]').first();
  await expect(modal).toBeVisible({ timeout: 10_000 });

  await modal.locator('input[name="storeCode"]').fill(STORE_CODE);
  await modal.locator('input[name="shoppingMallName"]').fill(MALL_NAME);
  await modal.locator('input[name="city"]').fill('E2E City');
  await modal.locator('input[name="country"]').fill('E2E Country');
  await modal.locator('input[name="constructionStartDate"]').fill('2026-07-01');
  await modal.locator('input[name="constructionEndDate"]').fill('2026-09-30');
  await modal.locator('input[name="targetOpeningDate"]').fill('2026-10-15');
  await modal.locator('input[name="projectManager"]').fill('E2E PM');
  await modal.locator('input[name="generalContractor"]').fill('E2E Contractor Ltd');

  await modal.locator('button', { hasText: /create project|save/i }).last().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(STORE_CODE).first()).toBeVisible({ timeout: 20_000 });

  const { data, error } = await adminDb
    .from('projects')
    .select('id, contractor_email')
    .eq('store_code', STORE_CODE)
    .single();
  if (error) throw error;
  projectId = data.id;
}

async function linkContractor() {
  const { error: updateProjectError } = await adminDb
    .from('projects')
    .update({ contractor_email: CREDENTIALS.contractor.email })
    .eq('id', projectId);
  if (updateProjectError) throw updateProjectError;

  const { data: contractorProfile, error: profileError } = await adminDb
    .from('profiles')
    .select('id, assigned_projects')
    .eq('email', CREDENTIALS.contractor.email)
    .single();
  if (profileError) throw profileError;

  const assigned = new Set(contractorProfile.assigned_projects || []);
  assigned.add(projectId);
  const { error: assignError } = await adminDb
    .from('profiles')
    .update({ assigned_projects: [...assigned] })
    .eq('id', contractorProfile.id);
  if (assignError) throw assignError;
}

async function submitContractorReport(page) {
  await login(page, CREDENTIALS.contractor);
  await expect(page).toHaveURL(/\/contractor-select/, { timeout: 20_000 });
  await page.waitForLoadState('networkidle');

  const card = page.locator('.contractor-project-card', { hasText: STORE_CODE }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.locator('button.btn-primary').click();
  await expect(page).toHaveURL(new RegExp(`/contractor-report/${projectId}`));
  await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible({ timeout: 20_000 });

  await page.locator('[data-testid="reporting-date"]').fill('2026-07-06');

  const wpToggle = page.locator('[data-testid="wp-toggle"]').first();
  if (await wpToggle.count()) {
    const borderColor = await wpToggle.evaluate((el) => getComputedStyle(el).borderColor);
    const active = borderColor.includes('249, 115, 22');
    if (!active) await wpToggle.click();
  }

  await page.locator('[data-testid="toggle-schedule-status-On Track"]').click();
  await page.locator('[data-testid="toggle-support-required-No"]').click();
  await page.locator('[data-testid="toggle-activities-blocked-No"]').click();

  const textareas = page.locator('[data-testid="contractor-report-form"] textarea');
  await textareas.nth(0).fill('1) E2E progress verification\n2) E2E site works\n3) E2E coordination');
  await textareas.nth(1).fill('1) E2E next works\n2) E2E procurement\n3) E2E QA');
  await textareas.nth(2).fill('No blockers for P0 E2E.');
  await textareas.nth(3).fill(`P0 E2E contractor report ${RUN_ID}`);

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'p0-e2e.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await expect(page.getByText(/1 photo attached|Photos: 1 \/ 15/)).toBeVisible({ timeout: 20_000 });

  await page.locator('[data-testid="declaration-checkbox"]').click();
  await page.locator('[data-testid="save-contractor-report"]').click();
  await expect(page.getByText('Report submitted')).toBeVisible({ timeout: 30_000 });
  await page.goto('/');
  await logout(page);
}

async function assertContractorData() {
  const contractorUserId = await getCurrentUserId(contractorDb);
  const { data: reports, error } = await adminDb
    .from('contractor_reports')
    .select('id, submitted_by, photo_urls')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  expect(reports.length).toBe(1);
  expect(reports[0].submitted_by).toBe(contractorUserId);
  expect(reports[0].submitted_by).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  expect(reports[0].photo_urls?.length).toBeGreaterThan(0);
  contractorReportId = reports[0].id;
  photoPaths.push(...reports[0].photo_urls);

  const { data: legacyRows, error: legacyError } = await adminDb
    .from('reports')
    .select('id')
    .eq('project_id', projectId);
  if (legacyError) throw legacyError;
  expect(legacyRows).toHaveLength(0);

  const { data: historyRows, error: historyError } = await adminDb
    .from('progress_history')
    .select('snapshot')
    .eq('project_id', projectId);
  if (historyError) throw historyError;
  expect(historyRows.some((row) => row.snapshot?.contractor_report_id === contractorReportId)).toBe(true);
}

async function submitPmSiteVisit(page) {
  await login(page, CREDENTIALS.pm);
  await page.goto(`/site-visit/${projectId}`);
  await expect(page.locator('[data-testid="pm-site-visit-form"]')).toBeVisible({ timeout: 20_000 });

  await page.locator('input[type="date"]').first().fill('2026-07-07');
  const compareSelect = page.locator('select').first();
  if (await compareSelect.count()) {
    await compareSelect.selectOption(String(contractorReportId));
  }

  await page.locator('[data-testid="pm-schedule-btn-On Track"]').click();
  const pmTask = page.locator('[data-testid^="pm-status-"], [data-testid^="pm-progress-"]').first();
  if (await pmTask.count()) {
    await pmTask.click().catch(() => {});
  }
  await page.locator('textarea').first().fill(`P0 E2E PM site visit ${RUN_ID}`);
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'p0-e2e-pm.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await page.locator('[data-testid="pm-declaration-checkbox"]').click();
  await page.locator('[data-testid="save-site-visit-report"]').click();

  await expect(page.getByText('Site Visit Recorded')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="summary-items-assessed"]')).toBeVisible();
  await expect(page.locator('[data-testid="summary-matches"]')).toBeVisible();
  await page.goto('/');
  await logout(page);
}

async function assertPortfolioUi(page) {
  await login(page, CREDENTIALS.admin);

  await page.goto('/weekly-reports');
  await page.waitForLoadState('networkidle');
  const projectSelect = page.locator('[data-testid="project-select"]');
  if (await projectSelect.count()) {
    const projectOption = projectSelect.locator('option', { hasText: STORE_CODE }).first();
    if (await projectOption.count()) {
      const projectValue = await projectOption.getAttribute('value');
      if (projectValue) {
        await projectSelect.selectOption(projectValue);
        await page.waitForLoadState('networkidle');
      }
    }
  }
  await expect(page.getByText(STORE_CODE).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Site Photos|GC Report Photos/).first()).toBeVisible({ timeout: 20_000 });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(STORE_CODE).first()).toBeVisible({ timeout: 20_000 });

  await page.goto('/risk');
  await page.waitForLoadState('networkidle');
  const riskText = await page.locator('body').innerText();
  expect(riskText).not.toContain('NaN');
  expect(riskText).not.toContain('undefined');

  await page.goto('/projects');
  await page.waitForLoadState('networkidle');
  await page.getByText(STORE_CODE).first().click();
  await expect(page.locator('.modal, [role="dialog"]').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/contractor report/i).first()).toBeVisible({ timeout: 10_000 });

  await logout(page);
}

async function assertViewerAndContractorSecurity(page) {
  await login(page, CREDENTIALS.viewer);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(STORE_CODE).first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(STORE_CODE).first()).toBeVisible({ timeout: 20_000 });
  await logout(page);

  await login(page, CREDENTIALS.contractor);
  await expect(page).toHaveURL(/\/contractor-select/, { timeout: 20_000 });
  await page.goto('/admin/users');
  await expect(page).not.toHaveURL(/\/admin\/users/);
  await logout(page);
}

test.afterAll(async () => {
  await cleanup();
});

test('P0 real flow: admin project -> contractor report -> PM verification -> dashboard/read security', async ({ page }) => {
  adminDb = await signInAs(CREDENTIALS.admin);
  contractorDb = await signInAs(CREDENTIALS.contractor);
  await signInAs(CREDENTIALS.viewer);

  await cleanup();
  await createProjectViaUi(page);
  await linkContractor();
  await submitContractorReport(page);
  await assertContractorData();
  await submitPmSiteVisit(page);
  await assertPortfolioUi(page);
  await assertViewerAndContractorSecurity(page);

  const { data: siteVisits, error: siteVisitError } = await adminDb
    .from('site_visits')
    .select('id, visited_by, photo_urls')
    .eq('project_id', projectId);
  if (siteVisitError) throw siteVisitError;
  expect(siteVisits.length).toBeGreaterThan(0);
  for (const visit of siteVisits) photoPaths.push(...(visit.photo_urls || []));

  await cleanup();
});
