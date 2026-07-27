// costIntelligenceEngine.test.mjs — Cost Intelligence Engine v1
// certification. Consumes HistoricalProjectFacts (Historical Data
// Foundation) only; never recomputes a Historical Foundation metric/
// eligibility; no target project (dataset-wide breakdown, not a cohort).
// Run: node src/engines/costIntelligenceEngine.test.mjs
import assert from 'node:assert/strict';
import { buildCostIntelligence, SUPPORTED_COST_INTELLIGENCE_METRICS, SUPPORTED_COST_INTELLIGENCE_DIMENSIONS, COST_INTELLIGENCE_POLICY } from './costIntelligenceEngine.js';
import { buildHistoricalProjectFacts } from './historyEngine.js';
import { IMPORTED_SHAPED_PROJECT } from './historyTestFixtures.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  OK ${name}`); };
const close = (a, b, eps = 0.001) => Math.abs(a - b) < eps;

// A "clean Kazakhstan/Rebuilding/KZT" project factory — unique storeCode per
// call, override any field per-test. Mirrors benchmarkEngine.test.mjs's own
// peer() convention.
let seq = 0;
function project(overrides = {}) {
  seq += 1;
  return buildHistoricalProjectFacts({
    storeCode: `CI-${seq}`, country: 'Kazakhstan', city: 'Almaty',
    locationType: 'Mall', projectType: 'Rebuilding', storeConcept: 'Flagship',
    storeSizeSqm: 1000, salesAreaSqm: 700,
    budget: 400000, actualCost: 410000, currencyCode: 'KZT',
    ...overrides,
  });
}
function projects(count, overrides = {}) {
  return Array.from({ length: count }, () => project(overrides));
}
function findGroup(result, predicate) {
  return result.groups.find(g => predicate(g.identity));
}

// ── sanity: exactly 3 metrics, exactly 4 dimensions, min sample size 3 ─────
console.log('\ncostIntelligenceEngine — policy sanity (§8, §9, §22)');

ok('exactly 3 supported metrics: actualCostPerTotalSqm, actualCostPerSalesSqm, costVariancePercent', () => {
  assert.deepEqual([...SUPPORTED_COST_INTELLIGENCE_METRICS].sort(), ['actualCostPerSalesSqm', 'actualCostPerTotalSqm', 'costVariancePercent']);
});
ok('exactly 4 supported dimensions: country, projectType, storeConcept, locationType', () => {
  assert.deepEqual([...SUPPORTED_COST_INTELLIGENCE_DIMENSIONS].sort(), ['country', 'locationType', 'projectType', 'storeConcept']);
});
ok('minimum sample size is 3, its own dedicated policy constant', () => {
  assert.equal(COST_INTELLIGENCE_POLICY.minSampleSize, 3);
});
ok('unsupported metric throws rather than silently guessing', () => {
  assert.throws(() => buildCostIntelligence({ dataset: [], metric: 'budgetPerTotalSqm', groupBy: 'country' }));
});
ok('unsupported groupBy throws rather than silently guessing', () => {
  assert.throws(() => buildCostIntelligence({ dataset: [], metric: 'actualCostPerTotalSqm', groupBy: 'contractor' }));
});

// ── §35: country test ───────────────────────────────────────────────────────
console.log('\ncostIntelligenceEngine — group by country (§35)');

ok('Kazakhstan/KZT x3 and China/CNY x3 form 2 independent groups, no cross-country statistics', () => {
  const dataset = [
    ...projects(3, { country: 'Kazakhstan', currencyCode: 'KZT' }),
    ...projects(3, { country: 'China', currencyCode: 'CNY' }),
  ];
  const result = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  assert.equal(result.groups.length, 2);
  const kz = findGroup(result, i => i.country === 'Kazakhstan');
  const cn = findGroup(result, i => i.country === 'China');
  assert.equal(kz.sampleSize, 3);
  assert.equal(cn.sampleSize, 3);
  // groupBy='country' never duplicates country as a redundant dimension/dimensionValue pair (§14)
  assert.equal(kz.identity.dimension, undefined);
  assert.equal(kz.identity.dimensionValue, undefined);
});

// ── §36: same country / multi-currency test ─────────────────────────────────
console.log('\ncostIntelligenceEngine — same country, multiple currencies never merge (§36, §11)');

ok('Kazakhstan/KZT x3 and Kazakhstan/USD x3 are separate statistical groups, never one mixed median', () => {
  const dataset = [
    ...projects(3, { currencyCode: 'KZT' }),
    ...projects(3, { currencyCode: 'USD' }),
  ];
  const result = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  assert.equal(result.groups.length, 2);
  const kzt = findGroup(result, i => i.currencyCode === 'KZT');
  const usd = findGroup(result, i => i.currencyCode === 'USD');
  assert.equal(kzt.sampleSize, 3);
  assert.equal(usd.sampleSize, 3);
});

// ── §37: cost variance % multi-currency test — no currency split ──────────
console.log('\ncostIntelligenceEngine — costVariancePercent does not partition by currency (§37, §12)');

