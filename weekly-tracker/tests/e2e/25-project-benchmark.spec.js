import { test, expect } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';

// Benchmark Product/UI Layer v1 — one shared "Rebuilding / Flagship / Mall /
// Kazakhstan" cohort seeded once in beforeAll (real UI flow, real local
// Supabase — no mocked engine data), reused read-only by most tests. Only
// the tests that must mutate a project (adding actuals, insufficient
// evidence, missing-context) create their own small, disposable projects.
//
// Every test — including the mobile-viewport ones — lives in ONE
// test.describe block so they share a single worker process: RUN_ID is a
// module-level `Date.now()` snapshot, and Playwright can schedule separate
// describe blocks in separate worker processes (each re-importing this file
// with its own fresh RUN_ID), which silently breaks any cross-describe
// reference to a project created in beforeAll.
const RUN_ID = `${Date.now()}`;
const COHORT_COUNTRY = 'Kazakhstan';
const COHORT_CITY = 'Almaty';

async function createProject(page, fields) {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Add New Project' }).click();
  await page.getByRole('button', { name: 'Mall', exact: true }).click();
  await page.locator('input[name="storeCode"]').fill(fields.storeCode);
  await page.locator('input[name="country"]').fill(fields.country ?? '');
  await page.locator('input[name="city"]').fill(fields.city ?? '');
  if (fields.locationType) {
    await page.getByRole('button', { name: fields.locationType, exact: true }).click();
    if (fields.locationType === 'Mall') await page.locator('input[name="shoppingMallName"]').fill(fields.mallName ?? 'Benchmark Test Mall');
  }
  if (fields.constructionStartDate) await page.locator('input[name="constructionStartDate"]').fill(fields.constructionStartDate);
  if (fields.constructionEndDate) await page.locator('input[name="constructionEndDate"]').fill(fields.constructionEndDate);
  if (fields.targetOpeningDate) await page.locator('input[name="targetOpeningDate"]').fill(fields.targetOpeningDate);
  if (fields.actualConstructionStartDate) await page.locator('input[name="actualConstructionStartDate"]').fill(fields.actualConstructionStartDate);
  if (fields.actualConstructionCompletionDate) await page.locator('input[name="actualConstructionCompletionDate"]').fill(fields.actualConstructionCompletionDate);
  if (fields.actualOpeningDate) await page.locator('input[name="actualOpeningDate"]').fill(fields.actualOpeningDate);
  if (fields.storeSizeSqm) await page.locator('input[name="storeSizeSqm"]').fill(String(fields.storeSizeSqm));
  if (fields.salesAreaSqm) await page.locator('input[name="salesAreaSqm"]').fill(String(fields.salesAreaSqm));
  if (fields.budget) await page.locator('input[name="budget"]').fill(String(fields.budget));
  if (fields.currencyCode) await page.locator('input[name="currencyCode"]').fill(fields.currencyCode);
  if (fields.projectType) await page.getByRole('button', { name: fields.projectType, exact: true }).click();
  if (fields.storeConcept) await page.locator('input[name="storeConcept"]').fill(fields.storeConcept);

  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(page.locator('input[name="storeCode"]')).not.toBeVisible({ timeout: 15_000 });
}

async function setActualCost(page, storeCode, actualCost) {
  await page.goto('/projects');
  await page.getByPlaceholder('Search').fill(storeCode);
  await expect(page.getByTestId('portfolio-master-project')).toHaveCount(1, { timeout: 8_000 });
  await page.getByTestId('portfolio-master-project').first().click();
  await page.getByRole('button', { name: 'Edit Project' }).click();
  await page.locator('input[name="actualCost"]').fill(String(actualCost));
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.locator('input[name="storeCode"]')).not.toBeVisible({ timeout: 15_000 });
}

async function openBenchmarkTab(page, storeCode) {
  await page.goto('/projects');
  await page.getByPlaceholder('Search').fill(storeCode);
  await expect(page.getByTestId('portfolio-master-project')).toHaveCount(1, { timeout: 8_000 });
  await page.getByTestId('portfolio-master-project').first().click();
  await expect(page.locator('.detail-pane')).toBeVisible({ timeout: 8_000 });
  await page.getByRole('tab', { name: 'Benchmark' }).click();
}

