// benchmarkEngine.test.mjs — Benchmark Engine v1 certification. Consumes
// HistoricalProjectFacts (Historical Data Foundation) only; never recomputes
// a Historical Foundation metric/eligibility, never touches Supabase.
// Run: node src/engines/benchmarkEngine.test.mjs
import assert from 'node:assert/strict';
import { buildProjectBenchmark, buildProjectBenchmarks, BENCHMARK_COHORT_POLICY, SUPPORTED_BENCHMARK_METRICS } from './benchmarkEngine.js';
import { buildHistoricalProjectFacts } from './historyEngine.js';
import { BENCHMARK_TARGET_PROJECT, IMPORTED_SHAPED_PROJECT } from './historyTestFixtures.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  OK ${name}`); };
const close = (a, b, eps = 0.001) => Math.abs(a - b) < eps;

const target = buildHistoricalProjectFacts(BENCHMARK_TARGET_PROJECT);

// A "perfect Tier-1 shape" peer factory: same country/projectType/concept/
// locationType/area as the target, unique storeCode, full actual dates +
// positive cost — override any field per-test to move a peer out of a tier
// or out of eligibility for a specific metric.
let seq = 0;
function peer(overrides = {}) {
  seq += 1;
  return buildHistoricalProjectFacts({
    storeCode: `KZ-BENCH-PEER-${seq}`, country: 'Kazakhstan', city: 'Almaty',
    locationType: 'Mall', projectType: 'New Opening', storeConcept: 'Standard',
    storeSizeSqm: 1000, salesAreaSqm: 700, backOfHouseAreaSqm: 300,
    constructionStartDate: '2025-01-01', constructionEndDate: '2025-04-01', targetOpeningDate: '2025-04-10',
    actualConstructionStartDate: '2025-01-02', actualConstructionCompletionDate: '2025-03-28', actualOpeningDate: '2025-04-09',
    budget: 400000, actualCost: 410000, currencyCode: 'KZT',
    ...overrides,
  });
}
function peers(count, overrides = {}) {
  return Array.from({ length: count }, () => peer(overrides));
}

// ── policy sanity ───────────────────────────────────────────────────────────
console.log('\nbenchmarkEngine — centralized cohort policy (single owner, no scattered literals)');

ok('exactly 4 tiers, exactly 5 supported metrics, min sample size is 3', () => {
  assert.equal(BENCHMARK_COHORT_POLICY.tiers.length, 4);
  assert.equal(BENCHMARK_COHORT_POLICY.minSampleSize, 3);
  assert.deepEqual([...SUPPORTED_BENCHMARK_METRICS].sort(), [
    'actualConstructionDays', 'actualCostPerSalesSqm', 'actualCostPerTotalSqm', 'costVariancePercent', 'openingVarianceDays',
  ].sort());
});

// ── §37 (1): exact close-match cohort ───────────────────────────────────────
console.log('\nbenchmarkEngine — deterministic cohort tiers (§37)');

