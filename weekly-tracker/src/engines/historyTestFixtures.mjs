// historyTestFixtures.mjs — shared deterministic fixture set for Historical
// Data Foundation v1 certification (historyEngine.test.mjs +
// portfolioHistoryEngine.test.mjs). Not itself a test file (no .test.mjs
// suffix, not auto-discovered by runAll.mjs). Every fixture is a plain
// canonical project object — the exact shape projectService.fromDB()
// produces, used identically by live projects and Import.

/** 1. Complete Mall project — full evidence across every dimension. */
export const COMPLETE_MALL_PROJECT = {
  storeCode: 'KZ-HIST-MALL-1', country: 'Kazakhstan', city: 'Almaty',
  locationType: 'Mall', shoppingMallName: 'MEGA Alma-Ata',
  projectType: 'Rebuilding', storeConcept: 'Flagship',
  storeSizeSqm: 1250, salesAreaSqm: 900, backOfHouseAreaSqm: 350,
  constructionStartDate: '2026-08-01', constructionEndDate: '2026-11-15', targetOpeningDate: '2026-11-21',
  actualConstructionStartDate: '2026-08-03', actualConstructionCompletionDate: '2026-11-18', actualOpeningDate: '2026-11-23',
  budget: 500000, actualCost: 525000, currencyCode: 'KZT',
  generalContractor: 'Acme Build', contractorEmail: 'gc@acme.test',
};

/** 2. Complete Street project — different location type, different currency. */
export const COMPLETE_STREET_PROJECT = {
  storeCode: 'AE-HIST-STREET-1', country: 'United Arab Emirates', city: 'Dubai',
  locationType: 'Street', street: 'Sheikh Zayed Rd 1',
  projectType: 'New Opening', storeConcept: 'Standard',
  storeSizeSqm: 600, salesAreaSqm: 450, backOfHouseAreaSqm: 150,
  constructionStartDate: '2026-03-01', constructionEndDate: '2026-06-01', targetOpeningDate: '2026-06-15',
  actualConstructionStartDate: '2026-03-01', actualConstructionCompletionDate: '2026-05-28', actualOpeningDate: '2026-06-12',
  budget: 200000, actualCost: 190000, currencyCode: 'USD',
  generalContractor: 'Gulf Fitout LLC', contractorEmail: 'ops@gulffitout.test',
};

/** 3. Cost-only partial historical project — no dates at all. */
export const COST_ONLY_PROJECT = {
  storeCode: 'KZ-HIST-COST-1', country: 'Kazakhstan', city: 'Astana',
  storeSizeSqm: 1000, actualCost: 480000, currencyCode: 'KZT',
};

/** 4. Schedule-only project — planned + actual dates, no cost at all. */
export const SCHEDULE_ONLY_PROJECT = {
  storeCode: 'KZ-HIST-SCHED-1', country: 'Kazakhstan', city: 'Karaganda',
  constructionStartDate: '2026-01-10', constructionEndDate: '2026-04-10', targetOpeningDate: '2026-04-20',
  actualConstructionStartDate: '2026-01-12', actualConstructionCompletionDate: '2026-04-15', actualOpeningDate: '2026-04-22',
};

/** 5. Project missing actual facts entirely — only planned dates + area known. */
export const MISSING_ACTUALS_PROJECT = {
  storeCode: 'KZ-HIST-PLANNEDONLY-1', country: 'Kazakhstan', city: 'Shymkent',
  storeSizeSqm: 800,
  constructionStartDate: '2026-05-01', constructionEndDate: '2026-08-01', targetOpeningDate: '2026-08-10',
};

/** 6. Invalid PLANNED chronology — construction end before construction start. */
export const INVALID_PLANNED_CHRONOLOGY_PROJECT = {
  storeCode: 'KZ-HIST-BADPLAN-1', country: 'Kazakhstan', city: 'Almaty',
  constructionStartDate: '2026-11-15', constructionEndDate: '2026-08-01', targetOpeningDate: '2026-11-21',
};

/** 7. Invalid ACTUAL chronology — actual completion before actual start. */
export const INVALID_ACTUAL_CHRONOLOGY_PROJECT = {
  storeCode: 'KZ-HIST-BADACTUAL-1', country: 'Kazakhstan', city: 'Almaty',
  actualConstructionStartDate: '2026-11-15', actualConstructionCompletionDate: '2026-08-01',
};

/** 8. Project with no GC. */
export const NO_GC_PROJECT = {
  storeCode: 'KZ-HIST-NOGC-1', country: 'Kazakhstan', city: 'Almaty',
  storeSizeSqm: 500, actualCost: 100000, currencyCode: 'KZT',
};