ok('Kazakhstan/KZT + Kazakhstan/USD + Kazakhstan/EUR all fall into ONE Kazakhstan cost-variance group (dimensionless metric)', () => {
  const dataset = [
    ...projects(1, { currencyCode: 'KZT', budget: 500000, actualCost: 520000 }),
    ...projects(1, { currencyCode: 'USD', budget: 500000, actualCost: 520000 }),
    ...projects(1, { currencyCode: 'EUR', budget: 500000, actualCost: 520000 }),
  ];
  const result = buildCostIntelligence({ dataset, metric: 'costVariancePercent', groupBy: 'country' });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].sampleSize, 3);
  assert.equal(result.groups[0].identity.currencyCode, undefined); // no currency partition for this metric
  assert.equal(result.policy.currencyPartition, false);
});

// ── §38: project-type breakdown test ────────────────────────────────────────
console.log('\ncostIntelligenceEngine — group by project type (§38)');

ok('Rebuilding(4) -> AVAILABLE, New Opening(3) -> AVAILABLE, Refit(2) -> INSUFFICIENT_EVIDENCE (sample size still evidence)', () => {
  const dataset = [
    ...projects(4, { projectType: 'Rebuilding' }),
    ...projects(3, { projectType: 'New Opening' }),
    ...projects(2, { projectType: 'Refit' }),
  ];
  const result = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'projectType' });
  const rebuilding = findGroup(result, i => i.dimensionValue === 'Rebuilding');
  const newOpening = findGroup(result, i => i.dimensionValue === 'New Opening');
  const refit = findGroup(result, i => i.dimensionValue === 'Refit');
  assert.equal(rebuilding.status, 'AVAILABLE');
  assert.equal(rebuilding.sampleSize, 4);
  assert.equal(newOpening.status, 'AVAILABLE');
  assert.equal(newOpening.sampleSize, 3);
  assert.equal(refit.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(refit.sampleSize, 2); // not discarded — sample size remains visible evidence
  assert.equal(refit.statistics, null);
});

// ── §39: concept missing test ───────────────────────────────────────────────
console.log('\ncostIntelligenceEngine — missing dimension value excluded, never a fake "Unknown" group (§39, §18, §16)');

ok('Flagship(3) + Standard(3) + null-concept(2) -> two real groups + excludedMissingDimension = 2', () => {
  const dataset = [
    ...projects(3, { storeConcept: 'Flagship' }),
    ...projects(3, { storeConcept: 'Standard' }),
    ...projects(2, { storeConcept: undefined }),
  ];
  const result = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'storeConcept' });
  assert.equal(result.groups.length, 2);
  assert.ok(!result.groups.some(g => g.identity.dimensionValue == null || g.identity.dimensionValue === 'Unknown'));
  assert.equal(result.exclusions.missingDimension, 2);
});

// ── §40: location type test ─────────────────────────────────────────────────
console.log('\ncostIntelligenceEngine — group by location type (§40)');

ok('Mall(4) and Street(3) form two groups with independent statistics', () => {
  const dataset = [
    ...projects(4, { locationType: 'Mall' }),
    ...projects(3, { locationType: 'Street' }),
  ];
  const result = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'locationType' });
  assert.equal(result.groups.length, 2);
  const mall = findGroup(result, i => i.dimensionValue === 'Mall');
  const street = findGroup(result, i => i.dimensionValue === 'Street');
  assert.equal(mall.sampleSize, 4);
  assert.equal(street.sampleSize, 3);
});

// ── §41: outlier test ────────────────────────────────────────────────────────
console.log('\ncostIntelligenceEngine — outliers are never silently removed (§41, §24)');

ok('an extreme value (2000 vs ~500-520) stays in the group, sampleSize=4, no trimming', () => {
  const dataset = [500, 510, 520, 2000].map(actualCost => project({ actualCost, storeSizeSqm: 1000 }));
  const result = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  const kz = result.groups[0];
  assert.equal(kz.sampleSize, 4);
  assert.equal(kz.statistics.max, 2);
  assert.ok(kz.statistics.mean > 0.52); // outlier pulls the mean up — proves it wasn't discarded
});

// ── §42: budget performance test ────────────────────────────────────────────
console.log('\ncostIntelligenceEngine — budget-performance counts (§42, §25)');

ok('variance values -5/0/+2/+10 -> underBudget=1, onBudget=1, overBudget=2, overBudgetRate=0.5', () => {
  const dataset = [-5, 0, 2, 10].map(variancePercent => {
    const budget = 500000;
    const actualCost = budget * (1 + variancePercent / 100);
    return project({ budget, actualCost, storeSizeSqm: 1000 });
  });
  const result = buildCostIntelligence({ dataset, metric: 'costVariancePercent', groupBy: 'country' });
  const kz = result.groups[0];
  assert.equal(kz.sampleSize, 4);
  assert.equal(kz.budgetPerformance.underBudgetCount, 1);
  assert.equal(kz.budgetPerformance.onBudgetCount, 1);
  assert.equal(kz.budgetPerformance.overBudgetCount, 2);
  assert.ok(close(kz.budgetPerformance.overBudgetRate, 0.5));
});

