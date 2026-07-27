// historyEngine.test.mjs — Historical Data Foundation v1 certification.
// Run: node src/engines/historyEngine.test.mjs
import assert from 'node:assert/strict';
import { buildHistoricalProjectFacts } from './historyEngine.js';
import {
  COMPLETE_MALL_PROJECT, COMPLETE_STREET_PROJECT, COST_ONLY_PROJECT, SCHEDULE_ONLY_PROJECT,
  MISSING_ACTUALS_PROJECT, INVALID_PLANNED_CHRONOLOGY_PROJECT, INVALID_ACTUAL_CHRONOLOGY_PROJECT,
  NO_GC_PROJECT, WITH_GC_PROJECT, IMPORTED_SHAPED_PROJECT, LIVE_IN_PROGRESS_PROJECT,
} from './historyTestFixtures.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  OK ${name}`); };
const close = (a, b, eps = 0.001) => Math.abs(a - b) < eps;

// ── §33: date calculation tests ─────────────────────────────────────────────
console.log('\nhistoryEngine — date calculations (§33)');

ok('plannedConstructionDays: 2026-08-01 -> 2026-11-15 = 106 calendar days', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', constructionStartDate: '2026-08-01', constructionEndDate: '2026-11-15' });
  assert.equal(facts.metrics.plannedConstructionDays, 106);
});

ok('openingVarianceDays: target 2026-11-21, actual 2026-11-23 = +2', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', targetOpeningDate: '2026-11-21', actualOpeningDate: '2026-11-23' });
  assert.equal(facts.metrics.openingVarianceDays, 2);
});

ok('openingVarianceDays: target 2026-11-21, actual 2026-11-19 = -2 (early, not "delay")', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', targetOpeningDate: '2026-11-21', actualOpeningDate: '2026-11-19' });
  assert.equal(facts.metrics.openingVarianceDays, -2);
});

ok('openingVarianceDays: 0 when opened exactly on target', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', targetOpeningDate: '2026-11-21', actualOpeningDate: '2026-11-21' });
  assert.equal(facts.metrics.openingVarianceDays, 0);
});

ok('constructionStartVarianceDays: positive = started late, negative = started early', () => {
  const late = buildHistoricalProjectFacts({ storeCode: 'X', constructionStartDate: '2026-08-01', actualConstructionStartDate: '2026-08-05' });
  const early = buildHistoricalProjectFacts({ storeCode: 'X', constructionStartDate: '2026-08-01', actualConstructionStartDate: '2026-07-28' });
  assert.equal(late.metrics.constructionStartVarianceDays, 4);
  assert.equal(early.metrics.constructionStartVarianceDays, -4);
});

ok('constructionCompletionVarianceDays: positive = completed late', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', constructionEndDate: '2026-11-15', actualConstructionCompletionDate: '2026-11-18' });
  assert.equal(facts.metrics.constructionCompletionVarianceDays, 3);
});

// ── §7-8: planned/actual schedule metrics on the complete fixture ──────────
console.log('\nhistoryEngine — planned/actual schedule metrics on a fully complete project');

ok('COMPLETE_MALL_PROJECT: plannedConstructionDays, plannedPreOpeningDays, actualConstructionDays, actualPreOpeningDays all computed', () => {
  const facts = buildHistoricalProjectFacts(COMPLETE_MALL_PROJECT);
  assert.equal(facts.metrics.plannedConstructionDays, 106); // 2026-08-01 -> 2026-11-15
  assert.equal(facts.metrics.plannedPreOpeningDays, 6);     // 2026-11-15 -> 2026-11-21
  assert.equal(facts.metrics.actualConstructionDays, 107);  // 2026-08-03 -> 2026-11-18
  assert.equal(facts.metrics.actualPreOpeningDays, 5);      // 2026-11-18 -> 2026-11-23
});

// ── §34: financial tests (exact task example) ───────────────────────────────
console.log('\nhistoryEngine — financial metrics (§34)');

ok('Budget 500000, Actual 525000, Total 1000, Sales 800 -> exact task example values', () => {
  const facts = buildHistoricalProjectFacts({
    storeCode: 'X', budget: 500000, actualCost: 525000, currencyCode: 'KZT', storeSizeSqm: 1000, salesAreaSqm: 800,
  });
  assert.equal(facts.metrics.costVarianceAmount, 25000);
  assert.ok(close(facts.metrics.costVariancePercent, 5));
  assert.ok(close(facts.metrics.actualCostPerTotalSqm, 525));
  assert.ok(close(facts.metrics.actualCostPerSalesSqm, 656.25));
  assert.ok(close(facts.metrics.budgetPerTotalSqm, 500));
  assert.ok(close(facts.metrics.budgetPerSalesSqm, 625));
});

