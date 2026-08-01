import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { CREDENTIALS, login, logout } from './helpers.js';

const UNIQUE_CODE = `TEST-${Date.now()}`;
const UNIQUE_STREET_CODE = `TEST-ST-${Date.now()}`;
const UNIQUE_SLICE_CODE = `TEST-SLICE1-${Date.now()}`;
const UNIQUE_AREA_CODE = `TEST-AREAS-${Date.now()}`;

test.describe('Portfolio page', () => {
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

  test('creates a new Mall project and selecting its row shows Location Type + Location correctly', async ({ page }) => {
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
    await expect(page.locator('#portfolio-detail-tabpanel')).toContainText('Mall');
    await expect(page.locator('#portfolio-detail-tabpanel')).toContainText('Playwright Test Mall');
  });

  test('creates a new Street project and selecting its row shows Street Address as Location, not Mall', async ({ page }) => {
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
    await expect(page.locator('#portfolio-detail-tabpanel')).toContainText('Street');
    await expect(page.locator('#portfolio-detail-tabpanel')).toContainText('Test Ave 1');
  });

  test('switching Location Type from Mall to Street clears the stale mall name field', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();

    await page.getByRole('button', { name: 'Mall', exact: true }).click();
    await page.locator('input[name="shoppingMallName"]').fill('Should Be Cleared');

    await page.getByRole('button', { name: 'Street', exact: true }).click();
    await expect(page.locator('input[name="shoppingMallName"]')).not.toBeVisible();
    await expect(page.locator('input[name="street"]')).toHaveValue('');
  });

  test('selecting a project row shows its Overview in the details pane with the canonical sections', async ({ page }) => {
    const firstRow = page.locator('[data-testid="portfolio-master-project"]').first();
    const codeName = (await firstRow.locator('.master-row-top strong').textContent()).trim();
    await firstRow.click();

    const details = page.locator('.detail-pane');
    await expect(details).toBeVisible();
    await expect(page.locator('#project-detail-title')).toContainText(codeName);
    await expect(details).toContainText('Project profile');
    await expect(details).toContainText('Schedule');
    await expect(details).toContainText('Commercial');
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

  test('edit mode retains Actual Dates and Project Status editing', async ({ page }) => {
    await page.locator('[data-testid="portfolio-master-project"]').first().click();
    await expect(page.locator('.detail-pane')).toBeVisible();

    await page.locator('.portfolio-detail-header button', { hasText: 'Edit Project' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('input[name="storeCode"]')).toBeVisible();
    await expect(dialog.locator('input[name="actualConstructionStartDate"]')).toBeVisible();
    await expect(dialog.locator('input[name="actualConstructionCompletionDate"]')).toBeVisible();
    await expect(dialog.locator('input[name="actualOpeningDate"]')).toBeVisible();
    await expect(dialog.getByText('Project Status', { exact: true })).toBeVisible();
  });

  test('create persists Active status, planned dates, and Store Concept while actual dates remain blank', async ({ page }) => {
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
    await expect(editDialog.getByRole('button', { name: 'Active', exact: true })).toBeVisible();

    page.once('dialog', dialog => dialog.accept());
    await editDialog.getByRole('button', { name: 'Delete Project' }).click();
    await expect(editDialog).toBeHidden({ timeout: 15_000 });
  });

  test('new zoned project captures areas once and derives scope area context from canonical project fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();
    const createDialog = page.getByRole('dialog', { name: 'New Project' });

    await createDialog.locator('input[name="storeCode"]').fill(UNIQUE_AREA_CODE);
    await createDialog.locator('input[name="country"]').fill('Testland');
    await createDialog.locator('input[name="storeSizeSqm"]').fill('1100');
    await createDialog.locator('input[name="salesAreaSqm"]').fill('800');
    await createDialog.locator('input[name="backOfHouseAreaSqm"]').fill('150');
    await createDialog.locator('input[name="constructionStartDate"]').fill('2026-08-01');
    await createDialog.locator('input[name="constructionEndDate"]').fill('2026-12-15');
    await createDialog.getByText('Retail Fit-Out (Zoned)', { exact: false }).click();

    await expect(createDialog.locator('input[name^="scope.zoneAreas."]')).toHaveCount(0);
    await createDialog.getByRole('button', { name: /Configure Scope/i }).click();

    let scopeDialog = page.getByRole('dialog', { name: 'Configure Zoned Scope' });
    await expect(scopeDialog).toBeVisible();
    await expect(scopeDialog.locator('input[type="number"]')).toHaveCount(0);
    await expect(scopeDialog).toContainText(/1.100 m²/);
    await expect(scopeDialog).toContainText('800 m²');
    await expect(scopeDialog).toContainText('150 m²');
    await expect(scopeDialog).toContainText('Derived from Project Areas');
    await scopeDialog.getByRole('button', { name: 'Cancel' }).click();

    await createDialog.locator('input[name="salesAreaSqm"]').fill('850');
    await createDialog.locator('input[name="backOfHouseAreaSqm"]').fill('180');
    await createDialog.getByRole('button', { name: /Configure Scope/i }).click();
    scopeDialog = page.getByRole('dialog', { name: 'Configure Zoned Scope' });
    await expect(scopeDialog).toContainText('850 m²');
    await expect(scopeDialog).toContainText('180 m²');
    await scopeDialog.getByRole('button', { name: 'Save Scope' }).click();

    await createDialog.getByRole('button', { name: 'Create Project' }).click();
    await expect(createDialog).toBeHidden({ timeout: 15_000 });

    const row = page.locator('[data-testid="portfolio-master-project"]', { hasText: UNIQUE_AREA_CODE });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await page.getByRole('button', { name: 'Edit Project' }).click();

    const editDialog = page.getByRole('dialog', { name: 'Edit Project' });
    await expect(editDialog.locator('input[name="storeSizeSqm"]')).toHaveValue('1100');
    await expect(editDialog.locator('input[name="salesAreaSqm"]')).toHaveValue('850');
    await expect(editDialog.locator('input[name="backOfHouseAreaSqm"]')).toHaveValue('180');
    await expect(editDialog.locator('input[name^="scope.zoneAreas."]')).toHaveCount(0);

    await editDialog.getByRole('button', { name: /Scope configured/i }).click();
    scopeDialog = page.getByRole('dialog', { name: 'Configure Zoned Scope' });
    await expect(scopeDialog).toContainText('850 m²');
    await expect(scopeDialog).toContainText('180 m²');
    await expect(scopeDialog.locator('input[type="number"]')).toHaveCount(0);
    await scopeDialog.getByRole('button', { name: 'Cancel' }).click();

    page.once('dialog', dialog => dialog.accept());
    await editDialog.getByRole('button', { name: 'Delete Project' }).click();
    await expect(editDialog).toBeHidden({ timeout: 15_000 });
  });

  test('Add New Project does not show an Actual Cost input', async ({ page }) => {
    await page.getByRole('button', { name: 'Add New Project' }).click();
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
    await expect(page.locator('input[name="actualCost"]')).toHaveCount(0);
  });

  test('Edit Project shows an Actual Cost input', async ({ page }) => {
    await page.locator('[data-testid="portfolio-master-project"]').first().click();
    await page.locator('.portfolio-detail-header button', { hasText: 'Edit Project' }).click();
    await expect(page.locator('input[name="storeCode"]')).toBeVisible();
    await expect(page.locator('input[name="actualCost"]')).toBeVisible();
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

  test('search with no matches shows an empty state in both the list and details panes', async ({ page }) => {
    await page.getByPlaceholder('Search projects...').fill('ZZZ_NO_SUCH_PROJECT_ZZZ');

    await expect(page.locator('.master-pane-list')).toContainText('No projects match the current filters.');
    await expect(page.locator('.detail-pane')).toContainText('Select a project to view its details.');
  });

  test('Location Type filter narrows the project list to Mall projects only', async ({ page }) => {
    const rowCount = await page.locator('[data-testid="portfolio-master-project"]').count();
    test.skip(rowCount < 1, 'Need at least 1 project to test filter');

    // The Location Type <select> is the one whose options include "Mall"/"Street".
    await page.locator('.portfolio-filter-disclosure > summary').click();
    const locationTypeSelect = page.locator('select').filter({ has: page.locator('option[value="Mall"]') });
    await locationTypeSelect.selectOption('Mall');

    // The compact row no longer prints "Location Type" as its own text, so
    // verify via the canonical details pane (still the authoritative
    // presentation of every filtered project's Location Type).
    const rows = page.locator('[data-testid="portfolio-master-project"]');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await rows.nth(i).click();
      await expect(page.locator('#portfolio-detail-tabpanel')).toContainText('Mall');
    }
  });

  test('pagination footer shows the correct "start–end of total" summary', async ({ page }) => {
    const rowCount = await page.locator('[data-testid="portfolio-master-project"]').count();
    test.skip(rowCount < 1, 'Need at least 1 project to test pagination summary');

    await expect(page.locator('.portfolio-pagination-summary')).toContainText(`of ${rowCount}`);
  });

  test('changing page selects the first visible project on the new page and preserves active filters', async ({ page }) => {
    const pageButtons = page.locator('.portfolio-page-button');
    const pageButtonCount = await pageButtons.count();
    test.skip(pageButtonCount < 2, 'Test dataset has a single page — needs 51+ projects to exercise real pagination');

    const secondPageButton = pageButtons.nth(1);
    await secondPageButton.click();

    const firstRowOnNewPage = page.locator('[data-testid="portfolio-master-project"]').first();
    const codeOnNewPage = (await firstRowOnNewPage.locator('.master-row-top strong').textContent()).trim();
    await expect(firstRowOnNewPage).toHaveClass(/is-selected/);
    await expect(page.locator('#project-detail-title')).toContainText(codeOnNewPage);
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
