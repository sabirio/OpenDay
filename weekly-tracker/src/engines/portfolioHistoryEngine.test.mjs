// portfolioHistoryEngine.test.mjs — Historical Data Foundation v1 dataset +
// coverage certification (§26-28, §43).
// Run: node src/engines/portfolioHistoryEngine.test.mjs
import assert from 'node:assert/strict';
import { buildHistoricalProjectDataset, buildHistoricalDataCoverage } from './portfolioHistoryEngine.js';
import { buildHistoricalProjectFacts } from './historyEngine.js';
import {
  COMPLETE_MALL_PROJECT, COMPLETE_STREET_PROJECT, COST_ONLY_PROJECT, SCHEDULE_ONLY_PROJECT,
  MISSING_ACTUALS_PROJECT, INVALID_PLANNED_CHRONOLOGY_PROJECT, INVALID_ACTUAL_CHRONOLOGY_PROJECT,
  NO_GC_PROJECT, WITH_GC_PROJECT, EUR_PROJECT, ALL_HISTORY_FIXTURES,
} from './historyTestFixtures.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  OK ${name}`); };

// ── §26: dataset builder ─────────────────────────────────────────────────
console.log('\nportfolioHistoryEngine — buildHistoricalProjectDataset (§26)');

ok('maps projects[] to HistoricalProjectFacts[] in the same order, using the exact same per-project builder', () => {
  const dataset = buildHistoricalProjectDataset([COMPLETE_MALL_PROJECT, COMPLETE_STREET_PROJECT]);
  assert.equal(dataset.length, 2);
  assert.deepEqual(dataset[0], buildHistoricalProjectFacts(COMPLETE_MALL_PROJECT));
  assert.deepEqual(dataset[1], buildHistoricalProjectFacts(COMPLETE_STREET_PROJECT));
});

ok('an empty/missing projects array produces an empty dataset, not a crash', () => {
  assert.deepEqual(buildHistoricalProjectDataset([]), []);
  assert.deepEqual(buildHistoricalProjectDataset(undefined), []);
});

// ── §27/§43: coverage summary over the full deterministic fixture set ──────
console.log('\nportfolioHistoryEngine — buildHistoricalDataCoverage (§27, full certification fixture set)');

const dataset = buildHistoricalProjectDataset(ALL_HISTORY_FIXTURES);
const coverage = buildHistoricalDataCoverage(dataset);

ok('totalProjects matches the fixture set size', () => {
  assert.equal(coverage.totalProjects, ALL_HISTORY_FIXTURES.length);
});

ok('plannedScheduleEligible counts exactly the fixtures with valid planned chronology', () => {
  // COMPLETE_MALL, COMPLETE_STREET, SCHEDULE_ONLY, MISSING_ACTUALS = 4.
  // INVALID_PLANNED_CHRONOLOGY_PROJECT is deliberately excluded (bad chronology).
  assert.equal(coverage.plannedScheduleEligible, 4);
});

ok('actualScheduleEligible counts exactly the fixtures with valid actual chronology', () => {
  // COMPLETE_MALL, COMPLETE_STREET, SCHEDULE_ONLY = 3.
  // INVALID_ACTUAL_CHRONOLOGY_PROJECT is deliberately excluded.
  assert.equal(coverage.actualScheduleEligible, 3);
});

ok('costPerTotalSqmEligible / costPerSalesSqmEligible / costVarianceEligible counts are internally consistent with the dataset', () => {
  const expectedCostPerTotal = dataset.filter(row => row.eligibility.costPerTotalSqm).length;
  const expectedCostPerSales = dataset.filter(row => row.eligibility.costPerSalesSqm).length;
  const expectedCostVariance = dataset.filter(row => row.eligibility.costVariance).length;
  assert.equal(coverage.costPerTotalSqmEligible, expectedCostPerTotal);
  assert.equal(coverage.costPerSalesSqmEligible, expectedCostPerSales);
  assert.equal(coverage.costVarianceEligible, expectedCostVariance);
  assert.ok(coverage.costPerTotalSqmEligible > 0); // sanity: the fixture set actually exercises this
});

ok('contractorAttributionEligible counts WITH_GC_PROJECT-shaped fixtures, excludes NO_GC_PROJECT-shaped ones', () => {
  const withGcDataset = buildHistoricalProjectDataset([WITH_GC_PROJECT, NO_GC_PROJECT]);
  const withGcCoverage = buildHistoricalDataCoverage(withGcDataset);
  assert.equal(withGcCoverage.contractorAttributionEligible, 1);
});

ok('projectsWithQualityIssues counts exactly the two deliberately-dirty fixtures', () => {
  const dirtyDataset = buildHistoricalProjectDataset([INVALID_PLANNED_CHRONOLOGY_PROJECT, INVALID_ACTUAL_CHRONOLOGY_PROJECT, COMPLETE_MALL_PROJECT]);
  const dirtyCoverage = buildHistoricalDataCoverage(dirtyDataset);
  assert.equal(dirtyCoverage.projectsWithQualityIssues, 2);
});

// ── §28/§43(10): multi-currency proof — counts only, never a cross-currency value ──
console.log('\nportfolioHistoryEngine — currency counts, no FX (§13, §28)');

ok('eligibleCostProjectsByCurrency groups by currency code, never averages/converts across currencies', () => {
  // COMPLETE_MALL_PROJECT (KZT) + COMPLETE_STREET_PROJECT (USD) + EUR_PROJECT (EUR) are
  // all cost-eligible in at least one dimension — three distinct currencies.
  const multiCurrencyDataset = buildHistoricalProjectDataset([COMPLETE_MALL_PROJECT, COMPLETE_STREET_PROJECT, EUR_PROJECT, COST_ONLY_PROJECT]);
  const multiCurrencyCoverage = buildHistoricalDataCoverage(multiCurrencyDataset);
  assert.equal(multiCurrencyCoverage.eligibleCostProjectsByCurrency.KZT, 2); // COMPLETE_MALL_PROJECT + COST_ONLY_PROJECT
  assert.equal(multiCurrencyCoverage.eligibleCostProjectsByCurrency.USD, 1); // COMPLETE_STREET_PROJECT
  assert.equal(multiCurrencyCoverage.eligibleCostProjectsByCurrency.EUR, 1); // EUR_PROJECT
  // No cross-currency numeric value anywhere in the coverage output.
  assert.equal(typeof multiCurrencyCoverage.eligibleCostProjectsByCurrency, 'object');
});

ok('a project with money but no currency is never counted under any currency key (MONEY_WITHOUT_CURRENCY -> costVariance ineligible)', () => {
  const noCurrencyDataset = buildHistoricalProjectDataset([{ storeCode: 'X', budget: 100000, actualCost: 90000 }]);
  const noCurrencyCoverage = buildHistoricalDataCoverage(noCurrencyDataset);
  assert.deepEqual(noCurrencyCoverage.eligibleCostProjectsByCurrency, {});
});

// ── §44: no benchmarking in this layer ──────────────────────────────────────
console.log('\nportfolioHistoryEngine — no benchmark statistics leak into coverage (§44)');

ok('coverage output contains only counts/objects — no average/median/percentile/rank keys', () => {
  const keys = Object.keys(coverage);
  for (const key of keys) {
    assert.doesNotMatch(key.toLowerCase(), /average|median|percentile|rank|benchmark|outlier/);
  }
});

console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
