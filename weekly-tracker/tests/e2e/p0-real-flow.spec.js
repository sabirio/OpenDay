import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { assertLocalTarget } from '../../scripts/certification/localTargetGuard.mjs';
import { CREDENTIALS, login, logout } from './helpers.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL and E2E_SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY. Configure the guarded local E2E environment.');
}

const LOCAL_TARGET = assertLocalTarget({
  apiUrl: SUPABASE_URL,
  dbUrl: process.env.CERT_DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});
const PSQL_BIN = process.env.PSQL_BIN || (process.platform === 'win32'
  ? 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
  : 'psql');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STORE_CODE = `P0E2E-${RUN_ID}`;
const MALL_NAME = `P0 E2E Mall ${RUN_ID}`;

let adminDb;
let contractorUserId;
let pmUserId;
let projectId;
let contractorReportId;
let photoPaths = [];
let contractorProfileBefore;

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

function cleanupLocalTestProjects(projectIds) {
  const ids = [...new Set(projectIds)].map(Number).filter(Number.isSafeInteger);
  if (ids.length === 0) return;
  const idList = ids.map(id => `${id}::bigint`).join(',');
  const sql = `
BEGIN;
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = ANY (ARRAY[${idList}])
      AND NOT (
        store_code LIKE 'P0E2E-%'
        AND shopping_mall_name LIKE 'P0 E2E Mall %'
        AND city = 'E2E City'
        AND country = 'E2E Country'
      )
  ) THEN
    RAISE EXCEPTION 'Refusing cleanup: project id does not belong to the P0 E2E fixture';
  END IF;
END
$guard$;
DELETE FROM public.site_visit_discrepancies WHERE project_id = ANY (ARRAY[${idList}]);
DELETE FROM public.site_visit_wps WHERE project_id = ANY (ARRAY[${idList}]);
DELETE FROM public.site_visits WHERE project_id = ANY (ARRAY[${idList}]);
DELETE FROM public.contractor_report_wps WHERE project_id = ANY (ARRAY[${idList}]);
DELETE FROM public.progress_history WHERE project_id = ANY (ARRAY[${idList}]);
DELETE FROM public.contractor_reports WHERE project_id = ANY (ARRAY[${idList}]);
DELETE FROM public.reports WHERE project_id = ANY (ARRAY[${idList}]);
DELETE FROM public.project_gantt_tasks WHERE project_id = ANY (ARRAY[${idList}]);
DELETE FROM public.project_team_membership_capabilities WHERE project_id = ANY (ARRAY[${idList}]);
DELETE FROM public.project_team_memberships WHERE project_id = ANY (ARRAY[${idList}]);
DELETE FROM public.projects
WHERE id = ANY (ARRAY[${idList}])
  AND store_code LIKE 'P0E2E-%'
  AND shopping_mall_name LIKE 'P0 E2E Mall %'
  AND city = 'E2E City'
  AND country = 'E2E Country';
COMMIT;`;
  execFileSync(PSQL_BIN, [LOCAL_TARGET.dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` },
  });
}

async function cleanup() {
  if (!adminDb) {
    adminDb = (await signInAs(CREDENTIALS.admin).catch(() => null))?.client ?? null;
  }
  if (!adminDb) return;

  const ids = new Set();
  if (projectId) ids.add(projectId);

  const { data: staleProjects, error: staleProjectsError } = await adminDb
    .from('projects')
    .select('id')
    .or(`store_code.eq.${STORE_CODE},shopping_mall_name.eq.${MALL_NAME}`);
  if (staleProjectsError) throw staleProjectsError;
  for (const row of staleProjects || []) ids.add(row.id);

  for (const id of ids) {
    const { data: reports, error: reportsError } = await adminDb
      .from('contractor_reports')
      .select('id, photo_urls')
      .eq('project_id', id);
    if (reportsError) throw reportsError;
    for (const report of reports || []) {
      photoPaths.push(...(report.photo_urls || []));
    }
    const { data: visits, error: visitsError } = await adminDb
      .from('site_visits')
      .select('photo_urls')
      .eq('project_id', id);
    if (visitsError) throw visitsError;
    for (const visit of visits || []) photoPaths.push(...(visit.photo_urls || []));
  }

  if (contractorProfileBefore) {
    const { error } = await adminDb.rpc('update_admin_user_profile', {
      p_user_id: contractorProfileBefore.id,
      p_name: contractorProfileBefore.name,
      p_job_role: contractorProfileBefore.job_role,
      p_access_role: contractorProfileBefore.role,
      p_assigned_project_ids: contractorProfileBefore.assigned_projects,
      p_client_request_id: crypto.randomUUID(),
    });
    if (error) throw error;
    contractorProfileBefore = null;
  }

  cleanupLocalTestProjects([...ids]);

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

  await modal.getByRole('button', { name: 'Mall', exact: true }).click();
  await modal.locator('input[name="storeCode"]').fill(STORE_CODE);
  await modal.locator('input[name="shoppingMallName"]').fill(MALL_NAME);
  await modal.locator('input[name="city"]').fill('E2E City');
  await modal.locator('input[name="country"]').fill('E2E Country');
  await modal.locator('input[name="constructionStartDate"]').fill('2026-07-01');
  await modal.locator('input[name="constructionEndDate"]').fill('2026-09-30');
  await modal.locator('input[name="targetOpeningDate"]').fill('2026-10-15');

  await modal.locator('button', { hasText: /create project|save/i }).last().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  // The Portfolio Master is paginated, so locate the new project through its
  // canonical search instead of assuming it lands on the current page.
  await page.getByPlaceholder('Search projects...').fill(STORE_CODE);
  await expect(page.getByTestId('portfolio-master-project').filter({ hasText: STORE_CODE })).toBeVisible({ timeout: 20_000 });

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
    .select('id, name, role, job_role, assigned_projects')
    .eq('email', CREDENTIALS.contractor.email)
    .single();
  if (profileError) throw profileError;
  contractorProfileBefore = structuredClone(contractorProfile);

  const assigned = new Set(contractorProfile.assigned_projects || []);
  assigned.add(projectId);
  const { error: assignError } = await adminDb.rpc('update_admin_user_profile', {
    p_user_id: contractorProfile.id,
    p_name: contractorProfile.name,
    p_job_role: null,
    p_access_role: 'Contractor',
    p_assigned_project_ids: [...assigned],
    p_client_request_id: crypto.randomUUID(),
  });
  if (assignError) throw assignError;
}

async function assignProjectManager() {
  const { error } = await adminDb.rpc('add_project_team_member', {
    p_project_id: projectId,
    p_user_id: pmUserId,
    p_department_code: 'PROJECT_MANAGEMENT',
    p_client_request_id: crypto.randomUUID(),
  });
  if (error) throw error;
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

  // At least one WP must be selected before submit is valid
  // (validateContractorReport). A fresh report auto-selects the first
  // legacy WP by default (formHelpers.js's makeInitialForm) — check the
  // toggle's own accessible pressed state (aria-pressed) rather than
  // parsing its computed CSS border color, which is an implementation
  // detail that silently drifts whenever the design-token palette changes
  // (see ReportingWorkPackagesSection.jsx: aria-pressed={selected}).
  const wpToggle = page.locator('[data-testid="wp-toggle"]').first();
  if (await wpToggle.count()) {
    const active = (await wpToggle.getAttribute('aria-pressed')) === 'true';
    if (!active) await wpToggle.click();
    await expect(wpToggle).toHaveAttribute('aria-pressed', 'true');
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
  // SiteVisitFormView.jsx branches on ganttTasks.length: > 0 renders
  // GanttPMTaskRow (canonical snake_case status vocabulary —
  // 'not_started'/'in_progress'/'completed'/'delayed'/'blocked'); 0 renders
  // LegacyPMTaskRow (Title Case — 'Not Started'/'In Progress'/...). This
  // project (created via createProjectViaUi() with only store/date fields,
  // no Scope/template selection) does not get a generated Gantt schedule,
  // so it renders the Legacy variant — hardcoding either vocabulary makes
  // this brittle against whichever branch a given fixture project takes.
  // Detect which one actually rendered by testid presence, then click that
  // variant's own "in progress" equivalent, so this proves the flow works
  // correctly under both branches rather than assuming one.
  const pmRows = page.locator('[data-testid="pm-task-row"]');
  const pmRowCount = await pmRows.count();
  if (pmRowCount > 0) {
    const usesGanttVocabulary = (await pmRows.first().locator('[data-testid="pm-status-btn-in_progress"]').count()) > 0;
    const inProgressTestId = usesGanttVocabulary ? 'pm-status-btn-in_progress' : 'pm-status-btn-In Progress';
    for (let i = 0; i < Math.min(pmRowCount, 3); i++) {
      await pmRows.nth(i).locator(`[data-testid="${inProgressTestId}"]`).click();
    }
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
  // SiteVisitReport.jsx branches on savedVisit._ganttFormat: a Gantt-scheduled
  // project renders GanttSuccessView.jsx (3-box summary: summary-confirmed/
  // summary-discrepancy/summary-pm-ahead); a project with no generated Gantt
  // schedule (this project — see the WP-toggle/PM-status-button branches
  // above) renders the legacy ComparisonResultsView.jsx (4-box summary:
  // summary-items-assessed/summary-matches/summary-discrepancies/
  // summary-pm-ahead). Detect which one actually rendered rather than
  // assuming either, so this proves the flow works correctly under both.
  const usesGanttSuccessView = (await page.locator('[data-testid="summary-confirmed"]').count()) > 0;
  if (usesGanttSuccessView) {
    await expect(page.locator('[data-testid="summary-confirmed"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-discrepancy"]')).toBeVisible();
  } else {
    await expect(page.locator('[data-testid="summary-items-assessed"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-discrepancies"]')).toBeVisible();
  }
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
  await page.getByPlaceholder('Search projects...').fill(STORE_CODE);
  await page.getByTestId('portfolio-master-project').filter({ hasText: STORE_CODE }).click();
  // Project details render inline in the Portfolio master-detail workspace
  // (no modal/overlay), so the sidebar's Sign out button is never covered.
  const detailsPane = page.locator('.detail-pane');
  await expect(detailsPane).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/contractor report/i).first()).toBeVisible({ timeout: 10_000 });

  await logout(page);
}

async function assertViewerAndContractorSecurity(page) {
  await login(page, CREDENTIALS.viewer);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // The historical `viewer` fixture is now an Executive. Executives may open
  // Portfolio, but must not regain portfolio-wide row access merely because
  // a project belongs to the same company.
  await expect(page.getByText(STORE_CODE)).toHaveCount(0);
  const { client: viewerDb } = await signInAs(CREDENTIALS.viewer);
  const { data: viewerRows, error: viewerError } = await viewerDb
    .from('projects')
    .select('id')
    .eq('id', projectId);
  expect(viewerError).toBeNull();
  expect(viewerRows).toEqual([]);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/projects/, { timeout: 20_000 });
  await expect(page.getByText(STORE_CODE)).toHaveCount(0);
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
  ({ userId: pmUserId } = await signInAs(CREDENTIALS.pm));
  await signInAs(CREDENTIALS.viewer);

  await cleanup();
  await createProjectViaUi(page);
  await linkContractor();
  await assignProjectManager();
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
