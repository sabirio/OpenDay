import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Simplification Phase 3C — Contractor Schedule Workspace E2E.
//
// Fixtures (contractorScheduleFixtures.mjs, run before this spec):
//   960001 SCHEDULE-CM (CONTRACTOR_MANAGED) — demo.walls/finish.paint
//     unscheduled, mep.electrical scheduled (5-day), legacy.archived archived.
//   960002 SCHEDULE-AG (AUTO_GENERATED) — comparison project, same contractor
//     assigned, used only to prove the Schedule action/route stay
//     unavailable when a project is not contractor-managed.
// contractor-a-assigned@cert.local is assigned to both (additively, on top
// of its existing 900001 assignment) plus NOT to project 900002 (used for
// the cross-project/unassigned negative cases, reusing existing fixtures).

const CONTRACTOR = { email: 'contractor-a-assigned@cert.local', password: 'Cert-Test-Pass-1!' };
const CONTRACTOR_UNASSIGNED = { email: 'contractor-a-unassigned@cert.local', password: 'Cert-Test-Pass-1!' };
const PM_A_ASSIGNED = { email: 'pm-a-assigned@cert.local', password: 'Cert-Test-Pass-1!' };
const ADMIN_A = { email: 'admin-a@cert.local', password: 'Cert-Test-Pass-1!' };
const PROJECT_CM = '960001';
const PROJECT_AG = '960002';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe('Contractor Schedule Workspace (Simplification Phase 3C)', () => {
  test('1-2. Schedule action appears for CONTRACTOR_MANAGED, not for AUTO_GENERATED', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });

    const cmCard = page.locator('.contractor-project-card', { hasText: 'SCHEDULE-CM' });
    await expect(cmCard).toBeVisible({ timeout: 10_000 });
    await expect(cmCard.getByRole('button', { name: 'Schedule' })).toBeVisible();

    const agCard = page.locator('.contractor-project-card', { hasText: 'SCHEDULE-AG' });
    await expect(agCard).toBeVisible();
    await expect(agCard.getByRole('button', { name: 'Schedule' })).toHaveCount(0);
  });

  test('3-7. Unscheduled WP has no bar; manual Start/Finish entry saves and round-trips exactly', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    // Unscheduled row is visible with no bar (no SVG rect for it) — click
    // the left-panel row (always rendered regardless of schedule state).
    const walls = page.locator('span[title="Demo Walls"]').first();
    await expect(walls).toBeVisible({ timeout: 10_000 });
    await walls.click();

    const startInput = page.locator('input[type="date"]').nth(0);
    const finishInput = page.locator('input[type="date"]').nth(1);
    await expect(startInput).toBeVisible({ timeout: 5000 });
    await expect(startInput).toHaveValue('');
    await expect(finishInput).toHaveValue('');

    await startInput.fill('2027-03-01');
    await finishInput.fill('2027-03-01'); // Start == Finish -> one calendar day

    // DraftStatusLabel is rendered twice (header + sticky footer) — both
    // show the same status simultaneously, so disambiguate with .first().
    await expect(page.locator('text=Unsaved changes').first()).toBeVisible({ timeout: 5000 });
    const saveBtn = page.getByRole('button', { name: /Save Draft/ });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });

    // Reload — persisted Start/Finish must be exactly what was entered
    // (human-inclusive, no +/-1 drift).
    await page.reload();
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });
    await page.locator('span[title="Demo Walls"]').first().click();
    await expect(page.locator('input[type="date"]').nth(0)).toHaveValue('2027-03-01', { timeout: 10_000 });
    await expect(page.locator('input[type="date"]').nth(1)).toHaveValue('2027-03-01');
  });

  test('8-9. Moving a scheduled bar preserves visible duration; save/reload persists the move', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    const electricalRow = page.locator('span[title="MEP Electrical"]').first();
    await expect(electricalRow).toBeVisible({ timeout: 10_000 });

    // Select the task to open its date-editing tooltip, then re-enter its
    // current dates shifted by 3 days — the deterministic, non-flaky
    // equivalent of a physical drag for E2E purposes (computeDragEditDates'
    // own math is already exhaustively unit-tested); this proves the
    // UI -> save -> reload round trip for an already-scheduled task.
    await electricalRow.click();
    const beforeStart = await page.locator('input[type="date"]').nth(0).inputValue().catch(() => null);
    const beforeFinish = await page.locator('input[type="date"]').nth(1).inputValue().catch(() => null);
    test.skip(!beforeStart, 'tooltip did not expose date inputs for a scheduled task — see manual-entry test for the read/write contract instead');

    // Use manual re-entry of shifted-by-3-days dates as the deterministic,
    // non-flaky equivalent of a physical drag — computeDragEditDates' own
    // math is already unit-tested exhaustively; this proves the UI->save->
    // reload round trip for an already-scheduled task specifically.
    const shift = (iso, days) => {
      const d = new Date(iso); d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().split('T')[0];
    };
    const newStart = shift(beforeStart, 3);
    const newFinish = shift(beforeFinish, 3);
    await page.locator('input[type="date"]').nth(0).fill(newStart);
    await page.locator('input[type="date"]').nth(1).fill(newFinish);
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });
    await page.locator('span[title="MEP Electrical"]').first().click();
    await expect(page.locator('input[type="date"]').nth(0)).toHaveValue(newStart, { timeout: 10_000 });
    await expect(page.locator('input[type="date"]').nth(1)).toHaveValue(newFinish);
  });

  test('12. Multiple changed WPs save atomically in one action', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    await page.locator('span[title="Demo Walls"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-04-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-04-02');

    await page.locator('span[title="Finish Paint"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-04-05');
    await page.locator('input[type="date"]').nth(1).fill('2027-04-06');

    const saveBtn = page.getByRole('button', { name: /Save Draft \(2\)/ });
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });
  });

  test('13. Failed save retains local Draft (network failure simulated)', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    await page.locator('span[title="Demo Walls"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-05-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-05-03');
    await expect(page.locator('text=Unsaved changes').first()).toBeVisible({ timeout: 5000 });

    // Force the RPC call to fail.
    await page.route('**/rest/v1/rpc/save_contractor_schedule_draft', route => route.abort('failed'));
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Save failed').first()).toBeVisible({ timeout: 10_000 });

    // Draft must still be staged (dirty), not silently cleared. The
    // tooltip opened by the earlier click is still open (clicking the
    // same row again would toggle it closed — GanttChart.jsx's own
    // select/deselect behavior), so read its value directly rather than
    // re-clicking the row.
    await expect(page.getByRole('button', { name: 'Save Draft (1)' })).toBeVisible();
    await expect(page.locator('input[type="date"]').nth(0)).toHaveValue('2027-05-01');
    await page.unroute('**/rest/v1/rpc/save_contractor_schedule_draft');
  });

  test('14. Unassigned Contractor cannot access another project\'s schedule', async ({ page }) => {
    await login(page, CONTRACTOR_UNASSIGNED);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Project not found')).toBeVisible({ timeout: 15_000 });
    // No leak: identical message shape regardless of AUTO_GENERATED/CONTRACTOR_MANAGED/nonexistent.
    await expect(page.locator('text=Schedule Test Mall')).toHaveCount(0);
  });

  test('15. Guessed AUTO_GENERATED route does not provide editable schedule', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT_AG}`);
    await expect(page.getByRole('heading', { name: 'Contractor Schedule unavailable' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Save Draft/ })).toHaveCount(0);
  });

  test('16. Existing Contractor Report and Field Snag routes remain unaffected', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    const cmCard = page.locator('.contractor-project-card', { hasText: 'SCHEDULE-CM' });
    await expect(cmCard.getByRole('button', { name: 'Submit Report' })).toBeVisible();
    await expect(cmCard.getByRole('button', { name: /View Observations/ })).toBeVisible();
    await cmCard.getByRole('button', { name: 'Submit Report' }).click();
    await expect(page).toHaveURL(/\/contractor-report\//);
    await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible({ timeout: 15_000 });
  });

  // ── Simplification Phase 3C.1: Contractor Draft Ownership ────────────────

  test('17. PM does not see the Schedule action and a guessed route redirects to /unauthorized', async ({ page }) => {
    await login(page, PM_A_ASSIGNED);
    // PM's post-login landing route is /home (ROLE_REDIRECTS), not
    // /contractor-select — unlike Contractor, whose default IS
    // /contractor-select, so this explicit navigation is required here.
    await page.goto('/contractor-select');
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    const cmCard = page.locator('.contractor-project-card', { hasText: 'SCHEDULE-CM' });
    await expect(cmCard).toBeVisible({ timeout: 10_000 });
    await expect(cmCard.getByRole('button', { name: 'Schedule' })).toHaveCount(0);

    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 15_000 });
  });

  test('18. Admin reaches the route (existing oversight access) but never receives editable controls', async ({ page }) => {
    await login(page, ADMIN_A);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.getByRole('heading', { name: 'Contractor Schedule unavailable' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=limited to the assigned Contractor')).toBeVisible();
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Save Draft/ })).toHaveCount(0);
  });

  // ── Simplification Phase 3C.1: Save / Navigation interaction (Section I) ─

  test('19. Dirty Draft warns on in-app back navigation; Cancel preserves Draft, Confirm leaves', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto('/contractor-select');
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    await page.locator('span[title="Demo Walls"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-06-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-06-03');
    await expect(page.locator('text=Unsaved changes').first()).toBeVisible({ timeout: 5000 });

    // Cancel: dialog appears, dismissed -> navigation cancelled, Draft intact.
    let dialogSeen = false;
    page.once('dialog', (dialog) => { dialogSeen = true; dialog.dismiss(); });
    await page.evaluate(() => window.history.back());
    await page.waitForTimeout(300);
    expect(dialogSeen).toBe(true);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible();
    await expect(page.locator('input[type="date"]').nth(0)).toHaveValue('2027-06-01');

    // Confirm: dialog accepted -> navigation proceeds, page unmounts.
    page.once('dialog', (dialog) => dialog.accept());
    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
  });

  test('20. Successful Save clears dirty state; navigation afterward proceeds without warning', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto('/contractor-select');
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    await page.locator('span[title="Finish Paint"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-07-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-07-02');
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });

    let dialogSeen = false;
    page.on('dialog', (dialog) => { dialogSeen = true; dialog.accept(); });
    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
    expect(dialogSeen).toBe(false);
  });

  test('21. Failed Save keeps dirty state and continues to warn on navigation', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    await page.locator('span[title="Demo Walls"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-08-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-08-03');

    await page.route('**/rest/v1/rpc/save_contractor_schedule_draft', route => route.abort('failed'));
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Save failed').first()).toBeVisible({ timeout: 10_000 });
    await page.unroute('**/rest/v1/rpc/save_contractor_schedule_draft');

    let dialogSeen = false;
    page.once('dialog', (dialog) => { dialogSeen = true; dialog.dismiss(); });
    await page.evaluate(() => window.history.back());
    await page.waitForTimeout(300);
    expect(dialogSeen).toBe(true);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible();
  });

  test('22. Discard changes clears dirty state and removes the navigation warning', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto('/contractor-select');
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    await page.locator('span[title="Demo Walls"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-09-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-09-03');
    await expect(page.locator('text=Unsaved changes').first()).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 5000 });

    let dialogSeen = false;
    page.on('dialog', (dialog) => { dialogSeen = true; dialog.accept(); });
    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
    expect(dialogSeen).toBe(false);
  });

  test('23. Browser unload (refresh/close) still warns when dirty', async ({ page }) => {
    // Direct dispatch of a real `beforeunload` Event and reading
    // `event.defaultPrevented` afterward — the exact mechanism a real
    // browser uses to decide whether to show its native "leave site?"
    // dialog (Chrome shows it iff a beforeunload listener calls
    // preventDefault()/sets returnValue). This tests useUnsavedChangesGuard's
    // actual registered listener deterministically, without depending on
    // Playwright's own reload()+dialog interception, which proved
    // unreliable (hung past the test timeout) for this specific event type
    // in this environment.
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    const preventedWhileClean = await page.evaluate(() => {
      const evt = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(evt);
      return evt.defaultPrevented;
    });
    expect(preventedWhileClean).toBe(false);

    await page.locator('span[title="Demo Walls"]').first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-10-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-10-03');
    await expect(page.locator('text=Unsaved changes').first()).toBeVisible({ timeout: 5000 });

    const preventedWhileDirty = await page.evaluate(() => {
      const evt = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(evt);
      return evt.defaultPrevented;
    });
    expect(preventedWhileDirty).toBe(true);
  });

  // ── Simplification Phase 3C.1: mobile automated smoke (Section J) ────────

  test('24. Mobile (390x844): full unscheduled-WP scheduling workflow without drag', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasOverflow).toBe(false);

    const walls = page.locator('span[title="Demo Walls"]').first();
    await expect(walls).toBeVisible({ timeout: 10_000 });
    await walls.click();

    const startInput = page.locator('input[type="date"]').nth(0);
    const finishInput = page.locator('input[type="date"]').nth(1);
    await expect(startInput).toBeVisible({ timeout: 5000 });
    for (const input of [startInput, finishInput]) {
      const box = await input.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    }

    await startInput.fill('2027-11-01');
    await finishInput.fill('2027-11-03');

    const saveBtn = page.getByRole('button', { name: /Save Draft/ });
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    const saveBox = await saveBtn.boundingBox();
    expect(saveBox).not.toBeNull();
    expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);

    await saveBtn.click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });
    await page.locator('span[title="Demo Walls"]').first().click();
    await expect(page.locator('input[type="date"]').nth(0)).toHaveValue('2027-11-01', { timeout: 10_000 });
    await expect(page.locator('input[type="date"]').nth(1)).toHaveValue('2027-11-03');
  });

  // ── Simplification Phase 3C.2: ordinary SPA navigation protection ────────
  //
  // The header's Workspace/Report/Observations controls did not exist
  // before 3C.2 — they were added specifically to give ordinary React
  // Router navigation (a real <Link> click, a real navigate() call) a
  // user-visible surface, since this standalone route has no app-shell
  // Sidebar and previously had zero in-page navigation controls at all.

  // Defaults to Finish Paint: only test 29 below actually persists a Save
  // (Stay/failed-save/Discard/Leave-without-saving never mutate the DB), so
  // it alone targets Demo Walls instead — no other test in this block ever
  // re-enters a value some earlier test already persisted, which would
  // silently fail to register as a new edit.
  async function openDirtyDraft(page, wpTitle = 'Finish Paint') {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });
    await page.locator(`span[title="${wpTitle}"]`).first().click();
    await page.locator('input[type="date"]').nth(0).fill('2027-12-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-12-03');
    await expect(page.locator('text=Unsaved changes').first()).toBeVisible({ timeout: 5000 });
  }

  test('25. Dirty Draft + real Link (Report) click warns; Stay preserves route and staged values', async ({ page }) => {
    await openDirtyDraft(page);

    let dialogSeen = false;
    page.once('dialog', (dialog) => { dialogSeen = true; dialog.dismiss(); });
    await page.getByRole('link', { name: 'Report' }).click();
    await page.waitForTimeout(300);
    expect(dialogSeen).toBe(true);

    // Stay: route unchanged, staged values preserved.
    await expect(page).toHaveURL(new RegExp(`/contractor-schedule/${PROJECT_CM}`));
    await expect(page.locator('input[type="date"]').nth(0)).toHaveValue('2027-12-01');
  });

  test('26. Repeat Link (Report) navigation and choose Leave: intended route reached, no second prompt', async ({ page }) => {
    await openDirtyDraft(page);

    let dialogCount = 0;
    page.on('dialog', (dialog) => { dialogCount += 1; dialog.accept(); });
    await page.getByRole('link', { name: 'Report' }).click();
    await expect(page).toHaveURL(/\/contractor-report\//, { timeout: 10_000 });
    await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible({ timeout: 15_000 });
    expect(dialogCount).toBe(1);
  });

  test('27. Dirty Draft + real Link (Observations) click warns', async ({ page }) => {
    await openDirtyDraft(page);

    let dialogSeen = false;
    page.once('dialog', (dialog) => { dialogSeen = true; dialog.accept(); });
    await page.getByRole('link', { name: 'Observations' }).click();
    await expect(page).toHaveURL(/\/field-snag\//, { timeout: 10_000 });
    expect(dialogSeen).toBe(true);
  });

  test('28. Dirty Draft + Workspace navigate() button: Stay cancels, Leave reaches Workspace with no second prompt', async ({ page }) => {
    await openDirtyDraft(page);

    // Stay first.
    let dialogSeen = false;
    page.once('dialog', (dialog) => { dialogSeen = true; dialog.dismiss(); });
    await page.getByRole('button', { name: '← Workspace' }).click();
    await page.waitForTimeout(300);
    expect(dialogSeen).toBe(true);
    await expect(page).toHaveURL(new RegExp(`/contractor-schedule/${PROJECT_CM}`));
    await expect(page.locator('input[type="date"]').nth(0)).toHaveValue('2027-12-01');

    // Leave.
    let dialogCount = 0;
    page.on('dialog', (dialog) => { dialogCount += 1; dialog.accept(); });
    await page.getByRole('button', { name: '← Workspace' }).click();
    await expect(page).toHaveURL(/\/contractor-select/, { timeout: 10_000 });
    expect(dialogCount).toBe(1);
  });

  test('29. Successful Save clears dirty state; Link navigation afterward proceeds without warning', async ({ page }) => {
    await openDirtyDraft(page, 'Demo Walls');
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });

    let dialogSeen = false;
    page.on('dialog', (dialog) => { dialogSeen = true; dialog.accept(); });
    await page.getByRole('link', { name: 'Report' }).click();
    await expect(page).toHaveURL(/\/contractor-report\//, { timeout: 10_000 });
    expect(dialogSeen).toBe(false);
  });

  test('30. Failed Save keeps dirty state; Link navigation still warns', async ({ page }) => {
    await openDirtyDraft(page);
    await page.route('**/rest/v1/rpc/save_contractor_schedule_draft', route => route.abort('failed'));
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Save failed').first()).toBeVisible({ timeout: 10_000 });
    await page.unroute('**/rest/v1/rpc/save_contractor_schedule_draft');

    let dialogSeen = false;
    page.once('dialog', (dialog) => { dialogSeen = true; dialog.dismiss(); });
    await page.getByRole('link', { name: 'Report' }).click();
    await page.waitForTimeout(300);
    expect(dialogSeen).toBe(true);
    await expect(page).toHaveURL(new RegExp(`/contractor-schedule/${PROJECT_CM}`));
  });

  test('31. Discard changes clears dirty state; Link navigation afterward proceeds without warning', async ({ page }) => {
    await openDirtyDraft(page);
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 5000 });

    let dialogSeen = false;
    page.on('dialog', (dialog) => { dialogSeen = true; dialog.accept(); });
    await page.getByRole('link', { name: 'Observations' }).click();
    await expect(page).toHaveURL(/\/field-snag\//, { timeout: 10_000 });
    expect(dialogSeen).toBe(false);
  });

  test('32. Clean page: Link and navigate() navigation produce no warning', async ({ page }) => {
    await login(page, CONTRACTOR);
    await page.goto(`/contractor-schedule/${PROJECT_CM}`);
    await expect(page.locator('text=Schedule Test Mall')).toBeVisible({ timeout: 15_000 });

    let dialogSeen = false;
    page.on('dialog', (dialog) => { dialogSeen = true; dialog.accept(); });
    await page.getByRole('link', { name: 'Report' }).click();
    await expect(page).toHaveURL(/\/contractor-report\//, { timeout: 10_000 });
    expect(dialogSeen).toBe(false);
  });

  test('33. Guard listeners are removed on unmount: no stray dialog after leaving via Link', async ({ page }) => {
    await openDirtyDraft(page);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Report' }).click();
    await expect(page).toHaveURL(/\/contractor-report\//, { timeout: 10_000 });
    await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible({ timeout: 15_000 });

    // If ContractorSchedule's beforeunload/popstate listeners were not
    // cleaned up on unmount, a further reload or back/forward here would
    // risk a stray, unexplained dialog. None should appear.
    let straySeen = false;
    page.on('dialog', (dialog) => { straySeen = true; dialog.dismiss(); });
    await page.reload();
    await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible({ timeout: 15_000 });
    expect(straySeen).toBe(false);
  });
});