ok('exact close-match cohort: 4 identical-shape peers -> Tier 1, sampleSize 4', () => {
  const result = buildProjectBenchmark({ target, dataset: peers(4), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.tier, 1);
  assert.equal(result.cohort.tierLabel, 'CLOSE_MATCH');
  assert.equal(result.cohort.sampleSize, 4);
});

ok('Tier 1 -> Tier 2 fallback: Tier 1 has 1 (locationType matches), Tier 2 has 4 (locationType may differ)', () => {
  const dataset = [
    peer({ locationType: 'Mall' }),
    ...peers(3, { locationType: 'Street' }),
  ];
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualConstructionDays' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.tier, 2);
  assert.equal(result.cohort.tierLabel, 'STRONG_MATCH');
  assert.equal(result.cohort.sampleSize, 4);
  assert.equal(result.cohort.tiersEvaluated[0].sampleSize, 1); // Tier 1 alone was insufficient
});

ok('Tier 2 -> Tier 3 fallback: Tier 2 has 2 (concept matches), Tier 3 has 4 (concept may differ)', () => {
  const dataset = [
    ...peers(2, { locationType: 'Street' }), // fails Tier 1 (location), passes Tier 2 (concept still Standard)
    ...peers(2, { storeConcept: 'Flagship', storeSizeSqm: 1300 }), // fails Tier 1 & 2 (concept), passes Tier 3 (area within +-50%)
  ];
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualConstructionDays' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.tier, 3);
  assert.equal(result.cohort.tierLabel, 'BROAD_MATCH');
  assert.equal(result.cohort.sampleSize, 4);
  assert.equal(result.cohort.tiersEvaluated[1].sampleSize, 2); // Tier 2 alone was insufficient
});

ok('Tier 3 -> Tier 4 fallback: Tier 3 has 0 (area far outside +-50%), Tier 4 has 3 (no area restriction)', () => {
  const dataset = peers(3, { storeSizeSqm: 2000 });
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualConstructionDays' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.tier, 4);
  assert.equal(result.cohort.tierLabel, 'MARKET_PROJECT_TYPE');
  assert.equal(result.cohort.sampleSize, 3);
  assert.equal(result.cohort.tiersEvaluated[2].sampleSize, 0);
});

ok('all tiers insufficient: 2 identical-shape peers never reach the minimum of 3 in any tier -> INSUFFICIENT_EVIDENCE, never fabricated', () => {
  const result = buildProjectBenchmark({ target, dataset: peers(2), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.statistics, null);
  assert.equal(result.comparison, null);
  assert.equal(result.cohort.tier, null); // no winning cohort — nothing fabricated
  assert.equal(result.cohort.bestAvailableTier, 1); // strongest tier wins ties
  assert.equal(result.cohort.bestAvailableSampleSize, 2);
  for (const t of result.cohort.tiersEvaluated) assert.ok(t.sampleSize <= 2);
});

ok('different country excluded, even though every other field matches: 5 KZT peers count, 5 UAE peers never do', () => {
  const dataset = [...peers(5), ...peers(5, { country: 'United Arab Emirates' })];
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.sampleSize, 5);
});

ok('different projectType excluded, even though every other field matches', () => {
  const dataset = [...peers(5), ...peers(5, { projectType: 'Rebuilding' })];
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.sampleSize, 5);
});

ok('different currency excluded for an absolute cost-per-area metric', () => {
  const dataset = [...peers(5), ...peers(5, { currencyCode: 'USD' })];
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.sampleSize, 5);
  assert.equal(result.cohort.criteria.currencyCode, 'KZT');
});

ok('different currency is ALLOWED for the dimensionless costVariancePercent (no FX boundary on a percent)', () => {
  const dataset = [...peers(5), ...peers(5, { currencyCode: 'USD' })];
  const result = buildProjectBenchmark({ target, dataset, metric: 'costVariancePercent' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.sampleSize, 10);
  assert.equal(result.cohort.criteria.currencyCode, undefined);
});

ok('multiple currencies never combined for absolute cost metrics (KZT + USD + EUR all present, only target currency counted)', () => {
  const dataset = [...peers(3), ...peers(3, { currencyCode: 'USD' }), ...peers(3, { currencyCode: 'EUR' })];
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.sampleSize, 3);
});

ok('the target project is excluded from its own cohort by stable identity (storeCode), not just array reference', () => {
  const selfAsCandidate = buildHistoricalProjectFacts(BENCHMARK_TARGET_PROJECT); // same storeCode, different object
  const dataset = [selfAsCandidate, ...peers(3)];
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.equal(result.cohort.sampleSize, 3);
  assert.ok(!result.cohort.projectIdentities.some(p => p.storeCode === target.identity.storeCode));
});

