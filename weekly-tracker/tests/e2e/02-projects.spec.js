import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { CREDENTIALS, login, logout } from './helpers.js';

const UNIQUE_CODE = `TEST-${Date.now()}`;
const UNIQUE_STREET_CODE = `TEST-ST-${Date.now()}`;
const UNIQUE_SLICE_CODE = `TEST-SLICE1-${Date.now()}`;
const UNIQUE_AREA_CODE = `TEST-AREAS-${Date.now()}`;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

test.describe('Portfolio page', () => {
  test.afterAll(async () => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword(CREDENTIALS.admin);
    if (signInError) throw signInError;
    const { error } = await client.from('projects').delete().in('store_code', [
      UNIQUE_CODE,
      UNIQUE_STREET_CODE,
      UNIQUE_SLICE_CODE,
      UNIQUE_AREA_CODE,
    ]);
    if (error) throw error;
  });

  test.beforeEach(async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await expect(page.locator('h1')).toContainText('Portfolio');
  });

  test.afterEach(async ({ page }) => {
    // Navigate away first to close any open modals, then logout
    await page.goto('/');
    await logout(page);
  });

  test('loads the master-detail workspace: compact rows in the list pane, first project auto-selected in the details pane', async ({ page }) => {
    // Project List pane shows compact identity rows only (Store Code,
    // Location, City, Concept, Status) — not every Project field.
    const rows = page.locator('[data-testid="portfolio-master-project"]');
    await expect(rows.first()).toBeVisible();
    const rowText = await rows.first().textContent();
    expect(rowText).not.toContain('Project Manager');
    expect(rowText).not.toContain('GC Access');

    // Selection behavior (§Selection): on initial load the first visible
    // project is auto-selected, without requiring a click.
    await expect(rows.first()).toHaveClass(/is-selected/);
    await expect(page.locator('.detail-pane')).toBeVisible();
    await expect(page.locator('#project-detail-title')).toBeVisible();
  });

  test('Portfolio actions render in order: Add New Project, Import Projects, Export Projects', async ({ page }) => {
    // Projects IA v1: Add/Import/Export are the three project-lifecycle
    // entry actions living together on Portfolio (not a separate Import
    // product module) — "create one, create many, extract data" order.
    const header = page.locator('.page-header');
    const actionsText = await header.textContent();
    const addIndex = actionsText.indexOf('Add New Project');
    const importIndex = actionsText.indexOf('Import Projects');
    const exportIndex = actionsText.indexOf('Export Projects');
    expect(addIndex).toBeGreaterThan(-1);
    expect(importIndex).toBeGreaterThan(-1);
    expect(exportIndex).toBeGreaterThan(-1);
    expect(addIndex).toBeLessThan(importIndex);
    expect(importIndex).toBeLessThan(exportIndex);
  });

  test('Import Projects action navigates to the canonical /projects/import route', async ({ page }) => {
    await page.getByRole('link', { name: 'Import Projects' }).click();
    await expect(page).toHaveURL(/\/projects\/import$/);
    await expect(page.getByRole('heading', { name: 'Import Projects' })).toBeVisible();
  });

  test('opens new project form via Add New Project button', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();
    // Form should appear with Store Code field
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
  });

  test('create mode hides actual facts and status, preserves planned dates, and places Store Concept after the resolved location', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();
    const dialog = page.getByRole('dialog');

    await expect(dialog.locator('input[name="actualConstructionStartDate"]')).toHaveCount(0);
    await expect(dialog.locator('input[name="actualConstructionCompletionDate"]')).toHaveCount(0);
    await expect(dialog.locator('input[name="actualOpeningDate"]')).toHaveCount(0);
    await expect(dialog.getByText('Project Status', { exact: true })).toHaveCount(0);

    await expect(dialog.locator('input[name="constructionStartDate"]')).toBeVisible();
    await expect(dialog.locator('input[name="constructionEndDate"]')).toBeVisible();
    await expect(dialog.locator('input[name="targetOpeningDate"]')).toBeVisible();

    const concept = dialog.locator('input[name="storeConcept"]');
    await dialog.getByRole('button', { name: 'Mall', exact: true }).click();
    const mall = dialog.locator('input[name="shoppingMallName"]');
    await expect(mall).toBeVisible();
    expect(await mall.evaluate((el, other) => Boolean(el.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await concept.elementHandle()),
      'Store Concept should follow Shopping Mall Name in DOM order').toBeTruthy();

    await dialog.getByRole('button', { name: 'Street', exact: true }).click();
    const street = dialog.locator('input[name="street"]');
    await expect(street).toBeVisible();
    expect(await street.evaluate((el, other) => Boolean(el.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await concept.elementHandle()),
      'Store Concept should follow Street Address in DOM order').toBeTruthy();
  });

  test('creates a new Mall project and selecting its row preserves the location identity', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();

    await page.locator('input[name="storeCode"]').fill(UNIQUE_CODE);
    await page.locator('input[name="country"]').fill('Testland');
    await page.locator('input[name="city"]').fill('Testville');

    // Location Type toggle (not a <select>) — click the "Mall" option button.
    await page.getByRole('button', { name: 'Mall', exact: true }).click();
    await page.locator('input[name="shoppingMallName"]').fill('Playwright Test Mall');

    await page.getByRole('button', { name: 'Create Project' }).click();

    await expect(page.locator('input[name="storeCode"]')).not.toBeVisible({ timeout: 15_000 });

    const row = page.locator('[data-testid="portfolio-master-project"]', { hasText: UNIQUE_CODE });
    await expect(row).toContainText('Playwright Test Mall', { timeout: 15_000 });

    await row.click();
    await expect(page.locator('#project-detail-title')).toContainText(UNIQUE_CODE);
  });

  test('creates a new Street project and selecting its row preserves the street identity', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();

    await page.locator('input[name="storeCode"]').fill(UNIQUE_STREET_CODE);
    await page.locator('input[name="country"]').fill('Testland');
    await page.locator('input[name="city"]').fill('Testville');

    await page.getByRole('button', { name: 'Street', exact: true }).click();
    await page.locator('input[name="street"]').fill('Test Ave 1');

    await page.getByRole('button', { name: 'Create Project' }).click();

    await expect(page.locator('input[name="storeCode"]')).not.toBeVisible({ timeout: 15_000 });

    const row = page.locator('[data-testid="portfolio-master-project"]', { hasText: UNIQUE_STREET_CODE });
    await expect(row).toContainText('Test Ave 1', { timeout: 15_000 });

    await row.click();
    await expect(page.locator('#project-detail-title')).toContainText(UNIQUE_STREET_CODE);
  });

  test('switching Location Type from Mall to Street clears the stale mall name field', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();

    await page.getByRole('button', { name: 'Mall', exact: true }).click();
    await page.locator('input[name="shoppingMallName"]').fill('Should Be Cleared');

    await page.getByRole('button', { name: 'Street', exact: true }).click();
    await expect(page.locator('input[name="shoppingMallName"]')).not.toBeVisible();
    await expect(page.locator('input[name="street"]')).toHaveValue('');
  });

  test('selecting a project row shows Current Situation and the canonical action sequence', async ({ page }) => {
    const firstRow = page.locator('[data-testid="portfolio-master-project"]').first();
    const codeName = (await firstRow.locator('.master-row-top strong').textContent()).trim();
    await firstRow.click();

    const details = page.locator('.detail-pane');
    await expect(details).toBeVisible();
    await expect(page.locator('#project-detail-title')).toContainText(codeName);
    await expect(details).toContainText('Current situation');
    await expect(details).toContainText('Plan & Budget');
    await expect(details).toContainText('Tender');
    await expect(details).toContainText('Delivery');
    await expect(details).toContainText('Commercial Control');
    await expect(details).toContainText('Closeout');
  });

  test('switching the selected project updates only the details pane, preserving list scroll/selection semantics', async ({ page }) => {
    const rowCount = await page.locator('[data-testid="portfolio-master-project"]').count();
    test.skip(rowCount < 2, 'Need at least 2 projects to test switching selection');

    const rows = page.locator('[data-testid="portfolio-master-project"]');
    const firstCode = (await rows.nth(0).locator('.master-row-top strong').textContent()).trim();
    const secondCode = (await rows.nth(1).locator('.master-row-top strong').textContent()).trim();

    await expect(page.locator('#project-detail-title')).toContainText(firstCode);

    await rows.nth(1).click();
    await expect(rows.nth(1)).toHaveClass(/is-selected/);
    await expect(rows.nth(0)).not.toHaveClass(/is-selected/);
    await expect(page.locator('#project-detail-title')).toContainText(secondCode);

    // Both rows are still present — selecting another project does not
    // navigate away from Portfolio or drop the list.
    await expect(rows).toHaveCount(rowCount);
  });

  test('edit mode retains Actual Dates while Project Status remains system-owned', async ({ page }) => {
    await page.locator('[data-testid="portfolio-master-project"]').first().click();
    await expect(page.locator('.detail-pane')).toBeVisible();

    await page.locator('.portfolio-detail-header button', { hasText: 'Edit Project' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('input[name="storeCode"]')).toBeVisible();
    await expect(dialog.locator('input[name="actualConstructionStartDate"]')).toBeVisible();
    await expect(dialog.locator('input[name="actualConstructionCompletionDate"]')).toBeVisible();
    await expect(dialog.locator('input[name="actualOpeningDate"]')).toBeVisible();
    await expect(dialog.getByText('Project Status', { exact: true })).toHaveCount(0);
  });

  test('create persists derived Active status, planned dates, and Store Concept while actual dates remain blank', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();
    const createDialog = page.getByRole('dialog');

    await createDialog.locator('input[name="storeCode"]').fill(UNIQUE_SLICE_CODE);
    await createDialog.locator('input[name="country"]').fill('Testland');
    await createDialog.getByRole('button', { name: 'Mall', exact: true }).click();
    await createDialog.locator('input[name="shoppingMallName"]').fill('Slice One Mall');
    await createDialog.locator('input[name="storeConcept"]').fill('Flagship');
    await createDialog.locator('input[name="constructionStartDate"]').fill('2026-08-01');
    await createDialog.locator('input[name="constructionEndDate"]').fill('2026-10-15');
    await createDialog.locator('input[name="targetOpeningDate"]').fill('2026-11-01');
    await createDialog.getByRole('button', { name: 'Create Project' }).click();
    await expect(createDialog).toBeHidden({ timeout: 15_000 });

    const row = page.locator('[data-testid="portfolio-master-project"]', { hasText: UNIQUE_SLICE_CODE });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('Active');
    await row.click();
    await page.locator('.portfolio-detail-header button', { hasText: 'Edit Project' }).click();

    const editDialog = page.getByRole('dialog');
    await expect(editDialog.locator('input[name="constructionStartDate"]')).toHaveValue('2026-08-01');
    await expect(editDialog.locator('input[name="constructionEndDate"]')).toHaveValue('2026-10-15');
    await expect(editDialog.locator('input[name="targetOpeningDate"]')).toHaveValue('2026-11-01');
    await expect(editDialog.locator('input[name="storeConcept"]')).toHaveValue('Flagship');
    await expect(editDialog.locator('input[name="actualConstructionStartDate"]')).toHaveValue('');
    await expect(editDialog.locator('input[name="actualConstructionCompletionDate"]')).toHaveValue('');
    await expect(editDialog.locator('input[name="actualOpeningDate"]')).toHaveValue('');
    await expect(editDialog.getByText('Project Status', { exact: true })).toHaveCount(0);

    page.once('dialog', dialog => dialog.accept());
    await editDialog.getByRole('button', { name: 'Delete Project' }).click();
    await expect(editDialog).toBeHidden({ timeout: 15_000 });
  });

  test('new project captures areas once without a duplicate Project Scope editor', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();
    const createDialog = page.getByRole('dialog', { name: 'New Project' });

    await createDialog.locator('input[name="storeCode"]').fill(UNIQUE_AREA_CODE);
    await createDialog.locator('input[name="country"]').fill('Testland');
    await createDialog.locator('input[name="storeSizeSqm"]').fill('1100');
    await createDialog.locator('input[name="salesAreaSqm"]').fill('800');
    await createDialog.locator('input[name="backOfHouseAreaSqm"]').fill('150');
    await createDialog.locator('input[name="constructionStartDate"]').fill('2026-08-01');
    await createDialog.locator('input[name="constructionEndDate"]').fill('2026-12-15');

    await expect(createDialog.locator('input[name^="scope.zoneAreas."]')).toHaveCount(0);
    await expect(createDialog.getByRole('button', { name: 'Configure Project Scope' })).toHaveCount(0);

    await createDialog.getByRole('button', { name: 'Create Project' }).click();
    await expect(createDialog).toBeHidden({ timeout: 15_000 });

    const row = page.locator('[data-testid="portfolio-master-project"]', { hasText: UNIQUE_AREA_CODE });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await page.getByRole('button', { name: 'Edit Project' }).click();

    const editDialog = page.getByRole('dialog', { name: 'Edit Project' });
    await expect(editDialog.locator('input[name="storeSizeSqm"]')).toHaveValue('1100');
    await expect(editDialog.locator('input[name="salesAreaSqm"]')).toHaveValue('800');
    await expect(editDialog.locator('input[name="backOfHouseAreaSqm"]')).toHaveValue('150');
    await expect(editDialog.locator('input[name^="scope.zoneAreas."]')).toHaveCount(0);
    await expect(editDialog.getByRole('button', { name: 'Configure Project Scope' })).toHaveCount(0);

    page.once('dialog', dialog => dialog.accept());
    await editDialog.getByRole('button', { name: 'Delete Project' }).click();
    await expect(editDialog).toBeHidden({ timeout: 15_000 });
  });

  test('Add New Project does not show an Actual Cost input', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
    await expect(page.locator('input[name="actualCost"]')).toHaveCount(0);
  });

  test('Edit Project keeps Actual Cost outside the project profile', async ({ page }) => {
    await page.locator('[data-testid="portfolio-master-project"]').first().click();
    await page.locator('.portfolio-detail-header button', { hasText: 'Edit Project' }).click();
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
    await expect(page.locator('input[name="actualCost"]')).toHaveCount(0);
  });

  test('selected-project actions live in the Detail header', async ({ page }) => {
    const header = page.locator('.portfolio-detail-header');
    await expect(header.getByRole('button', { name: 'Edit Project' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Invite GC' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Site Visit' })).toBeVisible();
  });

  test('Invite GC Detail action opens invite modal', async ({ page }) => {
    await page.locator('.portfolio-detail-header').getByRole('button', { name: 'Invite GC' }).click();

    await expect(page.locator('.modal')).toBeVisible();
    await expect(page.locator('.modal input[type="email"], .modal input[placeholder*="email" i], .modal input[placeholder*="@"]')).toBeVisible();
  });

  test('search filter narrows the project list', async ({ page }) => {
    // Only run if there are multiple projects
    const rowCount = await page.locator('[data-testid="portfolio-master-project"]').count();
    test.skip(rowCount < 2, 'Need at least 2 projects to test filter');

    const firstCode = (await page.locator('[data-testid="portfolio-master-project"]').first().locator('.master-row-top strong').textContent()).trim();
    await page.getByPlaceholder('Search projects...').fill(firstCode);

    // Should see only rows matching that code
    await expect(page.locator('[data-testid="portfolio-master-project"]')).toHaveCount(1, { timeout: 5_000 });
  });

  test('search with no matches empties the list but preserves the selected project\'s details (Phase 4 cross-page consistency contract)', async ({ page }) => {
    // Projects.jsx's own selection logic (documented at its "Phase 4
    // cross-page consistency fix" comment) deliberately keeps the detail
    // pane showing the previously selected project as long as that project
    // still exists in the full (unfiltered) list — filtering must never
    // silently swap or clear the selected detail. A zero-result search is
    // exactly this case: the list empties, but the already-selected
    // project's identity is unaffected by the filter, so its details persist.
    const selectedTitle = (await page.locator('#project-detail-title').textContent()).trim();
    expect(selectedTitle.length).toBeGreaterThan(0);

    await page.getByPlaceholder('Search projects...').fill('ZZZ_NO_SUCH_PROJECT_ZZZ');

    await expect(page.locator('.master-pane-list')).toContainText('No projects match the current filters.');
    await expect(page.locator('[data-testid="portfolio-master-project"]')).toHaveCount(0);
    await expect(page.locator('.detail-pane')).toBeVisible();
    await expect(page.locator('#project-detail-title')).toContainText(selectedTitle);
    await expect(page.locator('.detail-pane')).not.toContainText('Select a project to view its details.');
  });

  test('Location Type filter narrows the project list to Mall projects only', async ({ page }) => {
    const rowCount = await page.locator('[data-testid="portfolio-master-project"]').count();
    test.skip(rowCount < 1, 'Need at least 1 project to test filter');

    // The Location Type <select> is the one whose options include "Mall"/"Street".
    await page.locator('.portfolio-filter-disclosure > summary').click();
    const locationTypeSelect = page.locator('select').filter({ has: page.locator('option[value="Mall"]') });
    await locationTypeSelect.selectOption('Mall');

    const rows = page.locator('[data-testid="portfolio-master-project"]');
    const count = await rows.count();
    const visibleCodes = await rows.locator('.master-row-top strong').allTextContents();
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword(CREDENTIALS.admin);
    expect(signInError).toBeNull();
    const { data, error } = await client.from('projects').select('store_code, location_type').in('store_code', visibleCodes);
    expect(error).toBeNull();
    expect(data).toHaveLength(count);
    expect(data.every(project => project.location_type === 'Mall')).toBe(true);
  });

  test('pagination footer shows the correct "start–end of total" summary', async ({ page }) => {
    const rowCount = await page.locator('[data-testid="portfolio-master-project"]').count();
    test.skip(rowCount < 1, 'Need at least 1 project to test pagination summary');

    await expect(page.locator('.portfolio-pagination-summary')).toContainText(`of ${rowCount}`);
  });

  test('changing page shows the new page\'s rows but preserves the selected project\'s details (Phase 4 cross-page consistency contract)', async ({ page }) => {
    // PORTFOLIO_PAGE_SIZE is 50 (Projects.jsx) — a second page only exists
    // once the fixture set exceeds that. Rather than skip real pagination
    // coverage whenever the ambient fixture count happens to be small, seed
    // enough throwaway rows directly (bypassing the UI, same technique
    // unified-project-scope-entry.spec.js already uses for its own Supabase
    // client) to force a second page deterministically, then remove them —
    // this test's own fixture footprint is fully self-contained.
    //
    // Selection semantics match the same "Phase 4 cross-page consistency
    // fix" documented at Projects.jsx's selectedProjectExists computation:
    // changing page (like searching/filtering) must never silently swap or
    // clear the selected detail — the previously selected project stays
    // selected (and keeps rendering in the detail pane) as long as it still
    // exists at all, even once paged out of the currently visible rows.
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword(CREDENTIALS.admin);
    expect(signInError).toBeNull();

    const runPrefix = `PAGEFILL-${Date.now()}`;
    const fillerRows = Array.from({ length: 51 }, (_, i) => ({ store_code: `${runPrefix}-${String(i).padStart(2, '0')}`, country: 'Testland' }));

    try {
      const { error: insertError } = await client.from('projects').insert(fillerRows);
      expect(insertError).toBeNull();

      await page.reload();
      await expect(page.locator('h1')).toContainText('Portfolio');

      const selectedTitleBefore = (await page.locator('#project-detail-title').textContent()).trim();
      expect(selectedTitleBefore.length).toBeGreaterThan(0);
      const codesOnPageOne = await page.locator('[data-testid="portfolio-master-project"] .master-row-top strong').allTextContents();

      const pageButtons = page.locator('.portfolio-page-button');
      await expect(pageButtons).toHaveCount(2, { timeout: 15_000 });

      await pageButtons.nth(1).click();

      const rowsOnPageTwo = page.locator('[data-testid="portfolio-master-project"]');
      await expect(rowsOnPageTwo.first()).toBeVisible({ timeout: 10_000 });
      const codesOnPageTwo = await rowsOnPageTwo.locator('.master-row-top strong').allTextContents();
      expect(codesOnPageTwo.some(code => codesOnPageOne.includes(code))).toBe(false);

      // The previously selected project is no longer on this page — its row
      // (and its is-selected styling) simply isn't part of the currently
      // rendered subset. The detail pane must still show it, unchanged.
      await expect(page.locator('[data-testid="portfolio-master-project"].is-selected')).toHaveCount(0);
      await expect(page.locator('#project-detail-title')).toContainText(selectedTitleBefore);
    } finally {
      await client.from('projects').delete().like('store_code', `${runPrefix}%`);
    }
  });

  test('Export Projects button is visible and generates a real .xlsx workbook', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Projects' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^OpenDay_Projects_\d{4}-\d{2}-\d{2}\.xlsx$/);

    const path = await download.path();
    const bytes = readFileSync(path);
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(bytes, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Projects']);

    const table = XLSX.utils.sheet_to_json(workbook.Sheets['Projects'], { header: 1, defval: null });
    expect(table[0]).toContain('Store Code');
    expect(table[0]).not.toContain('Location'); // derived Portfolio LOCATION is never exported
    // Every currently-visible Portfolio row's store code appears in the export.
    const rowCount = await page.locator('[data-testid="portfolio-master-project"]').count();
    if (rowCount > 0) {
      const firstStoreCode = (await page.locator('[data-testid="portfolio-master-project"]').first().locator('.master-row-top strong').textContent()).trim();
      const exportedCodes = table.slice(1).map(r => r[0]);
      expect(exportedCodes).toContain(firstStoreCode);
    }
  });

  test('Export Projects respects the current Location Type filter (exports the filtered result set, not all projects)', async ({ page }) => {
    const rowCount = await page.locator('[data-testid="portfolio-master-project"]').count();
    test.skip(rowCount < 1, 'Need at least 1 project to test filtered export');

    await page.locator('.portfolio-filter-disclosure > summary').click();
    const locationTypeSelect = page.locator('select').filter({ has: page.locator('option[value="Mall"]') });
    await locationTypeSelect.selectOption('Mall');
    const filteredCount = await page.locator('[data-testid="portfolio-master-project"]').count();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Projects' }).click(),
    ]);
    const path = await download.path();
    const bytes = readFileSync(path);
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(bytes, { type: 'buffer' });
    const table = XLSX.utils.sheet_to_json(workbook.Sheets['Projects'], { header: 1, defval: null });
    expect(table.length - 1).toBe(filteredCount); // header row + exactly the filtered rows, not the full unfiltered set
  });
});