const COHORT_CODES = [0, 1, 2, 3].map(i => `BM-HIST-${RUN_ID}-${i}`);
const TARGET_CODE = `BM-TARGET-${RUN_ID}`;
const NO_CURRENCY_CODE = `BM-NOCURRENCY-${RUN_ID}`;

test.describe('Project Benchmark v1', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, CREDENTIALS.admin);

    // 4 comparable, completed historical projects — same country/projectType/
    // storeConcept/locationType/area as the target below (Tier 1 CLOSE_MATCH).
    for (const code of COHORT_CODES) {
      await createProject(page, {
        storeCode: code, country: COHORT_COUNTRY, city: COHORT_CITY,
        locationType: 'Mall', mallName: 'Benchmark Historical Mall',
        projectType: 'Rebuilding', storeConcept: 'Flagship',
        storeSizeSqm: 1000, salesAreaSqm: 700,
        constructionStartDate: '2024-01-01', constructionEndDate: '2024-04-01', targetOpeningDate: '2024-04-10',
        actualConstructionStartDate: '2024-01-02', actualConstructionCompletionDate: '2024-03-26', actualOpeningDate: '2024-04-08', // -2 days early
        budget: 480000, currencyCode: 'KZT',
      });
    }
    // Actual Cost is edit-only (never present at creation) — set it after.
    const costs = [480000, 500000, 520000, 550000];
    for (let i = 0; i < COHORT_CODES.length; i++) {
      await setActualCost(page, COHORT_CODES[i], costs[i]);
    }

    // The target: same cohort context, in-progress (no actuals at all yet).
    await createProject(page, {
      storeCode: TARGET_CODE, country: COHORT_COUNTRY, city: COHORT_CITY,
      locationType: 'Mall', mallName: 'Benchmark Target Mall',
      projectType: 'Rebuilding', storeConcept: 'Flagship',
      storeSizeSqm: 1000, salesAreaSqm: 700,
      constructionStartDate: '2025-01-01', constructionEndDate: '2025-04-01', targetOpeningDate: '2025-04-10',
      currencyCode: 'KZT',
    });

    // A project with country/projectType present but no currency and no
    // money at all — country is a mandatory DB fact for every project (an
    // empty country fails to save at all, live or historical), so the only
    // realistically-reachable TARGET_NOT_ELIGIBLE case through the live
    // "create a project" flow is the currency-required-for-absolute-cost one.
    await createProject(page, {
      storeCode: NO_CURRENCY_CODE, country: COHORT_COUNTRY, city: COHORT_CITY,
      locationType: 'Mall', mallName: 'Benchmark Target Mall',
      projectType: 'Rebuilding', storeConcept: 'Flagship',
      storeSizeSqm: 1000,
      constructionStartDate: '2025-01-01', constructionEndDate: '2025-04-01', targetOpeningDate: '2025-04-10',
    });

    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, CREDENTIALS.admin);
  });

  test.afterEach(async ({ page }) => {
    await page.goto('/');
    // At narrow viewports the nav (including Sign out) collapses behind a
    // hamburger button. logout()'s own first action is an Escape keypress
    // (to dismiss modals) — that would also close a just-opened mobile nav
    // drawer, so the mobile case is handled directly here instead of
    // delegating to the shared desktop-oriented helper.
    const hamburger = page.getByRole('button', { name: /open navigation menu/i });
    const hamburgerShown = await hamburger.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (hamburgerShown) {
      await hamburger.click();
      const signOutBtn = page.getByRole('button', { name: /sign out/i }).first();
      await expect(signOutBtn).toBeVisible({ timeout: 10_000 });
      await signOutBtn.click();
      await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });
    } else {
      await logout(page);
    }
  });

  // -- 1/2/3: navigation + Overview regression -----------------------------
  test('opens on Overview by default, Benchmark view opens, switching back to Overview works', async ({ page }) => {
    await openBenchmarkTab(page, TARGET_CODE);
    await expect(page.locator('.detail-pane')).toContainText('Benchmark');
    await expect(page.locator('.detail-pane')).toContainText('Compare this project with similar historical projects.');

    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.locator('.detail-pane')).toContainText('Project profile');
    await expect(page.locator('.detail-pane')).toContainText('Areas and construction setup');
    await expect(page.locator('.detail-pane')).toContainText('Contractor access');
  });

  // -- 4: all five benchmark titles render ----------------------------------
  test('all five benchmark card titles render', async ({ page }) => {
    await openBenchmarkTab(page, TARGET_CODE);
    for (const title of ['Cost / Total m²', 'Cost / Sales m²', 'Construction Duration', 'Opening Variance', 'Cost Variance']) {
      await expect(page.locator('.detail-pane')).toContainText(title);
    }
  });

  // -- 5/6/7/8/9/10: AVAILABLE-without-actual + Typical range + basis -------
  test('unfinished target still shows full benchmark statistics with no fabricated comparison', async ({ page }) => {
    await openBenchmarkTab(page, TARGET_CODE);
    const costCard = page.locator('.benchmark-card', { hasText: 'Cost / Total m²' });
    await expect(costCard).toContainText('Median');
    await expect(costCard).toContainText('Typical range');
    await expect(costCard).toContainText('comparable project');
    await expect(costCard).toContainText('Actual cost not available yet');
    await expect(costCard).not.toContainText('vs median');

    await costCard.getByRole('button', { name: /Comparison basis/ }).click();
    await expect(costCard).toContainText('Country');
    await expect(costCard).toContainText(COHORT_COUNTRY);
    await expect(costCard).toContainText('Project type');
    await expect(costCard).toContainText('Rebuilding');
    await expect(costCard).toContainText('Currency');
    await expect(costCard).toContainText('KZT');
  });

  // -- 11/12: completed target shows Your project + vs median --------------
  test('completed target shows Your project and vs median once an actual cost is added', async ({ page }) => {
    await setActualCost(page, TARGET_CODE, 530000);
    await openBenchmarkTab(page, TARGET_CODE);
    const costCard = page.locator('.benchmark-card', { hasText: 'Cost / Total m²' });
    await expect(costCard).toContainText('Your project');
    await expect(costCard).toContainText('530');
    await expect(costCard).toContainText('vs median');
  });

  // -- 16: Opening Variance preserves negative sign -------------------------
  test('Opening Variance shows the historical median with its sign preserved (early openings are negative)', async ({ page }) => {
    await openBenchmarkTab(page, TARGET_CODE);
    const openingCard = page.locator('.benchmark-card', { hasText: 'Opening Variance' });
    await expect(openingCard).toContainText('-2 days'); // all 4 historical peers opened 2 days early
    await expect(openingCard).toContainText('earlier');
  });

  // -- 17: different metrics may show different sample sizes ---------------
  test('different metrics can show different comparable-project counts', async ({ page }) => {
    await createProject(page, {
      storeCode: `BM-SCHEDONLY-${RUN_ID}`, country: COHORT_COUNTRY, city: COHORT_CITY,
      locationType: 'Mall', mallName: 'Benchmark Historical Mall',
      projectType: 'Rebuilding', storeConcept: 'Flagship',
      storeSizeSqm: 1000,
      constructionStartDate: '2024-01-01', constructionEndDate: '2024-04-01', targetOpeningDate: '2024-04-10',
      actualConstructionStartDate: '2024-01-02', actualConstructionCompletionDate: '2024-03-26', actualOpeningDate: '2024-04-08',
      // deliberately no budget/currency -> not cost-eligible, still schedule-eligible
    });
    await openBenchmarkTab(page, TARGET_CODE);
    const costCard = page.locator('.benchmark-card', { hasText: 'Cost / Total m²' });
    const scheduleCard = page.locator('.benchmark-card', { hasText: 'Construction Duration' });
    const costText = await costCard.locator('.benchmark-sample-size').textContent();
    const scheduleText = await scheduleCard.locator('.benchmark-sample-size').textContent();
    expect(costText.trim()).not.toEqual(scheduleText.trim());
  });

  // -- 13: insufficient evidence --------------------------------------------
  test('insufficient evidence state shows when fewer than 3 comparable projects exist', async ({ page }) => {
    const uniqueCountry = `Benchmarkland-${RUN_ID}`;
    await createProject(page, {
      storeCode: `BM-SPARSE-TARGET-${RUN_ID}`, country: uniqueCountry, city: 'Nowhere',
      locationType: 'Mall', mallName: 'Sparse Mall',
      projectType: 'Rebuilding', storeConcept: 'Flagship',
      storeSizeSqm: 1000, currencyCode: 'KZT',
      constructionStartDate: '2025-01-01', constructionEndDate: '2025-04-01', targetOpeningDate: '2025-04-10',
    });
    await createProject(page, {
      storeCode: `BM-SPARSE-PEER-${RUN_ID}`, country: uniqueCountry, city: 'Nowhere',
      locationType: 'Mall', mallName: 'Sparse Mall',
      projectType: 'Rebuilding', storeConcept: 'Flagship',
      storeSizeSqm: 1000, currencyCode: 'KZT',
      constructionStartDate: '2024-01-01', constructionEndDate: '2024-04-01', targetOpeningDate: '2024-04-10',
      actualConstructionStartDate: '2024-01-02', actualConstructionCompletionDate: '2024-03-26', actualOpeningDate: '2024-04-08',
    });

    await openBenchmarkTab(page, `BM-SPARSE-TARGET-${RUN_ID}`);
    const durationCard = page.locator('.benchmark-card', { hasText: 'Construction Duration' });
    await expect(durationCard).toContainText('Not enough comparable history');
    await expect(durationCard).toContainText('required');
    await expect(durationCard).not.toContainText('Median');
  });

  // -- 14: TARGET_NOT_ELIGIBLE (missing currency, absolute-cost metrics only)
  test('TARGET_NOT_ELIGIBLE state shows for absolute-cost metrics when currency is missing', async ({ page }) => {
    await openBenchmarkTab(page, NO_CURRENCY_CODE);
    const costCard = page.locator('.benchmark-card', { hasText: 'Cost / Total m²' });
    await expect(costCard).toContainText('Benchmark unavailable');
    await expect(costCard).toContainText('Currency is required');
    // costVariancePercent has no currency requirement — same project is still AVAILABLE for it.
    const varianceCard = page.locator('.benchmark-card', { hasText: 'Cost Variance' });
    await expect(varianceCard).not.toContainText('Benchmark unavailable');
  });

  // -- 22: opening a second project shows fresh, non-stale results ---------
  test('opening a second project does not reuse the previous project\'s benchmark results', async ({ page }) => {
    await openBenchmarkTab(page, TARGET_CODE);
    await expect(page.locator('.detail-pane')).toContainText('Cost / Total m²');

    // openBenchmarkTab() re-navigates to /projects and re-selects fresh —
    // there's no modal to close first in the inline master-detail workspace.
    await openBenchmarkTab(page, NO_CURRENCY_CODE);
    const costCard = page.locator('.benchmark-card', { hasText: 'Cost / Total m²' });
    await expect(costCard).toContainText('Benchmark unavailable'); // not the previous project's AVAILABLE cohort
  });

  // -- 19/20/21: mobile viewports (same describe block/worker as beforeAll) --
  for (const vp of [{ width: 320, height: 640 }, { width: 375, height: 667 }, { width: 412, height: 915 }]) {
    test(`Overview/Benchmark navigation and cards remain usable at ${vp.width}px`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openBenchmarkTab(page, TARGET_CODE);

      await expect(page.getByRole('tab', { name: 'Benchmark' })).toBeVisible();
      await expect(page.locator('.detail-pane')).toContainText('Cost / Total m²');

      const costCard = page.locator('.benchmark-card', { hasText: 'Cost / Total m²' });
      await costCard.getByRole('button', { name: /Comparison basis/ }).click();
      await expect(costCard).toContainText('Country');

      await expect(page.locator('.detail-pane')).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `page scrollWidth exceeds clientWidth by ${overflow}px at ${vp.width}px`).toBeLessThanOrEqual(1);
    });
  }
});
