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
let contractorUserId;
let projectId;
let contractorReportId;
let photoPaths = [];

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Returns { client, userId } — capture the user id from signInWithPassword()'s
// own response rather than a later client.auth.getUser() call. With
// persistSession:false, the client doesn't reliably retain session state for
// getUser() to read back afterwards (verified live: getUser() on such a
// client throws "AuthSessionMissingError: Auth session missing!" even though
// sign-in itself succeeded) — the id is already right there in the sign-in
// response, no second round-trip needed.
async function signInAs(creds) {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) throw new Error(`E2E sign-in failed for ${creds.email}: ${error.message}`);
  return { client, userId: data.user?.id };
}

async function cleanup() {
  if (!adminDb) {
    adminDb = (await signInAs(CREDENTIALS.admin).catch(() => null))?.client ?? null;
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
  // PrintHeader.jsx renders "Project: {code} — {name}" in a `.print-only`
  // element (display:none on screen, only shown via @media print) — a plain
  // getByText(STORE_CODE) can match that hidden node first in DOM order.
  // Intersect with :visible so this only matches the real on-screen content.
  await expect(page.getByText(STORE_CODE).and(page.locator(':visible')).first()).toBeVisible({ timeout: 20_000 });

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
  // createProjectViaUi() left `page` authenticated as admin. App.jsx redirects
  // an already-authenticated session away from /login (Navigate to
  // getDefaultRoute(role)) before the login form ever renders, so switching
  // to a different user here without clearing that session first makes
  // `#email` never appear — login() then hangs until the whole test times out.
  // Clearing the browser's local session state (rather than driving the real
  // "Sign out" button via the shared logout() helper) is enough to make
  // App.jsx's isAuthenticated false on the next navigation.
  await page.evaluate(() => localStorage.clear());
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

  await page.getByLabel(/Top 3 Activities .* Next Week/i).fill('1) E2E progress verification\n2) E2E site works\n3) E2E coordination');
  await page.getByLabel(/Top 3 Activities .* Week \+2/i).fill('1) E2E next works\n2) E2E procurement\n3) E2E QA');
  await page.getByLabel(/Final Comments or Pending Issues/i).fill(`No blockers for P0 E2E. Run ${RUN_ID}`);

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'p0-e2e.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  // "Photos: 1 / 15" appears optimistically the instant the file is picked, before
  // the async compress+upload resolves — it doesn't prove the upload is done.
  // Wait for the Submit button itself to re-enable (it's disabled while any photo
  // upload is in flight), which is what actually gates a successful submit.
  await expect(page.getByText(/1 photo attached|Photos: 1 \/ 15/)).toBeVisible({ timeout: 20_000 });

  await page.locator('[data-testid="declaration-checkbox"]').click();
  await expect(page.locator('[data-testid="save-contractor-report"]')).toBeEnabled({ timeout: 30_000 });
  await page.locator('[data-testid="save-contractor-report"]').click();
  await expect(page.getByText('Report submitted')).toBeVisible({ timeout: 30_000 });
  await page.goto('/');
  await logout(page);
}

async function assertContractorData() {
  // contractorUserId was captured at sign-in time (module scope) — see the
  // signInAs() doc comment for why we don't call getCurrentUserId() here.
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
  // This project was created via createProjectViaUi() with construction
  // start/end dates, so it has a generated Gantt schedule — the site visit
  // form renders GanttPMTaskRow (not LegacyPMTaskRow), whose status buttons
  // use the canonical snake_case vocabulary ('not_started'/'in_progress'/
  // 'completed'/'delayed'/'blocked'), not Legacy's Title Case
  // ('Not Started'/'In Progress'/...). The previous
  // `[data-testid^="pm-status-"], [data-testid^="pm-progress-"]` selector
  // never matched anything for a Gantt-scheduled project (verified live:
  // GanttPMTaskRow's status buttons carry no testid at all prior to this
  // fix), so no PM observation was ever recorded and the comparison summary
  // had nothing to show. Set a couple of task rows to "In Progress" so the
  // submitted visit has real assessed items.
  const pmRows = page.locator('[data-testid="pm-task-row"]');
  const pmRowCount = await pmRows.count();
  for (let i = 0; i < Math.min(pmRowCount, 3); i++) {
    await pmRows.nth(i).locator('[data-testid="pm-status-btn-in_progress"]').click();
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
  // This project's Gantt-scheduled flow renders GanttSuccessView.jsx, not
  // ComparisonResultsView.jsx (the legacy path's success screen) — a
  // different component with a 3-box summary (Confirmed/Discrepancy/PM
  // Ahead), not the legacy 4-box one (summary-items-assessed/summary-matches/
  // summary-discrepancies/summary-pm-ahead) other specs check. Verified live:
  // GanttSuccessView had no testids at all before this fix.
  await expect(page.locator('[data-testid="summary-confirmed"]')).toBeVisible();
  await expect(page.locator('[data-testid="summary-discrepancy"]')).toBeVisible();
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
  // PrintHeader.jsx renders "Project: {code} — {name}" in a `.print-only`
  // element (display:none on screen, only shown via @media print) — a plain
  // getByText(STORE_CODE) can match that hidden node first in DOM order.
  // Intersect with :visible so this only matches the real on-screen content.
  await expect(page.getByText(STORE_CODE).and(page.locator(':visible')).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Details & Evidence' }).click();
  await expect(page.getByText(/Site Photos|GC Report Photos/).first()).toBeVisible({ timeout: 20_000 });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // PrintHeader.jsx renders "Project: {code} — {name}" in a `.print-only`
  // element (display:none on screen, only shown via @media print) — a plain
  // getByText(STORE_CODE) can match that hidden node first in DOM order.
  // Intersect with :visible so this only matches the real on-screen content.
  await expect(page.getByText(STORE_CODE).and(page.locator(':visible')).first()).toBeVisible({ timeout: 20_000 });

  await page.goto('/risk');
  await page.waitForLoadState('networkidle');
  const riskText = await page.locator('body').innerText();
  expect(riskText).not.toContain('NaN');
  expect(riskText).not.toContain('undefined');

  await page.goto('/projects');
  await page.waitForLoadState('networkidle');
  await page.getByText(STORE_CODE).first().click();
  const detailModal = page.locator('.modal, [role="dialog"]').first();
  await expect(detailModal).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/contractor report/i).first()).toBeVisible({ timeout: 10_000 });

  // This modal's full-screen .modal-overlay backdrop covers the sidebar's
  // Sign out button — close it before logging out. ProjectDetailModal.jsx
  // does not close on Escape (verified live), so use its real close button.
  await detailModal.locator('.close-button').click();
  await expect(detailModal).not.toBeVisible({ timeout: 5_000 });
  await logout(page);
}

async function assertViewerAndContractorSecurity(page) {
  await login(page, CREDENTIALS.viewer);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // PrintHeader.jsx renders "Project: {code} — {name}" in a `.print-only`
  // element (display:none on screen, only shown via @media print) — a plain
  // getByText(STORE_CODE) can match that hidden node first in DOM order.
  // Intersect with :visible so this only matches the real on-screen content.
  await expect(page.getByText(STORE_CODE).and(page.locator(':visible')).first()).toBeVisible({ timeout: 20_000 });
  // Viewer's PERMISSIONS entry (rolePermissions.js) only grants 'dashboard' —
  // it has never included 'projects'. ProtectedRoute redirects any role
  // lacking the route's resource permission to /unauthorized, so Viewer is
  // correctly blocked from the Portfolio page. Verified live: this file
  // previously asserted STORE_CODE visibility on /projects for Viewer, which
  // can never pass because the page redirects away before rendering.
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/unauthorized/, { timeout: 20_000 });
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
  ({ client: adminDb } = await signInAs(CREDENTIALS.admin));
  ({ userId: contractorUserId } = await signInAs(CREDENTIALS.contractor));
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