ok('costVariancePercent is null when budget is 0 (never divides by zero)', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', budget: 0, actualCost: 1000, currencyCode: 'USD' });
  assert.equal(facts.metrics.costVarianceAmount, 1000); // amount still computable
  assert.equal(facts.metrics.costVariancePercent, null); // percent is not
});

// ── §35: area tests ──────────────────────────────────────────────────────────
console.log('\nhistoryEngine — area ratio metrics (§35)');

ok('Total 1000, Sales 800, BOH 200 -> ratios 0.8 / 0.2', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', storeSizeSqm: 1000, salesAreaSqm: 800, backOfHouseAreaSqm: 200 });
  assert.ok(close(facts.metrics.salesAreaRatio, 0.8));
  assert.ok(close(facts.metrics.backOfHouseAreaRatio, 0.2));
});

ok('ratios are null (not Infinity/NaN) when total area is unknown', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', salesAreaSqm: 800, backOfHouseAreaSqm: 200 });
  assert.equal(facts.metrics.salesAreaRatio, null);
  assert.equal(facts.metrics.backOfHouseAreaRatio, null);
});

ok('ratios are null (not Infinity/NaN) when total area is 0', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', storeSizeSqm: 0, salesAreaSqm: 800 });
  assert.equal(facts.metrics.salesAreaRatio, null);
  assert.notEqual(facts.metrics.salesAreaRatio, Infinity);
});

// ── §36: partial project test — the critical per-dimension proof ───────────
console.log('\nhistoryEngine — partial project (§36): per-dimension eligibility, not one global flag');

ok('COST_ONLY_PROJECT: costPerTotalSqm eligible, actualSchedule/openingPerformance NOT eligible', () => {
  const facts = buildHistoricalProjectFacts(COST_ONLY_PROJECT);
  assert.equal(facts.eligibility.costPerTotalSqm, true);
  assert.equal(facts.eligibility.actualSchedule, false);
  assert.equal(facts.eligibility.openingPerformance, false);
  assert.equal(facts.eligibility.plannedSchedule, false);
  assert.notEqual(facts.metrics.actualCostPerTotalSqm, null); // the metric itself is genuinely computed
});

ok('SCHEDULE_ONLY_PROJECT: schedule dimensions eligible, cost dimensions NOT eligible (no cost data at all)', () => {
  const facts = buildHistoricalProjectFacts(SCHEDULE_ONLY_PROJECT);
  assert.equal(facts.eligibility.plannedSchedule, true);
  assert.equal(facts.eligibility.actualSchedule, true);
  assert.equal(facts.eligibility.openingPerformance, true);
  assert.equal(facts.eligibility.costPerTotalSqm, false);
  assert.equal(facts.eligibility.costPerSalesSqm, false);
  assert.equal(facts.eligibility.costVariance, false);
});

ok('MISSING_ACTUALS_PROJECT: plannedSchedule eligible, actualSchedule/openingPerformance NOT eligible', () => {
  const facts = buildHistoricalProjectFacts(MISSING_ACTUALS_PROJECT);
  assert.equal(facts.eligibility.plannedSchedule, true);
  assert.equal(facts.eligibility.actualSchedule, false);
  assert.equal(facts.eligibility.openingPerformance, false);
  assert.notEqual(facts.metrics.plannedConstructionDays, null);
  assert.equal(facts.metrics.actualConstructionDays, null);
});

// ── §37/§38: imported-vs-live unification — ONE builder, no separate paths ──
console.log('\nhistoryEngine — imported vs. live projects use the exact same builder (§37/§38)');

ok('IMPORTED_SHAPED_PROJECT (no contractor_reports/site_visits/snags/gantt) still derives full metrics', () => {
  const facts = buildHistoricalProjectFacts(IMPORTED_SHAPED_PROJECT);
  assert.equal(facts.eligibility.plannedSchedule, true);
  assert.equal(facts.eligibility.actualSchedule, true);
  assert.equal(facts.eligibility.openingPerformance, true);
  assert.equal(facts.eligibility.costVariance, true);
  assert.equal(facts.eligibility.contractorAttribution, true);
  assert.notEqual(facts.metrics.actualConstructionDays, null);
});

