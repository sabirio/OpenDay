import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { CREDENTIALS, login, logout } from './helpers.js';

// Simplification Phase 3D.2.1 — atomic Contractor-Managed Scope
// synchronization, exercised end-to-end through the real UI (not just the DB
// certification in scripts/certification/certifyContractorManagedScopeSync.mjs):
//
//   1. PM/Admin edits Scope during DRAFT (removes then re-adds a whole
//      zone's work packages via the Configure Project Scope dialog) -> the
//      Contractor Schedule Workspace's visible WP set updates to match,
//      with no data loss for retained WPs.
//   2. Once the schedule is submitted (PENDING_REVIEW), the same Scope edit
//      is rejected with a clear message, and neither Scope nor the schedule
//      rows are touched by the rejected attempt.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function serviceLikeAdminClient() {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword(CREDENTIALS.admin);
  expect(error).toBeNull();
  return client;
}

async function createAndAssignProject(page, client) {
  const storeCode = `3D2-1-E2E-${Date.now()}`;
  await page.goto('/projects');
  await expect(page.locator('h1')).toContainText('Portfolio');
  await page.getByRole('button', { name: 'Add New Project' }).click();
  const createDialog = page.getByRole('dialog', { name: 'New Project' });
  await createDialog.locator('input[name="storeCode"]').fill(storeCode);
  await createDialog.locator('input[name="country"]').fill('Testland');
  await createDialog.getByRole('button', { name: 'Create Project' }).click();
  await expect(page.locator('text=Project created.')).toBeVisible({ timeout: 15_000 });
  await expect(createDialog).toBeHidden({ timeout: 15_000 });

  const { data: project } = await client.from('projects').select('id').eq('store_code', storeCode).single();

  await page.goto('/admin/users');
  await expect(page.locator('h1')).toContainText('User Management', { timeout: 10_000 });
  const contractorCard = page.locator('.admin-user-card', { has: page.locator('.admin-user-email', { hasText: CREDENTIALS.contractor.email }) });
  const projectRow = contractorCard.locator('.admin-project-row', { has: page.locator('.admin-project-code', { hasText: storeCode }) });
  await expect(projectRow).toBeVisible({ timeout: 10_000 });
  await projectRow.locator('input[type="checkbox"]').check();
  await contractorCard.getByRole('button', { name: /Save changes/ }).click();
  await expect(contractorCard.getByRole('button', { name: '✓ Saved' })).toBeVisible({ timeout: 10_000 });

  return { storeCode, projectId: project.id };
}

async function openEditDialog(page, storeCode) {
  await page.goto('/projects');
  await expect(page.locator('h1')).toContainText('Portfolio');
  const row = page.locator('[data-testid="portfolio-master-project"]', { hasText: storeCode });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await page.locator('.portfolio-detail-header button', { hasText: 'Edit Project' }).click();
  return page.getByRole('dialog', { name: 'Edit Project' });
}

async function scheduleEveryVisibleWP(page, date = '2027-01-01') {
  const rows = page.locator('span[title]');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await rows.nth(i).click();
    const startInput = page.locator('input[type="date"]').nth(0);
    const finishInput = page.locator('input[type="date"]').nth(1);
    await expect(startInput).toBeVisible({ timeout: 5000 });
    if (!(await startInput.inputValue())) {
      await startInput.fill(date);
      await finishInput.fill(date);
    }
  }
}

