import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

// Simplification Phase 3D.2 — bounded end-to-end proof that the normal
// Create Project UI path produces a fully-usable CONTRACTOR_MANAGED project:
// PM/Admin creates a project through the ordinary "Add New Project" form (no
// ownership selector, no automatic Gantt) -> an assigned Contractor opens the
// Schedule Workspace and finds every active Scope WP materialized unscheduled
// -> the Contractor enters a Start/Finish for one WP and Save Draft succeeds.
//
// Deliberately stops at Save Draft — the full Submit -> Request Changes ->
// Resubmit -> Approve lifecycle is already covered end-to-end by
// contractor-schedule-submission-workflow.spec.js (Phase 4B.2) and is out of
// scope for this phase (Phase 3D.3).

const UNIQUE_CODE = `3D2-E2E-${Date.now()}`;

test.describe('Create Contractor-Managed Project workflow (Simplification Phase 3D.2)', () => {
  test('PM creates a project through the normal UI; assigned Contractor opens Workspace and saves a Draft', async ({ page }) => {
    // ── 1. Admin creates the project through the ordinary Create Project form ──
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await expect(page.locator('h1')).toContainText('Portfolio');

    await page.getByRole('button', { name: 'Add New Project' }).click();
    const createDialog = page.getByRole('dialog');

    // No ownership selector exists anywhere in this form.
    await expect(createDialog.locator('select[name="scheduleOwnershipMode"]')).toHaveCount(0);
    await expect(createDialog.getByText('Contractor Managed', { exact: false })).toHaveCount(0);

    await createDialog.locator('input[name="storeCode"]').fill(UNIQUE_CODE);
    await createDialog.locator('input[name="country"]').fill('Testland');
    await createDialog.locator('input[name="city"]').fill('Testville');
    await createDialog.getByRole('button', { name: 'Mall', exact: true }).click();
    await createDialog.locator('input[name="shoppingMallName"]').fill('Phase 3D.2 E2E Mall');

    await createDialog.getByRole('button', { name: 'Create Project' }).click();

    // Atomic RPC path: success, no automatic-Gantt error toast (there is
    // nothing to regenerate — the new path never calls generateAndSaveGantt).
    await expect(page.locator('text=Project created.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=schedule could not be regenerated')).toHaveCount(0);
    await expect(createDialog).toBeHidden({ timeout: 15_000 });

    const row = page.locator('[data-testid="portfolio-master-project"]', { hasText: UNIQUE_CODE });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // ── 2. Dashboard reflects the new project as Awaiting Contractor Schedule ──
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Project Dashboard', { timeout: 10_000 });
    const dashboardRow = page.locator('[data-testid="dashboard-master-project"]', { hasText: UNIQUE_CODE });
    await expect(dashboardRow).toBeVisible({ timeout: 15_000 });
    await dashboardRow.click();
    await expect(page.locator('.dashboard-project-overview')).toBeVisible();
    await expect(page.locator('.dashboard-project-overview')).toContainText('Awaiting Contractor Schedule');

    // ── 3. Admin assigns the fixture Contractor to the new project ──────────
    await page.goto('/admin/users');
    await expect(page.locator('h1')).toContainText('User Management', { timeout: 10_000 });
    const contractorCard = page.locator('.admin-user-card', { has: page.locator('.admin-user-email', { hasText: CREDENTIALS.contractor.email }) });
    await expect(contractorCard).toBeVisible({ timeout: 15_000 });
    const projectRow = contractorCard.locator('.admin-project-row', { has: page.locator('.admin-project-code', { hasText: UNIQUE_CODE }) });
    await expect(projectRow).toBeVisible({ timeout: 10_000 });
    await projectRow.locator('input[type="checkbox"]').check();
    await contractorCard.getByRole('button', { name: /Save changes/ }).click();
    await expect(contractorCard.getByRole('button', { name: '✓ Saved' })).toBeVisible({ timeout: 10_000 });
    await logout(page);

    // ── 4. Contractor opens the Schedule Workspace: every active Scope WP is
    //       materialized, unscheduled (no bar, no dates) ────────────────────
    await login(page, CREDENTIALS.contractor);
    await page.locator('.contractor-project-card, .contractor-no-projects').first().waitFor({ timeout: 15_000 });
    const contractorCardOnSelect = page.locator('.contractor-project-card', { hasText: UNIQUE_CODE });
    await expect(contractorCardOnSelect).toBeVisible({ timeout: 10_000 });
    await expect(contractorCardOnSelect.getByRole('button', { name: 'Schedule' })).toBeVisible();
    await contractorCardOnSelect.getByRole('button', { name: 'Schedule' }).click();

    await expect(page.locator('text=Phase 3D.2 E2E Mall')).toBeVisible({ timeout: 15_000 });

    // ── 5. Enter a Start/Finish for one WP and Save Draft — stops here,
    //       Submit/Approve is Phase 4B.2's own certified lifecycle ──────────
    // Every materialized WP row's name is rendered as `span[title={wp.label}]`
    // (GanttChart.jsx) — deliberately not asserting a specific label here
    // (the resolved default template depends on the Admin fixture's company,
    // not a hardcoded WP list), just that at least one unscheduled row exists
    // and is clickable.
    const firstWpRow = page.locator('span[title]').first();
    await expect(firstWpRow).toBeVisible({ timeout: 10_000 });
    await firstWpRow.click();

    const startInput = page.locator('input[type="date"]').nth(0);
    const finishInput = page.locator('input[type="date"]').nth(1);
    await expect(startInput).toBeVisible({ timeout: 5000 });
    await expect(startInput).toHaveValue('');
    await expect(finishInput).toHaveValue('');

    await startInput.fill('2027-02-01');
    await finishInput.fill('2027-02-03');
    await expect(page.locator('text=Unsaved changes').first()).toBeVisible({ timeout: 5000 });

    const saveBtn = page.getByRole('button', { name: /Save Draft/ });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10_000 });
  });
});