ok('LIVE_IN_PROGRESS_PROJECT (construction ongoing, actual cost not yet known) is handled by the same builder', () => {
  const facts = buildHistoricalProjectFacts(LIVE_IN_PROGRESS_PROJECT);
  assert.equal(facts.eligibility.plannedSchedule, true);   // planned dates known
  assert.equal(facts.eligibility.actualSchedule, false);   // no actual completion yet
  assert.equal(facts.eligibility.costPerTotalSqm, false);  // actual_cost not known yet
  assert.notEqual(facts.metrics.budgetPerTotalSqm, null);  // budget-based metric still computable
});

ok('there is exactly one exported facts builder — no importedHistoricalProjectFacts()/liveProjectFacts() split', async () => {
  const mod = await import('./historyEngine.js');
  const exportedNames = Object.keys(mod);
  assert.deepEqual(exportedNames, ['buildHistoricalProjectFacts']);
});

// ── §39: quality-issue tests ─────────────────────────────────────────────────
console.log('\nhistoryEngine — quality issues (§39) — raw dates are never rewritten');

ok('INVALID_PLANNED_CHRONOLOGY_PROJECT: plannedConstructionDays null, plannedSchedule ineligible, PLANNED_END_BEFORE_START recorded, raw dates unchanged', () => {
  const facts = buildHistoricalProjectFacts(INVALID_PLANNED_CHRONOLOGY_PROJECT);
  assert.equal(facts.metrics.plannedConstructionDays, null);
  assert.equal(facts.eligibility.plannedSchedule, false);
  assert.ok(facts.qualityIssues.some(issue => issue.code === 'PLANNED_END_BEFORE_START'));
  assert.equal(facts.plannedDates.constructionStart, INVALID_PLANNED_CHRONOLOGY_PROJECT.constructionStartDate);
  assert.equal(facts.plannedDates.constructionEnd, INVALID_PLANNED_CHRONOLOGY_PROJECT.constructionEndDate);
});

ok('INVALID_ACTUAL_CHRONOLOGY_PROJECT: actualConstructionDays null, actualSchedule ineligible, ACTUAL_COMPLETION_BEFORE_START recorded', () => {
  const facts = buildHistoricalProjectFacts(INVALID_ACTUAL_CHRONOLOGY_PROJECT);
  assert.equal(facts.metrics.actualConstructionDays, null);
  assert.equal(facts.eligibility.actualSchedule, false);
  assert.ok(facts.qualityIssues.some(issue => issue.code === 'ACTUAL_COMPLETION_BEFORE_START'));
});

ok('target opening before planned construction end -> plannedPreOpeningDays null + PLANNED_OPENING_BEFORE_CONSTRUCTION_END', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', constructionEndDate: '2026-11-15', targetOpeningDate: '2026-08-01' });
  assert.equal(facts.metrics.plannedPreOpeningDays, null);
  assert.ok(facts.qualityIssues.some(issue => issue.code === 'PLANNED_OPENING_BEFORE_CONSTRUCTION_END'));
});

ok('actual opening before actual completion -> actualPreOpeningDays null + ACTUAL_OPENING_BEFORE_COMPLETION', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', actualConstructionCompletionDate: '2026-11-18', actualOpeningDate: '2026-11-10' });
  assert.equal(facts.metrics.actualPreOpeningDays, null);
  assert.ok(facts.qualityIssues.some(issue => issue.code === 'ACTUAL_OPENING_BEFORE_COMPLETION'));
});

ok('sales area exceeding total area is flagged SALES_AREA_EXCEEDS_TOTAL', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', storeSizeSqm: 500, salesAreaSqm: 900 });
  assert.ok(facts.qualityIssues.some(issue => issue.code === 'SALES_AREA_EXCEEDS_TOTAL'));
});

ok('negative area is flagged NEGATIVE_AREA', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', storeSizeSqm: -100 });
  assert.ok(facts.qualityIssues.some(issue => issue.code === 'NEGATIVE_AREA' && issue.field === 'storeSizeSqm'));
});

ok('negative money is flagged NEGATIVE_MONEY', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', budget: -500, currencyCode: 'USD' });
  assert.ok(facts.qualityIssues.some(issue => issue.code === 'NEGATIVE_MONEY' && issue.field === 'budget'));
});