/** 9. Project with a GC. */
export const WITH_GC_PROJECT = {
  storeCode: 'KZ-HIST-GC-1', country: 'Kazakhstan', city: 'Almaty',
  generalContractor: 'Steppe Construction LLP',
};

/** 10. A third currency, so the fixture set covers KZT / USD / EUR. */
export const EUR_PROJECT = {
  storeCode: 'DE-HIST-EUR-1', country: 'Germany', city: 'Berlin',
  storeSizeSqm: 700, salesAreaSqm: 500, actualCost: 300000, budget: 280000, currencyCode: 'EUR',
  generalContractor: 'Berlin Fit-Out GmbH',
};

/** Imported-historical-shaped project — canonical facts only, no operational
 * events (contractor_reports/site_visits/snags/gantt) — same shape as an
 * Import CREATE row would produce. Historical Foundation must not require
 * operational events for project-profile analytics (§37). */
export const IMPORTED_SHAPED_PROJECT = {
  storeCode: 'KZ-HIST-IMPORTED-1', country: 'Kazakhstan', city: 'Almaty',
  locationType: 'Mall', shoppingMallName: 'Dostyk Plaza',
  projectType: 'New Opening', storeConcept: 'Compact',
  storeSizeSqm: 450, salesAreaSqm: 320, backOfHouseAreaSqm: 130,
  constructionStartDate: '2023-02-01', constructionEndDate: '2023-05-01', targetOpeningDate: '2023-05-10',
  actualConstructionStartDate: '2023-02-03', actualConstructionCompletionDate: '2023-04-28', actualOpeningDate: '2023-05-08',
  budget: 150000, actualCost: 148000, currencyCode: 'KZT',
  generalContractor: 'Historical Builders LLP',
  // No contractorEmail, no phases/scope/templateId — Import never writes these.
};

/** Live-shaped project — some actual facts, some work still incomplete
 * (matches an in-progress OpenDay project's real shape, including
 * Gantt/template fields Import never writes). */
export const LIVE_IN_PROGRESS_PROJECT = {
  storeCode: 'KZ-HIST-LIVE-1', country: 'Kazakhstan', city: 'Almaty',
  locationType: 'Street', street: 'Abay Ave 99',
  projectType: 'Rebuilding', storeConcept: 'Standard',
  storeSizeSqm: 900, salesAreaSqm: 650, backOfHouseAreaSqm: 250,
  constructionStartDate: '2026-09-01', constructionEndDate: '2026-12-01', targetOpeningDate: '2026-12-10',
  actualConstructionStartDate: '2026-09-05', // construction still ongoing — no completion/opening yet
  budget: 350000, currencyCode: 'KZT', // actual cost not known yet
  generalContractor: 'Live Site Contractor', contractorEmail: 'pm@livesite.test',
  templateType: 'standard_with_demo', ganttGeneratedAt: '2026-08-20T10:00:00.000Z',
};

/** Benchmark Engine v1 — a single reusable "target" project, fully eligible
 * for all 5 supported benchmark metrics (cost-per-total-sqm, cost-per-sales-
 * sqm, actualConstructionDays, openingVarianceDays, costVariancePercent).
 * benchmarkEngine.test.mjs builds its own small, purpose-built cohort peers
 * around this target inline (via a local `peer()` factory) rather than
 * pre-baking dozens of narrow tier/boundary combinations here. */
export const BENCHMARK_TARGET_PROJECT = {
  storeCode: 'KZ-BENCH-TARGET-1', country: 'Kazakhstan', city: 'Almaty',
  locationType: 'Mall', shoppingMallName: 'Dostyk Plaza',
  projectType: 'New Opening', storeConcept: 'Standard',
  storeSizeSqm: 1000, salesAreaSqm: 700, backOfHouseAreaSqm: 300,
  constructionStartDate: '2025-01-01', constructionEndDate: '2025-04-01', targetOpeningDate: '2025-04-10',
  actualConstructionStartDate: '2025-01-02', actualConstructionCompletionDate: '2025-03-28', actualOpeningDate: '2025-04-09',
  budget: 400000, actualCost: 420000, currencyCode: 'KZT',
  generalContractor: 'Bench GC',
};

export const ALL_HISTORY_FIXTURES = Object.freeze([
  COMPLETE_MALL_PROJECT,
  COMPLETE_STREET_PROJECT,
  COST_ONLY_PROJECT,
  SCHEDULE_ONLY_PROJECT,
  MISSING_ACTUALS_PROJECT,
  INVALID_PLANNED_CHRONOLOGY_PROJECT,
  INVALID_ACTUAL_CHRONOLOGY_PROJECT,
  NO_GC_PROJECT,
  WITH_GC_PROJECT,
  EUR_PROJECT,
]);
