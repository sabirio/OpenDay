import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Simplification Phase 4B.2 — Contractor Submit + PM Review + Approved
// Baseline UX E2E.
//
// Fixtures (contractorScheduleSubmissionFixtures.mjs, run before this spec):
//   960011 SCHEDULE-SUBMIT (CONTRACTOR_MANAGED) — 3 active WPs, all
//     unscheduled at the start of the run (demo.walls, finish.paint,
//     mep.electrical) + 1 archived (legacy.archived, excluded throughout).
//   contractor-a-assigned@cert.local is assigned; pm-a-assigned@cert.local
//   is same-company (company-a), satisfying can_write_project() without
//   needing assigned_projects.
//
// Dedicated project, isolated from 960001/960002 (contractor-schedule-workspace.spec.js)
// — see the fixture script's own header for why sharing a project here
// would corrupt those 25 other tests' assumptions.
//
// This spec drives ONE project through the full lifecycle in order —
// test.describe.serial (same precedent as 22-persistent-demo-scenario.spec.js)
// guarantees Playwright never reorders or parallelizes these tests, since
// each one depends on the database state the previous one left behind.

const CONTRACTOR = { email: 'contractor-a-assigned@cert.local', password: 'Cert-Test-Pass-1!' };
const CONTRACTOR_UNASSIGNED = { email: 'contractor-a-unassigned@cert.local', password: 'Cert-Test-Pass-1!' };
const PM = { email: 'pm-a-assigned@cert.local', password: 'Cert-Test-Pass-1!' };
const ADMIN = { email: 'admin-a@cert.local', password: 'Cert-Test-Pass-1!' };
const VIEWER = { email: 'viewer-a@cert.local', password: 'Cert-Test-Pass-1!' };
const PROJECT = '960011';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe.serial('Contractor Schedule Submission workflow (Simplification Phase 4B.2)', () => {
  test('1. Contractor sees an incomplete Draft and cannot Submit', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Schedule Submission Test Mall')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Scheduled WPs: 0 / 3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toBeDisabled();
  });

  test('2. Contractor can Save an incomplete Draft', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Schedule Submission Test Mall')).toBeVisible({ timeout: 15_000 });

    const walls = page.locator('span[title="Demo Walls"]').first();
    await walls.click();
    await page.locator('input[type="date"]').nth(0).fill('2027-01-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-01-05');
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Scheduled WPs: 1 / 3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toBeDisabled();
  });

  test('3. Contractor schedules all remaining active Scope WPs', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Schedule Submission Test Mall')).toBeVisible({ timeout: 15_000 });

    await page.locator('span[title="Finish Paint"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-01-06');
    await page.locator('input[type="date"]').nth(1).fill('2027-01-10');
    await page.locator('span[title="MEP Electrical"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-01-11');
    await page.locator('input[type="date"]').nth(1).fill('2027-01-15');

    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Scheduled WPs: 3 / 3')).toBeVisible();
  });

  test('4. Dirty local changes prevent Submit until Save Draft', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Schedule Submission Test Mall')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toBeEnabled();

    await page.locator('span[title="Demo Walls"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-02-01');
    await expect(page.locator('text=Unsaved changes').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toBeDisabled();

    // Revert this test's own dirty edit so it doesn't leak into test 5.
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toBeEnabled();
  });

  test('5. Contractor submits the complete persisted Draft', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Schedule Submission Test Mall')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Submit Schedule' }).click();
    await expect(page.locator('#submit-schedule-title')).toBeVisible();
    await expect(page.locator('text=frozen for PM review')).toBeVisible();
    await page.locator('#submit-schedule-title').locator('..').getByRole('button', { name: 'Submit Schedule' }).click();

    // 6. Page becomes PENDING_REVIEW and read-only.
    await expect(page.locator('text=Pending PM Review').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Save Draft/ })).toHaveCount(0);

    // 7. Submitted snapshot equals the persisted Draft at Submit time.
    await expect(page.locator('text=Submission #1')).toBeVisible();
    await expect(page.locator('text=Scheduled WPs: 3 / 3')).toBeVisible();
  });

  test('8. Contractor cannot Save through the UI while pending', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Pending PM Review').first()).toBeVisible({ timeout: 15_000 });
    // No editable Gantt, no drag/manual-date controls, no Save action at all.
    await expect(page.getByRole('button', { name: /Save Draft/ })).toHaveCount(0);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
  });

  test('9. PM sees a pending-review entry point from Dashboard', async ({ page }) => {
    await login(page, PM);
    await page.goto('/');
    const card = page.locator(`[data-testid="dashboard-master-project"][data-project-id="${PROJECT}"]`);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    await expect(page.getByRole('link', { name: 'Schedule Review' })).toBeVisible({ timeout: 10_000 });
  });

  test('10-11. PM opens the immutable submission with no date-edit controls', async ({ page }) => {
    await login(page, PM);
    await page.goto(`/projects/${PROJECT}/schedule-review`);
    await expect(page.locator('text=Schedule Submission Test Mall')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Pending PM Review')).toBeVisible();
    await expect(page.locator('text=Submission #1')).toBeVisible();
    await expect(page.locator('text=Scheduled WPs: 3 / 3')).toBeVisible();

    // No date-edit controls: readOnly Gantt never opens the tooltip / date inputs.
    await page.locator('span[title="Demo Walls"]').first().click();
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request Changes', exact: true })).toBeVisible();
  });

  test('12. Admin can inspect but has no decision controls', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto(`/projects/${PROJECT}/schedule-review`);
    await expect(page.locator('text=Schedule Submission Test Mall')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Submission #1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Request Changes', exact: true })).toHaveCount(0);
    await expect(page.locator('text=Read-only oversight')).toBeVisible();
  });

  test('13. Viewer cannot access Schedule Review', async ({ page }) => {
    await login(page, VIEWER);
    await page.goto(`/projects/${PROJECT}/schedule-review`);
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 10_000 });
  });

  test('14-15. PM Request Changes requires a comment; Submission #1 remains immutable', async ({ page }) => {
    await login(page, PM);
    await page.goto(`/projects/${PROJECT}/schedule-review`);
    await expect(page.locator('text=Submission #1')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Request Changes', exact: true }).click();
    const confirmBtn = page.locator('#schedule-review-comment-title').locator('..').getByRole('button', { name: 'Request Changes', exact: true });
    await expect(confirmBtn).toBeDisabled();
    await page.locator('textarea').fill('Please push MEP Electrical two weeks later.');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(page.locator('text=Changes Requested').first()).toBeVisible({ timeout: 10_000 });
    // Submission #1's own snapshot dates are unchanged — still shows the original submitted values.
    await expect(page.locator('text=Scheduled WPs: 3 / 3')).toBeVisible();
  });

  test('16-17. Contractor sees the PM comment and the Draft becomes editable', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Changes Requested').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Please push MEP Electrical two weeks later.')).toBeVisible();

    // Editable Gantt is available again (Draft re-opened).
    await expect(page.getByRole('button', { name: /Save Draft/ })).toBeVisible();
    await expect(page.locator('span[title="MEP Electrical"]').first()).toBeVisible();
  });

  test('18-19. Contractor edits MEP Electrical and saves', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Changes Requested').first()).toBeVisible({ timeout: 15_000 });

    await page.locator('span[title="MEP Electrical"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-01-25');
    await page.locator('input[type="date"]').nth(1).fill('2027-01-29');
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });
  });

  test('20. Contractor resubmits as Submission #2', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Changes Requested').first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Submit Schedule' }).click();
    await expect(page.locator('#submit-schedule-title')).toBeVisible();
    await page.locator('#submit-schedule-title').locator('..').getByRole('button', { name: 'Submit Schedule' }).click();
    await expect(page.locator('text=Pending PM Review').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Submission #2').first()).toBeVisible();
  });

  test('21-22. PM approves Submission #2 as Approved Baseline v1', async ({ page }) => {
    await login(page, PM);
    await page.goto(`/projects/${PROJECT}/schedule-review`);
    await expect(page.locator('text=Submission #2').first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.locator('text=Approved Baseline v1')).toBeVisible();
    const confirmBtn = page.locator('#schedule-review-comment-title').locator('..').getByRole('button', { name: 'Approve', exact: true });
    await confirmBtn.click();

    await expect(page.locator('text=Approved Baseline').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Request Changes', exact: true })).toHaveCount(0);
  });

  // Simplification Phase 3D.1 (live approved-commitment projection): proves
  // the just-approved Baseline is reflected in the BULK Dashboard read path
  // (useAllRows -> useScheduleCommitmentProjection -> the real Supabase
  // rows), not just in the single-project Schedule Review page tested
  // above. Before approval, this project's Opening Readiness field would
  // show one of the CONTRACTOR_MANAGED pre-commitment labels (Awaiting
  // Contractor Schedule / Awaiting PM Review / Schedule Changes Required —
  // openingStatusLabel.js). Once genuinely APPROVED, the label adapter
  // falls through to the real engine status instead — this only happens if
  // the live batch projection actually flipped commitmentState to
  // COMMITTED for THIS project, not merely that some default text changed.
  test('22.5. Live commitment projection: Dashboard reflects the just-Approved Baseline (Phase 3D.1)', async ({ page }) => {
    await login(page, PM);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const row = page.locator(`[data-testid="dashboard-master-project"][data-project-id="${PROJECT}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();

    const drawer = page.locator('.dashboard-project-overview');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const block = drawer.locator('.dashboard-detail-field').filter({ hasText: 'Opening readiness' });
    await expect(block).toBeVisible({ timeout: 5_000 });
    const status = (await block.locator('dd').innerText()).trim();

    expect(status).not.toBe('');
    expect(status).not.toMatch(/Awaiting|Changes Required/);
  });

  test('23-24. Contractor Draft becomes read-only and Scope-edit is blocked after approval', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.getByText(/Approved Baseline/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Save Draft/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toHaveCount(0);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
  });

  test('25-26. Submission #1 remains Changes Requested; Submission #2 remains Approved', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.getByText(/Approved Baseline/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Submission history')).toBeVisible();
    await expect(page.locator('text=Submission #1 — Changes Requested')).toBeVisible();
    await expect(page.locator('text=/Submission #2 — Approved/')).toBeVisible();
  });

  test('27. Selecting each history entry loads the correct immutable dates', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Submission history')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /Submission #1/ }).click();
    await expect(page.locator('text=Submission #1').first()).toBeVisible();
    // Submission #1's snapshot holds the ORIGINAL MEP Electrical dates
    // (2027-01-11..15), never the post-Request-Changes edit (2027-01-25..29).
    await page.locator('span[title="MEP Electrical"]').first().click();
    await expect(page.locator('input[type="date"]')).toHaveCount(0); // read-only, no edit surface at all

    await page.getByRole('button', { name: /Submission #2/ }).click();
    await expect(page.locator('text=Submission #2').first()).toBeVisible();
  });

  test('28. Contractor cannot reach PM decision actions through a guessed route', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/projects/${PROJECT}/schedule-review`);
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 10_000 });
  });

  test('29. PM cannot reach the editable Contractor Draft through a guessed route', async ({ page }) => {
    await login(page, PM);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    // Blocked at the route-permission layer (rolePermissions.js: PM's list
    // never includes 'contractor_schedule') before ContractorSchedule.jsx
    // even mounts — a stronger guarantee than the page's own role check.
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Save Draft/ })).toHaveCount(0);
  });

  test('30. Unassigned Contractor cannot access this project\'s schedule at all', async ({ page }) => {
    await login(page, CONTRACTOR_UNASSIGNED);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.locator('text=Project not found')).toBeVisible({ timeout: 15_000 });
  });

  test('31. Existing AUTO_GENERATED project remains unaffected', async ({ page }) => {
    await login(page, PM);
    await page.goto('/projects');
    // AUTO_GENERATED projects never expose a Schedule Review entry — the
    // Dashboard link itself is conditional on isContractorManaged().
    await page.goto(`/projects/900001/schedule-review`);
    await expect(page.locator('text=Schedule Review unavailable')).toBeVisible({ timeout: 15_000 });
  });

  test('32. Mobile Contractor workflow remains usable', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT}`);
    await expect(page.getByText(/Approved Baseline/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Submission history')).toBeVisible();
    await expect(page.locator('text=Scheduled WPs:')).toBeVisible();
  });
});