test.describe('Portfolio page — mobile', () => {
  for (const vp of [{ width: 320, height: 640 }, { width: 375, height: 667 }, { width: 412, height: 915 }]) {
    test(`the three Portfolio actions (Add/Import/Export) remain usable at ${vp.width}px with no page overflow`, async ({ page }) => {
      await page.setViewportSize(vp);
      await login(page, CREDENTIALS.admin);
      await page.goto('/projects');
      await expect(page.locator('h1')).toContainText('Portfolio');

      await expect(page.getByRole('button', { name: 'Add New Project' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Import Projects' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Export Projects' })).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `page scrollWidth exceeds clientWidth by ${overflow}px at ${vp.width}px`).toBeLessThanOrEqual(1);
    });
  }

  test('mobile: tapping a project shows full-width details with a working Back to Projects control', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await expect(page.locator('h1')).toContainText('Portfolio');

    // List is visible, Details is hidden, on initial mobile load.
    await expect(page.locator('.master-pane')).toBeVisible();
    await expect(page.locator('.detail-pane')).toBeHidden();

    const firstRow = page.locator('[data-testid="portfolio-master-project"]').first();
    const codeName = (await firstRow.locator('.master-row-top strong').textContent()).trim();
    await firstRow.click();

    // Details pane takes over full width; list is hidden.
    await expect(page.locator('.detail-pane')).toBeVisible();
    await expect(page.locator('.master-pane')).toBeHidden();
    await expect(page.locator('#project-detail-title')).toContainText(codeName);

    // Back control returns to the list, without losing it.
    await page.locator('.portfolio-back-to-master').click();
    await expect(page.locator('.master-pane')).toBeVisible();
    await expect(page.locator('.detail-pane')).toBeHidden();
    await expect(firstRow).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'page scrollWidth exceeds clientWidth by ' + overflow + 'px at 375px').toBeLessThanOrEqual(1);
  });
});