ok('missing target storeConcept: Tier 1/2 (which require a known matching concept) never match, falls back to Tier 3', () => {
  const conceptlessTarget = buildHistoricalProjectFacts({ ...BENCHMARK_TARGET_PROJECT, storeConcept: undefined });
  const result = buildProjectBenchmark({ target: conceptlessTarget, dataset: peers(4), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.tier, 3);
  assert.equal(result.cohort.tiersEvaluated[0].sampleSize, 0);
  assert.equal(result.cohort.tiersEvaluated[1].sampleSize, 0);
});

ok('missing target locationType: Tier 1 (which requires a known matching locationType) never matches, falls back to Tier 2', () => {
  const locationlessTarget = buildHistoricalProjectFacts({ ...BENCHMARK_TARGET_PROJECT, locationType: undefined });
  const result = buildProjectBenchmark({ target: locationlessTarget, dataset: peers(4), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.tier, 2);
  assert.equal(result.cohort.tiersEvaluated[0].sampleSize, 0);
});

ok('missing target totalArea: every area-tolerant tier (1-3) is unsatisfiable without dividing by zero; only Tier 4 can match', () => {
  const arealessTarget = buildHistoricalProjectFacts({ ...BENCHMARK_TARGET_PROJECT, storeSizeSqm: undefined });
  const result = buildProjectBenchmark({ target: arealessTarget, dataset: peers(4), metric: 'actualConstructionDays' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.tier, 4);
  assert.equal(result.cohort.tiersEvaluated[0].sampleSize, 0);
  assert.equal(result.cohort.tiersEvaluated[1].sampleSize, 0);
  assert.equal(result.cohort.tiersEvaluated[2].sampleSize, 0);
});

ok('zero actual cost excluded from a cost-per-area cohort (Benchmark comparability policy), but not from costVariancePercent', () => {
  const dataset = [...peers(3), peer({ actualCost: 0 })];
  const costResult = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.equal(costResult.cohort.sampleSize, 3); // zero-cost peer excluded
  const varianceResult = buildProjectBenchmark({ target, dataset, metric: 'costVariancePercent' });
  assert.equal(varianceResult.cohort.sampleSize, 4); // zero-cost peer still counted (dimensionless %, not cost-per-area)
});

ok('an invalid historical project (bad actual chronology) is excluded via Historical Foundation eligibility, not a Benchmark-invented rule', () => {
  const badChronologyPeer = peer({ actualConstructionStartDate: '2025-03-01', actualConstructionCompletionDate: '2025-01-01' });
  assert.equal(badChronologyPeer.eligibility.actualSchedule, false); // Historical Foundation's own flag
  const dataset = [...peers(3), badChronologyPeer];
  const scheduleResult = buildProjectBenchmark({ target, dataset, metric: 'actualConstructionDays' });
  assert.equal(scheduleResult.cohort.sampleSize, 3); // excluded from the schedule metric
  const openingResult = buildProjectBenchmark({ target, dataset, metric: 'openingVarianceDays' });
  assert.equal(openingResult.cohort.sampleSize, 4); // still counted for a metric its bad chronology doesn't affect
});

ok('early-opening negative variance is preserved in the cohort and its median (never made absolute)', () => {
  const dataset = peers(3, { targetOpeningDate: '2025-04-10', actualOpeningDate: '2025-04-05' }); // -5 days each
  const result = buildProjectBenchmark({ target, dataset, metric: 'openingVarianceDays' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.statistics.median, -5);
  assert.ok(result.statistics.min < 0 && result.statistics.max < 0);
});

ok('imported-shaped and live-shaped projects are treated identically as cohort candidates (Benchmark never inspects operational fields)', () => {
  const liveShapedEquivalent = buildHistoricalProjectFacts({
    ...IMPORTED_SHAPED_PROJECT, storeCode: 'KZ-LIVE-EQUIV-1',
    templateType: 'standard_with_demo', ganttGeneratedAt: '2026-01-01T00:00:00.000Z', // live-only operational fields
  });
  const importedFacts = buildHistoricalProjectFacts(IMPORTED_SHAPED_PROJECT);
  const t = buildHistoricalProjectFacts({ ...BENCHMARK_TARGET_PROJECT, country: importedFacts.location.country, projectType: importedFacts.classification.projectType });
  const importedOnly = buildProjectBenchmark({ target: t, dataset: [importedFacts, ...peers(2, { country: importedFacts.location.country })], metric: 'actualCostPerTotalSqm' });
  const liveOnly = buildProjectBenchmark({ target: t, dataset: [liveShapedEquivalent, ...peers(2, { country: importedFacts.location.country })], metric: 'actualCostPerTotalSqm' });
  assert.equal(importedOnly.cohort.sampleSize, liveOnly.cohort.sampleSize);
  assert.equal(importedOnly.status, liveOnly.status);
});

// ── §39: area-tolerance exact boundary ──────────────────────────────────────
console.log('\nbenchmarkEngine — area-tolerance exact boundary (§39, target totalArea 1000, Tier 1 +-25%)');

ok('750 and 1250 are inclusive (exactly on the boundary), 749 and 1251 are excluded', () => {
  const dataset = [
    peer({ storeSizeSqm: 750 }),
    peer({ storeSizeSqm: 1250 }),
    peer({ storeSizeSqm: 749 }),
    peer({ storeSizeSqm: 1251 }),
  ];
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.equal(result.cohort.tiersEvaluated[0].sampleSize, 2); // Tier 1 counts only 750 and 1250
});

// ── §40: per-dimension cohorts differ for the same target ──────────────────
console.log('\nbenchmarkEngine — per-dimension cohorts differ for the same target, no universal cohort (§40)');

ok('cost, schedule, and opening cohorts can have different sample sizes from the same dataset', () => {
  const dataset = [
    ...peers(5), // full data: eligible for every metric
    ...peers(3, { actualCost: undefined, budget: undefined }), // schedule/opening only, not cost
  ];
  const cost = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  const schedule = buildProjectBenchmark({ target, dataset, metric: 'actualConstructionDays' });
  assert.equal(cost.cohort.sampleSize, 5);
  assert.equal(schedule.cohort.sampleSize, 8);
  assert.notEqual(cost.cohort.sampleSize, schedule.cohort.sampleSize);
});

// ── §38: statistics ──────────────────────────────────────────────────────────
console.log('\nbenchmarkEngine — statistics: min/max/mean/median/p25/p75 (§38)');

ok('odd sample size (3): median is the middle value, p25/p75 via linear interpolation', () => {
  const dataset = [400, 410, 420].map(costPerSqm => peer({ actualCost: costPerSqm * 1000, storeSizeSqm: 1000 }));
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.equal(result.statistics.sampleSize, 3);
  assert.equal(result.statistics.min, 400);
  assert.equal(result.statistics.max, 420);
  assert.ok(close(result.statistics.mean, 410));
  assert.ok(close(result.statistics.median, 410));
  assert.ok(close(result.statistics.p25, 405));
  assert.ok(close(result.statistics.p75, 415));
});

ok('even sample size (4): median averages the two middle values', () => {
  const dataset = [400, 410, 420, 430].map(costPerSqm => peer({ actualCost: costPerSqm * 1000, storeSizeSqm: 1000 }));
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.ok(close(result.statistics.median, 415));
  assert.ok(close(result.statistics.mean, 415));
  assert.ok(close(result.statistics.p25, 407.5));
  assert.ok(close(result.statistics.p75, 422.5));
});

ok('exactly 3 projects is the minimum AVAILABLE sample (2 is insufficient, 3 is available)', () => {
  assert.equal(buildProjectBenchmark({ target, dataset: peers(2), metric: 'actualConstructionDays' }).status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(buildProjectBenchmark({ target, dataset: peers(3), metric: 'actualConstructionDays' }).status, 'AVAILABLE');
});

ok('decimal values are handled without rounding error beyond float tolerance', () => {
  const dataset = [333333, 366667, 400000].map(actualCost => peer({ actualCost, storeSizeSqm: 1000 }));
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.ok(close(result.statistics.median, 366.667, 0.01));
});

ok('zero median never produces NaN/Infinity in percentFromMedian (0-day construction cohort)', () => {
  const dataset = peers(3, { actualConstructionStartDate: '2025-02-01', actualConstructionCompletionDate: '2025-02-01' }); // 0-day duration each
  const result = buildProjectBenchmark({ target, dataset, metric: 'actualConstructionDays' });
  assert.equal(result.statistics.median, 0);
  assert.equal(result.comparison.percentFromMedian, null);
  assert.ok(Number.isFinite(result.comparison.deltaFromMedian));
});

ok('openingVarianceDays never derives percentFromMedian at all (signed metric, can legitimately be 0)', () => {
  const dataset = peers(3);
  const result = buildProjectBenchmark({ target, dataset, metric: 'openingVarianceDays' });
  assert.equal(result.comparison.percentFromMedian, null);
});

// ── target semantics fix: cohort eligibility ≠ target comparison
// availability. A project must be able to receive a historical benchmark
// BEFORE it has its own actual outcome (§28 test matrix). ──────────────────
console.log('\nbenchmarkEngine — cohort eligibility vs. target comparison availability (in-progress target)');

// A brand-new/in-progress target: enough context to define a cohort
// (country/projectType/concept/locationType/area/currency), but NO actual
// outcome data at all (no actualCost, no budget, no actual dates).
const inProgressTargetRaw = {
  storeCode: 'KZ-BENCH-INPROGRESS-1', country: 'Kazakhstan', city: 'Almaty',
  locationType: 'Mall', projectType: 'Rebuilding', storeConcept: 'Flagship',
  storeSizeSqm: 1000, currencyCode: 'KZT',
};
const inProgressTarget = buildHistoricalProjectFacts(inProgressTargetRaw);
// The exact same project, later — same cohort-defining context, now with a
// measured outcome. Same storeCode: this is meant to represent one project
// at two points in time, not two different projects.
const completedTarget = buildHistoricalProjectFacts({ ...inProgressTargetRaw, actualCost: 530000, budget: 500000, salesAreaSqm: 700 });
const rebuildFlagshipPeers = (count, overrides = {}) => peers(count, { projectType: 'Rebuilding', storeConcept: 'Flagship', ...overrides });

ok('1. in-progress target (no actualCost) still gets AVAILABLE cost-per-sqm benchmark from a valid cohort', () => {
  const result = buildProjectBenchmark({ target: inProgressTarget, dataset: rebuildFlagshipPeers(4), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.sampleSize, 4);
  assert.ok(result.statistics);
});

ok('2. in-progress target (no actual schedule dates) still gets AVAILABLE construction-duration benchmark', () => {
  const result = buildProjectBenchmark({ target: inProgressTarget, dataset: rebuildFlagshipPeers(4), metric: 'actualConstructionDays' });
  assert.equal(result.status, 'AVAILABLE');
  assert.ok(result.statistics);
});

ok('3. in-progress target (no actual opening) still gets AVAILABLE opening-variance benchmark', () => {
  const result = buildProjectBenchmark({ target: inProgressTarget, dataset: rebuildFlagshipPeers(4), metric: 'openingVarianceDays' });
  assert.equal(result.status, 'AVAILABLE');
  assert.ok(result.statistics);
});

ok('4. in-progress target (no budget/actualCost) still gets AVAILABLE costVariancePercent benchmark', () => {
  const result = buildProjectBenchmark({ target: inProgressTarget, dataset: rebuildFlagshipPeers(4), metric: 'costVariancePercent' });
  assert.equal(result.status, 'AVAILABLE');
  assert.ok(result.statistics);
});

ok('5/6. missing target metric value -> comparisonAvailable false and comparison null (never fabricated)', () => {
  const result = buildProjectBenchmark({ target: inProgressTarget, dataset: rebuildFlagshipPeers(4), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.target.value, null);
  assert.equal(result.target.comparisonAvailable, false);
  assert.equal(result.comparison, null);
});

ok('7/8. known target metric value -> comparisonAvailable true and comparison present', () => {
  const result = buildProjectBenchmark({ target, dataset: peers(4), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.target.comparisonAvailable, true);
  assert.ok(result.comparison);
  assert.ok(Number.isFinite(result.comparison.deltaFromMedian));
});

ok('9. cohort and statistics are byte-identical whether the target has a known actual outcome or not (regression guard)', () => {
  const dataset = rebuildFlagshipPeers(4);
  const before = buildProjectBenchmark({ target: inProgressTarget, dataset, metric: 'actualCostPerTotalSqm' });
  const after = buildProjectBenchmark({ target: completedTarget, dataset, metric: 'actualCostPerTotalSqm' });
  assert.deepEqual(before.cohort, after.cohort);
  assert.deepEqual(before.statistics, after.statistics);
  assert.equal(before.comparison, null);
  assert.ok(after.comparison);
});

ok('10. missing target country -> TARGET_NOT_ELIGIBLE', () => {
  const t = buildHistoricalProjectFacts({ ...inProgressTargetRaw, country: undefined });
  const result = buildProjectBenchmark({ target: t, dataset: rebuildFlagshipPeers(4), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'TARGET_NOT_ELIGIBLE');
  assert.match(result.reason, /country/);
});

ok('11. missing target projectType -> TARGET_NOT_ELIGIBLE (no cross-project-type fallback)', () => {
  const t = buildHistoricalProjectFacts({ ...inProgressTargetRaw, projectType: undefined });
  const result = buildProjectBenchmark({ target: t, dataset: rebuildFlagshipPeers(4), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'TARGET_NOT_ELIGIBLE');
  assert.match(result.reason, /projectType/);
});

ok('12. absolute-cost metric with target missing currency -> TARGET_NOT_ELIGIBLE (no FX fallback)', () => {
  const t = buildHistoricalProjectFacts({ ...inProgressTargetRaw, currencyCode: undefined });
  const result = buildProjectBenchmark({ target: t, dataset: rebuildFlagshipPeers(4), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'TARGET_NOT_ELIGIBLE');
  assert.match(result.reason, /currency/);
});

ok('13. costVariancePercent target missing currency may still benchmark (dimensionless, no currency requirement)', () => {
  const t = buildHistoricalProjectFacts({ ...inProgressTargetRaw, currencyCode: undefined });
  const result = buildProjectBenchmark({ target: t, dataset: rebuildFlagshipPeers(4), metric: 'costVariancePercent' });
  assert.equal(result.status, 'AVAILABLE');
});

ok('14. historical candidates still require Historical Foundation eligibility, even when the target itself has no actuals', () => {
  const badChronologyPeer = peer({ projectType: 'Rebuilding', storeConcept: 'Flagship', actualConstructionStartDate: '2025-03-01', actualConstructionCompletionDate: '2025-01-01' });
  const dataset = [...rebuildFlagshipPeers(3), badChronologyPeer];
  const result = buildProjectBenchmark({ target: inProgressTarget, dataset, metric: 'actualConstructionDays' });
  assert.equal(result.cohort.sampleSize, 3); // bad-chronology peer still excluded
});

ok('15. the in-progress target is still excluded from its own cohort by identity, even with no actual metric value', () => {
  const dataset = [completedTarget, ...rebuildFlagshipPeers(4)]; // completedTarget shares inProgressTarget's storeCode
  const result = buildProjectBenchmark({ target: inProgressTarget, dataset, metric: 'actualCostPerTotalSqm' });
  assert.ok(!result.cohort.projectIdentities.some(p => p.storeCode === 'KZ-BENCH-INPROGRESS-1'));
  assert.equal(result.cohort.sampleSize, 4);
});

ok('16. buildProjectBenchmarks: an in-progress target can receive all 5 supported dimensions, all comparisonAvailable=false', () => {
  const dataset = rebuildFlagshipPeers(5);
  const results = buildProjectBenchmarks(inProgressTarget, dataset);
  for (const metric of SUPPORTED_BENCHMARK_METRICS) {
    assert.equal(results[metric].status, 'AVAILABLE', `${metric} should be AVAILABLE`);
    assert.equal(results[metric].target.comparisonAvailable, false, `${metric} comparisonAvailable should be false`);
    assert.equal(results[metric].comparison, null, `${metric} comparison should be null`);
  }
});

ok('17. target actualCost = 0 (explicit, not missing) preserves unknown != zero but is still non-comparable for cost-per-area (existing zero-cost policy applies to target too)', () => {
  const zeroCostTarget = buildHistoricalProjectFacts({ ...inProgressTargetRaw, actualCost: 0 });
  const result = buildProjectBenchmark({ target: zeroCostTarget, dataset: rebuildFlagshipPeers(4), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE'); // cohort context (country/type/currency) is still fine
  assert.equal(result.target.value, 0); // unknown != zero — explicit 0, not null
  assert.equal(result.target.comparisonAvailable, false); // but not meaningful cost-per-area comparison evidence
  assert.equal(result.comparison, null);
});

ok('18. insufficient historical sample still returns INSUFFICIENT_EVIDENCE for an in-progress target (never fabricated)', () => {
  const result = buildProjectBenchmark({ target: inProgressTarget, dataset: rebuildFlagshipPeers(2), metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.target.comparisonAvailable, false);
  assert.equal(result.statistics, null);
});

// ── worked examples from the product brief, reproduced exactly ─────────────
console.log('\nbenchmarkEngine — worked examples (cost/schedule/opening, in-progress vs completed)');

ok('worked example (cost, in-progress): 4-project KZT cohort, target has no actual cost yet', () => {
  const t = buildHistoricalProjectFacts({
    storeCode: 'KZ-BENCH-EX-COST', country: 'Kazakhstan', projectType: 'Rebuilding', storeConcept: 'Flagship', locationType: 'Mall',
    storeSizeSqm: 1000, currencyCode: 'KZT',
  });
  const dataset = [480000, 500000, 520000, 550000].map(actualCost => peer({ projectType: 'Rebuilding', storeConcept: 'Flagship', actualCost, storeSizeSqm: 1000 }));
  const result = buildProjectBenchmark({ target: t, dataset, metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.sampleSize, 4);
  assert.equal(result.target.value, null);
  assert.equal(result.target.comparisonAvailable, false);
  assert.equal(result.comparison, null);
  assert.ok(close(result.statistics.median, 510)); // (500 + 520) / 2
});

ok('worked example (cost, completed): same target/cohort, actual now known -> same cohort+statistics, comparison now present', () => {
  const t = buildHistoricalProjectFacts({
    storeCode: 'KZ-BENCH-EX-COST', country: 'Kazakhstan', projectType: 'Rebuilding', storeConcept: 'Flagship', locationType: 'Mall',
    storeSizeSqm: 1000, currencyCode: 'KZT', actualCost: 530000000, // -> actualCostPerTotalSqm = 530000
  });
  const dataset = [480000, 500000, 520000, 550000].map(actualCost => peer({ projectType: 'Rebuilding', storeConcept: 'Flagship', actualCost, storeSizeSqm: 1000 }));
  const result = buildProjectBenchmark({ target: t, dataset, metric: 'actualCostPerTotalSqm' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.cohort.sampleSize, 4); // same cohort as the in-progress example
  assert.equal(result.target.value, 530000);
  assert.equal(result.target.comparisonAvailable, true);
  assert.ok(result.comparison);
  assert.ok(close(result.statistics.median, 510)); // same statistics as the in-progress example
  assert.ok(close(result.comparison.deltaFromMedian, 530000 - 510));
});

ok('worked example (schedule): in-progress target with no actualConstructionDays still gets historical duration statistics', () => {
  const t = buildHistoricalProjectFacts({ storeCode: 'KZ-BENCH-EX-SCHED', country: 'Kazakhstan', projectType: 'New Opening' });
  const result = buildProjectBenchmark({ target: t, dataset: peers(4), metric: 'actualConstructionDays' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.target.comparisonAvailable, false);
  assert.ok(result.statistics);
});

ok('worked example (opening): target has targetOpeningDate but no actualOpeningDate yet, still gets opening-variance statistics', () => {
  const t = buildHistoricalProjectFacts({ storeCode: 'KZ-BENCH-EX-OPEN', country: 'Kazakhstan', projectType: 'New Opening', targetOpeningDate: '2025-06-01' });
  const result = buildProjectBenchmark({ target: t, dataset: peers(4), metric: 'openingVarianceDays' });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.target.comparisonAvailable, false);
  assert.ok(result.statistics);
});

// ── portfolio builder ───────────────────────────────────────────────────────
console.log('\nbenchmarkEngine — buildProjectBenchmarks (all 5 metrics at once, no UI)');

ok('returns all 5 supported metrics, each independently resolved', () => {
  const results = buildProjectBenchmarks(target, peers(5));
  assert.deepEqual(Object.keys(results).sort(), [...SUPPORTED_BENCHMARK_METRICS].sort());
  for (const metric of SUPPORTED_BENCHMARK_METRICS) assert.equal(results[metric].metric, metric);
});

// ── determinism ──────────────────────────────────────────────────────────────
console.log('\nbenchmarkEngine — pure and deterministic');

ok('same target/dataset/metric always produces the same result (no hidden clock/random/persisted state)', () => {
  const dataset = peers(4);
  const a = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  const b = buildProjectBenchmark({ target, dataset, metric: 'actualCostPerTotalSqm' });
  assert.deepEqual(a, b);
});

ok('unsupported metric throws rather than silently guessing', () => {
  assert.throws(() => buildProjectBenchmark({ target, dataset: peers(3), metric: 'contractorScore' }));
});

console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