ok('money without currency is flagged MONEY_WITHOUT_CURRENCY, and costVariance eligibility is false as a result', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', budget: 500000, actualCost: 525000 });
  assert.ok(facts.qualityIssues.some(issue => issue.code === 'MONEY_WITHOUT_CURRENCY'));
  assert.equal(facts.eligibility.costVariance, false);
  // the raw variance amount is still a real number — currency is an eligibility/comparability gate, not a math precondition
  assert.equal(facts.metrics.costVarianceAmount, 25000);
});

ok('missing optional data alone is never a quality issue (e.g. actual_cost = null is not "bad data")', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', country: 'Kazakhstan', city: 'Almaty' });
  assert.deepEqual(facts.qualityIssues, []);
});

// ── §40: null vs zero ─────────────────────────────────────────────────────
console.log('\nhistoryEngine — unknown ≠ zero (§40)');

ok('actual_cost = null -> actualCostPerTotalSqm = null (not 0)', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', storeSizeSqm: 1000, actualCost: null, currencyCode: 'USD' });
  assert.equal(facts.metrics.actualCostPerTotalSqm, null);
});

ok('actual_cost = 0 is a real measured value, not silently coerced to null', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', storeSizeSqm: 1000, actualCost: 0, currencyCode: 'USD' });
  assert.equal(facts.financial.actualCost, 0);
  assert.equal(facts.metrics.actualCostPerTotalSqm, 0);
  assert.notEqual(facts.metrics.actualCostPerTotalSqm, null);
});

ok('actual_opening_date = null -> openingVarianceDays = null (not 0 days)', () => {
  const facts = buildHistoricalProjectFacts({ storeCode: 'X', targetOpeningDate: '2026-11-21', actualOpeningDate: null });
  assert.equal(facts.metrics.openingVarianceDays, null);
});

// ── §24: contractor attribution eligibility ─────────────────────────────────
console.log('\nhistoryEngine — contractor attribution eligibility, never a score/rank (§24)');

ok('WITH_GC_PROJECT: contractorAttribution eligible', () => {
  assert.equal(buildHistoricalProjectFacts(WITH_GC_PROJECT).eligibility.contractorAttribution, true);
});
ok('NO_GC_PROJECT: contractorAttribution not eligible', () => {
  assert.equal(buildHistoricalProjectFacts(NO_GC_PROJECT).eligibility.contractorAttribution, false);
});
ok('facts never expose a contractor score/rank/quality field', () => {
  const facts = buildHistoricalProjectFacts(WITH_GC_PROJECT);
  assert.equal(facts.contractor.score, undefined);
  assert.equal(facts.contractor.rank, undefined);
  assert.equal(facts.contractor.quality, undefined);
});

// ── §6: forecast fields are never used as historical truth ─────────────────
console.log('\nhistoryEngine — forecast fields excluded from historical truth (§6)');

ok('constructionCompletionDate/forecastOpeningDate are never read, even when present and different from actuals', () => {
  const facts = buildHistoricalProjectFacts({
    storeCode: 'X',
    constructionEndDate: '2026-11-15', actualConstructionCompletionDate: '2026-11-18',
    targetOpeningDate: '2026-11-21', actualOpeningDate: '2026-11-23',
    // Deliberately contradictory forecast values that would corrupt the
    // result if they were ever mistakenly consulted:
    constructionCompletionDate: '1999-01-01', forecastOpeningDate: '1999-01-01',
  });
  assert.equal(facts.metrics.constructionCompletionVarianceDays, 3); // still actual (11-18) vs planned (11-15)
  assert.equal(facts.metrics.openingVarianceDays, 2); // still actual (11-23) vs target (11-21)
  assert.equal(JSON.stringify(facts).includes('1999-01-01'), false);
});

// ── §32: immutability / determinism ─────────────────────────────────────────
console.log('\nhistoryEngine — immutable, deterministic (§32)');

ok('does not mutate the input project object', () => {
  const project = { ...COMPLETE_MALL_PROJECT };
  const before = JSON.stringify(project);
  buildHistoricalProjectFacts(project);
  assert.equal(JSON.stringify(project), before);
});

ok('same input always produces the same output (deterministic, no hidden clock/random)', () => {
  const a = buildHistoricalProjectFacts(COMPLETE_MALL_PROJECT);
  const b = buildHistoricalProjectFacts(COMPLETE_MALL_PROJECT);
  assert.deepEqual(a, b);
});

ok('a frozen input project can be safely passed (proves no attempted mutation)', () => {
  const frozen = Object.freeze({ ...COMPLETE_STREET_PROJECT });
  assert.doesNotThrow(() => buildHistoricalProjectFacts(frozen));
});

console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