test.describe('Contractor-Managed Scope Edit workflow (Simplification Phase 3D.2.1)', () => {
  test('PM edits Scope during DRAFT: removing then re-adding a zone synchronizes the Contractor Workspace', async ({ page }) => {
    const client = await serviceLikeAdminClient();
    await login(page, CREDENTIALS.admin);
    const { storeCode, projectId } = await createAndAssignProject(page, client);

    const { count: baselineActive } = await client
      .from('project_gantt_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('is_archived', false);
    expect(baselineActive).toBeGreaterThan(0);

    // ── Remove: uncheck the first zone in Configure Project Scope ──────────
    let editDialog = await openEditDialog(page, storeCode);
    await editDialog.getByRole('button', { name: 'Configure Project Scope' }).click();
    let scopeDialog = page.getByRole('dialog', { name: 'Configure Project Scope' });
    await expect(scopeDialog).toBeVisible();
    const firstZoneCheckbox = scopeDialog.locator('input[type="checkbox"]').first();
    await expect(firstZoneCheckbox).toBeChecked();
    await firstZoneCheckbox.uncheck();
    await scopeDialog.getByRole('button', { name: 'Save Scope' }).click();
    await editDialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('text=Project updated.')).toBeVisible({ timeout: 15_000 });

    const { count: afterRemoveActive } = await client
      .from('project_gantt_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('is_archived', false);
    expect(afterRemoveActive).toBeLessThan(baselineActive);
    const { count: archivedCount } = await client
      .from('project_gantt_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('is_archived', true);
    expect(archivedCount).toBe(baselineActive - afterRemoveActive);

    // ── Contractor Workspace reflects the smaller active Scope ──────────────
    await logout(page);
    await login(page, CREDENTIALS.contractor);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    const contractorCardOnSelect = page.locator('.contractor-project-card', { hasText: storeCode });
    await contractorCardOnSelect.getByRole('button', { name: 'Schedule' }).click();
    await expect(page.locator('span[title]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('span[title]')).toHaveCount(afterRemoveActive);
    // ContractorSchedule is a standalone field-mode page with no nav bar/Sign
    // out button by design — navigate away before logging out.
    await page.goto('/');
    await logout(page);

    // ── Re-add: re-check the same zone; it must unarchive, not duplicate ────
    await login(page, CREDENTIALS.admin);
    editDialog = await openEditDialog(page, storeCode);
    await editDialog.getByRole('button', { name: 'Configure Project Scope' }).click();
    scopeDialog = page.getByRole('dialog', { name: 'Configure Project Scope' });
    await expect(scopeDialog).toBeVisible();
    await scopeDialog.locator('input[type="checkbox"]').first().check();
    await scopeDialog.getByRole('button', { name: 'Save Scope' }).click();
    await editDialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('text=Project updated.')).toBeVisible({ timeout: 15_000 });

    const { count: afterReAddActive } = await client
      .from('project_gantt_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('is_archived', false);
    expect(afterReAddActive).toBe(baselineActive);
    const { count: totalRows } = await client
      .from('project_gantt_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    expect(totalRows).toBe(baselineActive); // no duplicate rows from the re-add

    await logout(page);
    await login(page, CREDENTIALS.contractor);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    await page.locator('.contractor-project-card', { hasText: storeCode }).getByRole('button', { name: 'Schedule' }).click();
    await expect(page.locator('span[title]')).toHaveCount(baselineActive, { timeout: 15_000 });
    await page.goto('/');
  });

  test('Locked Scope: PM cannot edit Scope once the schedule is Pending Review', async ({ page }) => {
    const client = await serviceLikeAdminClient();
    await login(page, CREDENTIALS.admin);
    const { storeCode, projectId } = await createAndAssignProject(page, client);
    await logout(page);

    await login(page, CREDENTIALS.contractor);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    await page.locator('.contractor-project-card', { hasText: storeCode }).getByRole('button', { name: 'Schedule' }).click();
    await expect(page.locator('span[title]').first()).toBeVisible({ timeout: 15_000 });
    await scheduleEveryVisibleWP(page);
    await page.getByRole('button', { name: /Save Draft/ }).click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Submit Schedule' })).toBeEnabled({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Submit Schedule' }).click();
    await page.locator('#submit-schedule-title').locator('..').getByRole('button', { name: 'Submit Schedule' }).click();
    await expect(page.getByRole('button', { name: /Save Draft/ })).toHaveCount(0, { timeout: 10_000 });
    await page.goto('/');
    await logout(page);

    const scopeBefore = (await client.from('projects').select('scope').eq('id', projectId).single()).data.scope;
    const { data: tasksBefore } = await client.from('project_gantt_tasks').select('wp_id, is_archived').eq('project_id', projectId).order('wp_id');

    await login(page, CREDENTIALS.admin);
    const editDialog = await openEditDialog(page, storeCode);
    await editDialog.getByRole('button', { name: 'Configure Project Scope' }).click();
    const scopeDialog = page.getByRole('dialog', { name: 'Configure Project Scope' });
    await expect(scopeDialog).toBeVisible();
    await scopeDialog.locator('input[type="checkbox"]').first().uncheck();
    await scopeDialog.getByRole('button', { name: 'Save Scope' }).click();

    // Assert directly on the RPC's own network response rather than racing a
    // transient toast — deterministic proof the sync command was actually
    // called and actually rejected, not just that some UI text briefly
    // appeared (or a client-side decision skipped calling it at all).
    const [scopeSyncResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/rpc/update_contractor_managed_project_scope')),
      editDialog.getByRole('button', { name: 'Save Changes' }).click(),
    ]);
    expect(scopeSyncResponse.ok()).toBe(false);
    const scopeSyncBody = await scopeSyncResponse.json();
    expect(scopeSyncBody.message || '').toContain('SCHEDULE_PENDING_REVIEW');

    await expect(page.locator('text=Scope cannot be edited while the schedule is pending review.')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Project updated.')).toHaveCount(0);

    const scopeAfter = (await client.from('projects').select('scope').eq('id', projectId).single()).data.scope;
    const { data: tasksAfter } = await client.from('project_gantt_tasks').select('wp_id, is_archived').eq('project_id', projectId).order('wp_id');
    expect(JSON.stringify(scopeAfter)).toBe(JSON.stringify(scopeBefore));
    expect(JSON.stringify(tasksAfter)).toBe(JSON.stringify(tasksBefore));
  });
});
