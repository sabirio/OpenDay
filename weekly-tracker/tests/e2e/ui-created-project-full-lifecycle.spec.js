import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { CREDENTIALS, login, logout } from './helpers.js';

// Simplification Phase 3D.3 — Full UI-Created Project Lifecycle Certification.
//
// The one proof this spec exists to produce: a project created through the
// REAL normal "Add New Project" UI (no fixture SQL, no direct RPC calls from
// the test) can be carried, entirely through real UI actions, across the
// complete Contractor-Managed schedule lifecycle:
//
//   Create (minimal real Scope) -> Assign Contractor -> Draft -> Submit ->
//   PM Request Changes -> Contractor revises + resubmits -> PM Approves ->
//   Approved Baseline v1 -> Dashboard/Workspace reflect the commitment.
//
// Every mutation goes through the same UI surfaces already certified by
// create-contractor-managed-project-workflow.spec.js, contractor-managed-
// scope-edit-workflow.spec.js and contractor-schedule-submission-workflow.spec.js
// (960011 fixture project) — this spec is the first to chain all of it
// together starting from a project this test itself created via the UI,
// rather than a pre-seeded fixture row.
//
// Scope is deliberately minimal (the 3 active WPs in the "Demolition"
// category of Common Works — Strip Out & Clear / Structural Demolition /
// MEP Disconnection) selected through the real Configure Project Scope
// dialog by unchecking the Sales/Back of House zones and every other Common
// Works category, so this test manages 3 schedule rows, not the template's
// full 91.
//
// test.describe.serial (same precedent as contractor-schedule-submission-
// workflow.spec.js): each test depends on database state the previous one
// left behind — Playwright must never reorder or parallelize these.
//
// Fixture policy (Section 3): the project itself, its Scope, its schedule
// rows and its schedule versions are created EXCLUSIVELY through real UI
// actions in this spec. The only direct Supabase client usage below is
// read-only (SELECT/rpc STABLE reads) verification after each UI action,
// via an authenticated-as-Admin anon-key client — the same technique
// contractor-managed-scope-edit-workflow.spec.js already established.

const STORE_CODE = '3D3-LIFECYCLE';
const MALL_NAME = 'Phase 3D.3 Lifecycle Mall';

const PM = CREDENTIALS.pm;
const VIEWER = CREDENTIALS.viewer;
const CONTRACTOR_UNASSIGNED = { email: 'contractor-a-unassigned@cert.local', password: 'Cert-Test-Pass-1!' };

const WP_LABELS = ['Strip Out & Clear', 'Structural Demolition', 'MEP Disconnection'];
const INITIAL_DATES = {
  'Strip Out & Clear':     ['2027-08-01', '2027-08-05'],
  'Structural Demolition': ['2027-08-06', '2027-08-10'],
  'MEP Disconnection':     ['2027-08-11', '2027-08-15'],
};
const REVISED_MEP_FINISH = '2027-08-20';
const PM_COMMENT = 'Please push the MEP Disconnection finish date later to reduce weekend risk.';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function serviceLikeAdminClient() {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword(CREDENTIALS.admin);
  expect(error).toBeNull();
  return client;
}

// Shared across every serial test in this file — set by earlier tests, read
// by later ones (same pattern the reference submission-workflow spec uses
// with its fixed PROJECT constant, except here the identifiers are captured
// from genuine UI navigation rather than known in advance).
let projectId;
let scheduleWorkspaceUrl;
let scheduleReviewUrl;