ok('cost-per-area groups never receive budgetPerformance metadata (§26)', () => {
  const dataset = projects(3);
  const result = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  assert.equal(result.groups[0].budgetPerformance, null);
});

// ── §43: zero actual cost test ──────────────────────────────────────────────
console.log('\ncostIntelligenceEngine — zero actual cost excluded from cost-per-area evidence, factual zero untouched (§43, §5)');

ok('actualCost = 0 is excluded from actualCostPerTotalSqm evidence and recorded deterministically, never mutated to null', () => {
  const zeroCostProject = project({ actualCost: 0 });
  assert.equal(zeroCostProject.financial.actualCost, 0); // Historical Foundation fact — untouched
  const dataset = [...projects(3), zeroCostProject];
  const result = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  assert.equal(result.groups[0].sampleSize, 3); // zero-cost project excluded
  assert.equal(result.exclusions.nonPositiveActualCost, 1);
  assert.equal(zeroCostProject.financial.actualCost, 0); // still untouched after the call
});

ok('actualCost = 0 does NOT exclude the project from costVariancePercent evidence (dimensionless, no positive-cost requirement)', () => {
  const zeroCostProject = project({ actualCost: 0, budget: 500000 });
  const dataset = [...projects(3, { budget: 500000, actualCost: 520000 }), zeroCostProject];
  const result = buildCostIntelligence({ dataset, metric: 'costVariancePercent', groupBy: 'country' });
  assert.equal(result.groups[0].sampleSize, 4);
});

// ── §44: imported vs live test ──────────────────────────────────────────────
console.log('\ncostIntelligenceEngine — imported-shaped and live-shaped projects contribute identically (§44, §32)');

ok('an imported-shaped project and an equivalent live-shaped project (extra operational fields) produce the same group membership', () => {
  const liveShapedEquivalent = buildHistoricalProjectFacts({
    ...IMPORTED_SHAPED_PROJECT, storeCode: 'CI-LIVE-EQUIV-1',
    templateType: 'standard_with_demo', ganttGeneratedAt: '2026-01-01T00:00:00.000Z', // live-only operational fields
  });
  const importedFacts = buildHistoricalProjectFacts(IMPORTED_SHAPED_PROJECT);
  const peers = projects(2, { country: importedFacts.location.country, currencyCode: importedFacts.financial.currencyCode });

  const withImported = buildCostIntelligence({ dataset: [importedFacts, ...peers], metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  const withLive = buildCostIntelligence({ dataset: [liveShapedEquivalent, ...peers], metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  assert.equal(withImported.groups[0].sampleSize, withLive.groups[0].sampleSize);
  assert.equal(withImported.groups[0].status, withLive.groups[0].status);
});

// ── §45: determinism ─────────────────────────────────────────────────────────
console.log('\ncostIntelligenceEngine — determinism (§45)');

ok('same HistoricalProjectFacts[] regardless of input order -> same result, deterministic group ordering', () => {
  const dataset = [
    ...projects(3, { country: 'Kazakhstan', currencyCode: 'KZT' }),
    ...projects(3, { country: 'China', currencyCode: 'CNY' }),
    ...projects(3, { country: 'Georgia', currencyCode: 'GEL' }),
  ];
  const forward = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  const reversed = buildCostIntelligence({ dataset: [...dataset].reverse(), metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  assert.deepEqual(forward.groups.map(g => g.identity), reversed.groups.map(g => g.identity));
  // stable sort: country ascending
  assert.deepEqual(forward.groups.map(g => g.identity.country), ['China', 'Georgia', 'Kazakhstan']);
});

// ── §46: immutability ────────────────────────────────────────────────────────
console.log('\ncostIntelligenceEngine — immutability (§46)');

ok('does not mutate the input dataset, project facts, metrics, or eligibility', () => {
  const dataset = projects(3);
  const snapshot = JSON.stringify(dataset);
  buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  assert.equal(JSON.stringify(dataset), snapshot);
});

ok('calling buildCostIntelligence twice with the same input never accumulates/mutates shared state', () => {
  const dataset = projects(4);
  const a = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  const b = buildCostIntelligence({ dataset, metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  assert.deepEqual(a, b);
});

// ── exact result shape / min-sample boundary ────────────────────────────────
console.log('\ncostIntelligenceEngine — result shape and minimum-sample boundary');

ok('exactly 2 projects is insufficient, exactly 3 is available (boundary)', () => {
  const two = buildCostIntelligence({ dataset: projects(2), metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  const three = buildCostIntelligence({ dataset: projects(3), metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  assert.equal(two.groups[0].status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(three.groups[0].status, 'AVAILABLE');
});

ok('result exposes metric, groupBy, policy, groups, exclusions — no UI-formatted strings', () => {
  const result = buildCostIntelligence({ dataset: projects(3), metric: 'actualCostPerTotalSqm', groupBy: 'country' });
  assert.deepEqual(Object.keys(result).sort(), ['exclusions', 'groupBy', 'groups', 'metric', 'policy'].sort());
  assert.equal(typeof result.groups[0].statistics.median, 'number');
});

console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