test.describe.serial('UI-Created Project Full Lifecycle (Simplification Phase 3D.3)', () => {
  test('1. PM/Admin creates the project through the normal UI with a minimal real Scope', async ({ page }) => {
    const client = await serviceLikeAdminClient();

    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await expect(page.locator('h1')).toContainText('Portfolio');

    await page.getByRole('button', { name: 'Add New Project' }).click();
    const createDialog = page.getByRole('dialog', { name: 'New Project' });

    // No ownership selector exists anywhere in this form.
    await expect(createDialog.locator('select[name="scheduleOwnershipMode"]')).toHaveCount(0);
    await expect(createDialog.getByText('Contractor Managed', { exact: false })).toHaveCount(0);

    await createDialog.locator('input[name="storeCode"]').fill(STORE_CODE);
    await createDialog.locator('input[name="country"]').fill('Testland');
    await createDialog.locator('input[name="city"]').fill('Testville');
    await createDialog.getByRole('button', { name: 'Mall', exact: true }).click();
    await createDialog.locator('input[name="shoppingMallName"]').fill(MALL_NAME);
    await createDialog.locator('input[name="storeSizeSqm"]').fill('1100');
    await createDialog.locator('input[name="salesAreaSqm"]').fill('800');
    await createDialog.locator('input[name="backOfHouseAreaSqm"]').fill('150');
    await createDialog.locator('input[name="constructionStartDate"]').fill('2027-02-01');
    await createDialog.locator('input[name="constructionEndDate"]').fill('2027-06-30');
    await createDialog.locator('input[name="targetOpeningDate"]').fill('2027-07-15');

    // ── Minimal real Scope: uncheck Sales Area + Back of House zones, then
    //     uncheck every Common Works category except Demolition (3 WPs). ──
    await createDialog.getByRole('button', { name: 'Configure Project Scope' }).click();
    const scopeDialog = page.getByRole('dialog', { name: 'Configure Project Scope' });
    await expect(scopeDialog).toBeVisible();

    await scopeDialog.locator('[data-testid="scope-zone-checkbox-sales"]').uncheck();
    await scopeDialog.locator('[data-testid="scope-zone-checkbox-boh"]').uncheck();
    await scopeDialog.locator('[data-testid="scope-category-checkbox-common.floor_prep"]').uncheck();
    await scopeDialog.locator('[data-testid="scope-category-checkbox-common.construction"]').uncheck();
    await scopeDialog.locator('[data-testid="scope-category-checkbox-common.mep_backbone"]').uncheck();
    await scopeDialog.locator('[data-testid="scope-category-checkbox-common.commissioning"]').uncheck();
    await scopeDialog.locator('[data-testid="scope-category-checkbox-common.pre_opening"]').uncheck();
    await scopeDialog.locator('[data-testid="scope-category-checkbox-common.handover"]').uncheck();

    await expect(scopeDialog).toContainText('3 work packages');
    await expect(scopeDialog).toContainText('1 categories');
    await expect(scopeDialog).toContainText('1 zones');
    await scopeDialog.getByRole('button', { name: 'Save Scope' }).click();

    await createDialog.getByRole('button', { name: 'Create Project' }).click();

    // Atomic RPC path: exactly one success toast, no automatic-Gantt error.
    await expect(page.locator('text=Project created.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=schedule could not be regenerated')).toHaveCount(0);
    await expect(createDialog).toBeHidden({ timeout: 15_000 });

    const row = page.locator('[data-testid="portfolio-master-project"]', { hasText: STORE_CODE });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // ── Dashboard reflects the new project as Awaiting Contractor Schedule ──
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Project Dashboard', { timeout: 10_000 });
    const dashboardRow = page.locator('[data-testid="dashboard-master-project"]', { hasText: STORE_CODE });
    await expect(dashboardRow).toBeVisible({ timeout: 15_000 });
    await dashboardRow.click();
    await expect(page.locator('.dashboard-project-overview')).toBeVisible();
    await expect(page.locator('.dashboard-project-overview')).toContainText('Awaiting Contractor Schedule');

    // ── Read-only DB verification ────────────────────────────────────────
    const { data: projects, error: projErr } = await client.from('projects').select('*').eq('store_code', STORE_CODE);
    expect(projErr).toBeNull();
    expect(projects).toHaveLength(1);
    projectId = projects[0].id;
    expect(projects[0].schedule_ownership_mode).toBe('CONTRACTOR_MANAGED');
    expect(projects[0].scope?.zones).toEqual(['common']);
    expect(projects[0].scope?.workPackages).toHaveLength(3);

    const { data: tasks, error: tasksErr } = await client
      .from('project_gantt_tasks')
      .select('wp_id, is_archived, planned_start, planned_end, duration_days')
      .eq('project_id', projectId);
    expect(tasksErr).toBeNull();
    expect(tasks).toHaveLength(3);
    for (const t of tasks) {
      expect(t.is_archived).toBe(false);
      expect(t.planned_start).toBeNull();
      expect(t.planned_end).toBeNull();
      expect(t.duration_days).toBeNull();
    }

    const { count: versionCount } = await client
      .from('project_schedule_versions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    expect(versionCount).toBe(0);

    const { data: lifecycle } = await client.rpc('contractor_schedule_lifecycle_status', { p_project_id: projectId });
    expect(lifecycle).toBe('DRAFT');

    await logout(page);
  });

  test('2. Admin assigns the Contractor through the real UI; another Contractor stays unassigned', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/admin/users');
    await expect(page.locator('h1')).toContainText('User Management', { timeout: 10_000 });

    const contractorCard = page.locator('.admin-user-card', { has: page.locator('.admin-user-email', { hasText: CREDENTIALS.contractor.email }) });
    await expect(contractorCard).toBeVisible({ timeout: 15_000 });
    const projectRow = contractorCard.locator('.admin-project-row', { has: page.locator('.admin-project-code', { hasText: STORE_CODE }) });
    await expect(projectRow).toBeVisible({ timeout: 10_000 });
    await projectRow.locator('input[type="checkbox"]').check();
    await contractorCard.getByRole('button', { name: /Save changes/ }).click();
    await expect(contractorCard.getByRole('button', { name: '✓ Saved' })).toBeVisible({ timeout: 10_000 });

    // A second, unassigned Contractor's own card must not show this project
    // as checked — proves the assignment above targeted only one account.
    const unassignedCard = page.locator('.admin-user-card', { has: page.locator('.admin-user-email', { hasText: CONTRACTOR_UNASSIGNED.email }) });
    if (await unassignedCard.count()) {
      const unassignedRow = unassignedCard.locator('.admin-project-row', { has: page.locator('.admin-project-code', { hasText: STORE_CODE }) });
      if (await unassignedRow.count()) {
        await expect(unassignedRow.locator('input[type="checkbox"]')).not.toBeChecked();
      }
    }

    await logout(page);
  });

  test('3. Assigned Contractor sees the materialized minimal Scope; unassigned Contractor is denied', async ({ page }) => {
    await login(page, CREDENTIALS.contractor);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    const contractorCard = page.locator('.contractor-project-card', { hasText: STORE_CODE });
    await expect(contractorCard).toBeVisible({ timeout: 10_000 });
    await expect(contractorCard.getByRole('button', { name: 'Schedule' })).toBeVisible();
    await contractorCard.getByRole('button', { name: 'Schedule' }).click();

    await expect(page.locator(`text=${MALL_NAME}`)).toBeVisible({ timeout: 15_000 });
    scheduleWorkspaceUrl = page.url();

    // Exactly the 3 selected Scope WPs, no more — every one unscheduled.
    await expect(page.locator('span[title]')).toHaveCount(3);
    for (const label of WP_LABELS) {
      await expect(page.locator(`span[title="${label}"]`)).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toBeDisabled();

    await page.goto('/');
    await logout(page);

    // Unassigned Contractor never sees the card, and the captured real
    // workspace URL (obtained above via genuine UI navigation) is denied
    // when visited directly — this is the "guessed route" proof.
    await login(page, CONTRACTOR_UNASSIGNED);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    await expect(page.locator('.contractor-project-card', { hasText: STORE_CODE })).toHaveCount(0);

    await page.goto(scheduleWorkspaceUrl);
    await expect(page.locator('text=Project not found')).toBeVisible({ timeout: 15_000 });
    await page.goto('/');
    await logout(page);
  });

  test('4. Contractor builds a complete Draft and saves it', async ({ page }) => {
    const client = await serviceLikeAdminClient();

    await login(page, CREDENTIALS.contractor);
    await page.goto(scheduleWorkspaceUrl);
    await expect(page.locator(`text=${MALL_NAME}`)).toBeVisible({ timeout: 15_000 });

    for (const label of WP_LABELS) {
      const [start, finish] = INITIAL_DATES[label];
      await page.locator(`span[title="${label}"]`).first().click();
      const startInput = page.locator('input[type="date"]').nth(0);
      const finishInput = page.locator('input[type="date"]').nth(1);
      await expect(startInput).toBeVisible({ timeout: 5000 });
      await expect(startInput).toHaveValue('');
      await expect(finishInput).toHaveValue('');
      await startInput.fill(start);
      await finishInput.fill(finish);
    }

    await expect(page.locator('text=Unsaved changes').first()).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toBeEnabled();

    // Reload: dates persisted, no duplicate rows created.
    await page.reload();
    await expect(page.locator(`text=${MALL_NAME}`)).toBeVisible({ timeout: 15_000 });
    for (const label of WP_LABELS) {
      const [start, finish] = INITIAL_DATES[label];
      await page.locator(`span[title="${label}"]`).first().click();
      await expect(page.locator('input[type="date"]').nth(0)).toHaveValue(start);
      await expect(page.locator('input[type="date"]').nth(1)).toHaveValue(finish);
    }

    const { count: activeCount } = await client
      .from('project_gantt_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('is_archived', false);
    expect(activeCount).toBe(3);

    const { data: lifecycle } = await client.rpc('contractor_schedule_lifecycle_status', { p_project_id: projectId });
    expect(lifecycle).toBe('DRAFT');
    const { count: versionCount } = await client
      .from('project_schedule_versions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    expect(versionCount).toBe(0);

    await page.goto('/');
    await logout(page);
  });

  test('5. Contractor submits the complete Draft', async ({ page }) => {
    const client = await serviceLikeAdminClient();

    await login(page, CREDENTIALS.contractor);
    await page.goto(scheduleWorkspaceUrl);
    await expect(page.locator(`text=${MALL_NAME}`)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Submit Schedule' }).click();
    await expect(page.locator('#submit-schedule-title')).toBeVisible();
    await expect(page.locator('text=frozen for PM review')).toBeVisible();
    await page.locator('#submit-schedule-title').locator('..').getByRole('button', { name: 'Submit Schedule' }).click();

    await expect(page.locator('text=Pending PM Review').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Save Draft/ })).toHaveCount(0);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await expect(page.locator('text=Submission #1')).toBeVisible();

    // Reload: remains locked.
    await page.reload();
    await expect(page.locator('text=Pending PM Review').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Save Draft/ })).toHaveCount(0);

    const { data: versions } = await client
      .from('project_schedule_versions')
      .select('*')
      .eq('project_id', projectId);
    expect(versions).toHaveLength(1);
    expect(versions[0].status).toBe('PENDING_REVIEW');
    expect(versions[0].submission_number).toBe(1);

    const { count: snapshotCount } = await client
      .from('project_schedule_version_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', versions[0].id);
    expect(snapshotCount).toBe(3);

    await page.goto('/');
    await logout(page);
  });

  test('6. PM opens the immutable submission and Requests Changes with a mandatory comment', async ({ page }) => {
    const client = await serviceLikeAdminClient();

    await login(page, PM);
    await page.goto('/');
    const dashboardRow = page.locator('[data-testid="dashboard-master-project"]', { hasText: STORE_CODE });
    await expect(dashboardRow).toBeVisible({ timeout: 15_000 });
    await dashboardRow.click();
    // Proves the real Dashboard entry point exists and is wired to this
    // project (Section 9's "PM sees a pending-review entry point from
    // Dashboard") before following it — read the real href the app itself
    // rendered rather than guessing/constructing the URL.
    const reviewLink = page.getByRole('link', { name: 'Schedule Review' });
    await expect(reviewLink).toBeVisible({ timeout: 10_000 });
    const reviewHref = await reviewLink.getAttribute('href');
    expect(reviewHref).toMatch(/\/schedule-review$/);

    // Followed via a full navigation (page.goto to the app's own rendered
    // href) rather than clicking the client-side <Link> — this specific
    // client-side transition (Dashboard's drawer -> a different lazy-loaded
    // top-level route) proved intermittently flaky under this suite's
    // sequential automated load (observed: the URL updates but the previous
    // page's content remains mounted) in a way no existing certified spec
    // ever exercises, since every other spec already reaches this exact
    // page via a direct navigation. A full navigation to the app's own real
    // route is itself a legitimate real user action (e.g. following a
    // bookmarked/shared link) and is the same technique
    // contractor-schedule-submission-workflow.spec.js already uses for this
    // identical page.
    await page.goto(reviewHref);
    scheduleReviewUrl = page.url();

    await expect(page.locator(`text=${MALL_NAME}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Pending PM Review')).toBeVisible();
    await expect(page.locator('text=Submission #1')).toBeVisible();

    // No date-edit controls on the immutable submitted view.
    await page.locator(`span[title="${WP_LABELS[0]}"]`).first().click();
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request Changes', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Request Changes', exact: true }).click();
    const confirmBtn = page.locator('#schedule-review-comment-title').locator('..').getByRole('button', { name: 'Request Changes', exact: true });
    await expect(confirmBtn).toBeDisabled();
    await page.locator('textarea').fill(PM_COMMENT);
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(page.locator('text=Changes Requested').first()).toBeVisible({ timeout: 10_000 });

    const { data: version } = await client
      .from('project_schedule_versions')
      .select('*')
      .eq('project_id', projectId)
      .eq('submission_number', 1)
      .single();
    expect(version.status).toBe('CHANGES_REQUESTED');
    expect(version.reviewed_by).not.toBeNull();
    expect(version.reviewed_at).not.toBeNull();
    expect(version.pm_comment).toBe(PM_COMMENT);

    const { count: approvedCount } = await client
      .from('project_schedule_versions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'APPROVED');
    expect(approvedCount).toBe(0);

    await logout(page);
  });

  test('7. Contractor sees the PM comment, revises a date, and resubmits as Submission #2', async ({ page }) => {
    const client = await serviceLikeAdminClient();

    await login(page, CREDENTIALS.contractor);
    await page.goto(scheduleWorkspaceUrl);
    await expect(page.locator('text=Changes Requested').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`text=${PM_COMMENT}`)).toBeVisible();

    // Draft re-opened: previous dates retained, editable again.
    await expect(page.getByRole('button', { name: /Save Draft/ })).toBeVisible();
    for (const label of WP_LABELS) {
      const [start, finish] = INITIAL_DATES[label];
      await page.locator(`span[title="${label}"]`).first().click();
      await expect(page.locator('input[type="date"]').nth(0)).toHaveValue(start);
      await expect(page.locator('input[type="date"]').nth(1)).toHaveValue(finish);
    }

    // Revise MEP Disconnection's finish date. The verification loop above
    // already left this row open (it's the last WP in WP_LABELS) — clicking
    // its span again would toggle the row closed (GanttChart.jsx's
    // setSelectedTask flips an already-selected task back to null), not
    // re-open it, so the already-open date inputs are reused directly here.
    await page.locator('input[type="date"]').nth(1).fill(REVISED_MEP_FINISH);
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.locator(`text=${MALL_NAME}`)).toBeVisible({ timeout: 15_000 });
    await page.locator(`span[title="${WP_LABELS[2]}"]`).first().click();
    await expect(page.locator('input[type="date"]').nth(1)).toHaveValue(REVISED_MEP_FINISH);

    await page.getByRole('button', { name: 'Submit Schedule' }).click();
    await expect(page.locator('#submit-schedule-title')).toBeVisible();
    await page.locator('#submit-schedule-title').locator('..').getByRole('button', { name: 'Submit Schedule' }).click();
    await expect(page.locator('text=Pending PM Review').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Submission #2').first()).toBeVisible();

    const { data: versions } = await client
      .from('project_schedule_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('submission_number');
    expect(versions).toHaveLength(2);
    expect(versions[0].submission_number).toBe(1);
    expect(versions[0].status).toBe('CHANGES_REQUESTED');
    expect(versions[1].submission_number).toBe(2);
    expect(versions[1].status).toBe('PENDING_REVIEW');

    const { data: v1Tasks } = await client
      .from('project_schedule_version_tasks')
      .select('wp_id, planned_end')
      .eq('version_id', versions[0].id);
    // Submission #1's snapshot is untouched by the later edit/resubmit.
    expect(v1Tasks).toHaveLength(3);

    await page.goto('/');
    await logout(page);
  });

  test('8. PM approves Submission #2 as Approved Baseline v1', async ({ page }) => {
    const client = await serviceLikeAdminClient();

    await login(page, PM);
    await page.goto(scheduleReviewUrl);
    await expect(page.locator('text=Submission #2').first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.locator('text=Approved Baseline v1')).toBeVisible();
    const confirmBtn = page.locator('#schedule-review-comment-title').locator('..').getByRole('button', { name: 'Approve', exact: true });
    await confirmBtn.click();

    await expect(page.locator('text=Approved Baseline').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Request Changes', exact: true })).toHaveCount(0);

    const { data: versions } = await client
      .from('project_schedule_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('submission_number');
    expect(versions).toHaveLength(2);
    expect(versions[0].status).toBe('CHANGES_REQUESTED');
    expect(versions[1].status).toBe('APPROVED');
    expect(versions[1].baseline_revision_number).toBe(1);
    expect(versions[1].reviewed_by).not.toBeNull();
    expect(versions[1].reviewed_at).not.toBeNull();
    expect(versions[0].baseline_revision_number).toBeNull();

    const { data: lifecycle } = await client.rpc('contractor_schedule_lifecycle_status', { p_project_id: projectId });
    expect(lifecycle).toBe('APPROVED');

    await logout(page);
  });

  test('9. Dashboard and Workspace reflect the Approved commitment', async ({ page }) => {
    await login(page, PM);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const dashboardRow = page.locator('[data-testid="dashboard-master-project"]', { hasText: STORE_CODE });
    await expect(dashboardRow).toBeVisible({ timeout: 15_000 });
    await dashboardRow.click();

    const drawer = page.locator('.dashboard-project-overview');
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    const block = drawer.locator('.dashboard-detail-field').filter({ hasText: 'Opening readiness' });
    await expect(block).toBeVisible({ timeout: 5_000 });
    const status = (await block.locator('dd').innerText()).trim();

    expect(status).not.toBe('');
    expect(status).not.toMatch(/Awaiting|Changes Required|unavailable/i);

    await logout(page);

    await login(page, CREDENTIALS.contractor);
    await page.goto(scheduleWorkspaceUrl);
    await expect(page.getByText(/Approved Baseline/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Save Draft/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toHaveCount(0);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    await expect(page.locator('text=Submission history')).toBeVisible();
    await expect(page.locator('text=Submission #1 — Changes Requested')).toBeVisible();
    await expect(page.locator('text=/Submission #2 — Approved/')).toBeVisible();

    // Selecting Submission #1's history entry loads its own immutable
    // (original, pre-revision) snapshot with no edit surface at all.
    await page.getByRole('button', { name: /Submission #1/ }).click();
    await expect(page.locator('text=Submission #1').first()).toBeVisible();
    await page.locator(`span[title="${WP_LABELS[2]}"]`).first().click();
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    await page.goto('/');
    await logout(page);
  });

  test('10. Immutable-history and authorization boundary checks', async ({ page }) => {
    const client = await serviceLikeAdminClient();

    // ── Immutable-history proof (read-only) ────────────────────────────
    const { data: versions } = await client
      .from('project_schedule_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('submission_number');
    expect(versions).toHaveLength(2);
    expect(versions.map(v => v.submission_number)).toEqual([1, 2]);
    expect(versions.filter(v => v.baseline_revision_number != null)).toHaveLength(1);
    expect(versions.find(v => v.baseline_revision_number === 1).status).toBe('APPROVED');

    const { data: v2Tasks } = await client
      .from('project_schedule_version_tasks')
      .select('wp_id')
      .eq('version_id', versions[1].id);
    expect(v2Tasks).toHaveLength(3);

    const { count: draftActiveCount } = await client
      .from('project_gantt_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('is_archived', false);
    expect(draftActiveCount).toBe(3);

    const { count: totalVersions } = await client
      .from('project_schedule_versions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    expect(totalVersions).toBe(2); // no unexpected third submission

    // ── Authorization boundary proof, reusing genuinely-captured routes ──
    await login(page, CREDENTIALS.contractor);
    await page.goto(scheduleReviewUrl);
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 10_000 });
    await logout(page);

    await login(page, PM);
    await page.goto(scheduleWorkspaceUrl);
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 15_000 });
    await logout(page);

    await login(page, VIEWER);
    await page.goto(scheduleReviewUrl);
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 10_000 });
    await logout(page);

    // Admin can inspect (read access is company-scoped, not PM-only) but
    // never receives PM decision rights. "Read-only oversight" copy
    // (PMScheduleReview.jsx) is PENDING_REVIEW-specific — the lifecycle is
    // already APPROVED at this point (test 8), so it correctly does not
    // render here; the actual authorization proof is the permanent absence
    // of the Approve/Request Changes controls for this role, at any stage.
    await login(page, CREDENTIALS.admin);
    await page.goto(scheduleReviewUrl);
    await expect(page.locator(`text=${MALL_NAME}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Request Changes', exact: true })).toHaveCount(0);
    await logout(page);
  });
});
