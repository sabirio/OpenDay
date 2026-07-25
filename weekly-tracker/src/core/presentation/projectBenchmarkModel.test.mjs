// projectBenchmarkModel.test.mjs — Project Benchmark Product/UI Layer v1
// certification for the presentation facade (core/presentation/
// projectBenchmarkModel.js). Proves the UI-facing card view models are
// correctly derived from the frozen Historical Data Foundation / Benchmark
// Engine v1 — never a recalculation, only formatting/labeling.
// Run: node src/core/presentation/projectBenchmarkModel.test.mjs
import assert from 'node:assert/strict';
import { buildProjectBenchmarkCards } from './projectBenchmarkModel.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  OK ${name}`); };

// A "perfect Tier-1 shape" peer factory mirroring engines/benchmarkEngine.test.mjs's
// own convention, so the same deterministic scenarios are exercised at the UI layer.
let seq = 0;
function peer(overrides = {}) {
  seq += 1;
  return {
    storeCode: `KZ-UI-PEER-${seq}`, country: 'Kazakhstan', city: 'Almaty',
    locationType: 'Mall', projectType: 'Rebuilding', storeConcept: 'Flagship',
    storeSizeSqm: 1000, salesAreaSqm: 700, backOfHouseAreaSqm: 300,
    constructionStartDate: '2025-01-01', constructionEndDate: '2025-04-01', targetOpeningDate: '2025-04-10',
    actualConstructionStartDate: '2025-01-02', actualConstructionCompletionDate: '2025-03-28', actualOpeningDate: '2025-04-09',
    budget: 400000, actualCost: 410000, currencyCode: 'KZT',
    ...overrides,
  };
}
function peers(count, overrides = {}) {
  return Array.from({ length: count }, () => peer(overrides));
}

const inProgressTarget = {
  storeCode: 'KZ-UI-INPROGRESS-1', country: 'Kazakhstan', projectType: 'Rebuilding', storeConcept: 'Flagship', locationType: 'Mall',
  storeSizeSqm: 1000, currencyCode: 'KZT',
};
const completedTarget = { ...inProgressTarget, actualCost: 530000000, budget: 500000000, salesAreaSqm: 700 };

function cardsFor(target, dataset) {
  return buildProjectBenchmarkCards(target, [target, ...dataset]);
}
function cardByMetric(cards, metric) {
  return cards.find(c => c.metric === metric);
}

// ── §8: exactly the 5 frozen metrics, in order ──────────────────────────────
console.log('\nprojectBenchmarkModel — five frozen v1 cards, no more (§8)');

ok('returns exactly 5 cards titled Cost / Total m², Cost / Sales m², Construction Duration, Opening Variance, Cost Variance', () => {
  const cards = cardsFor(inProgressTarget, peers(4));
  assert.equal(cards.length, 5);
  assert.deepEqual(cards.map(c => c.title), [
    'Cost / Total m²', 'Cost / Sales m²', 'Construction Duration', 'Opening Variance', 'Cost Variance',
  ]);
});

// ── §13/§14: AVAILABLE without a target actual — the central product rule ──
console.log('\nprojectBenchmarkModel — AVAILABLE without target actual (in-progress project, §13/§14/§40)');

ok('all 5 cards are AVAILABLE with full statistics for an in-progress target, each showing "not available yet" instead of Your Project', () => {
  const cards = cardsFor(inProgressTarget, peers(4));
  for (const card of cards) {
    assert.equal(card.status, 'AVAILABLE', `${card.title} should be AVAILABLE`);
    assert.equal(card.comparisonAvailable, false);
    assert.equal(card.yourValue, null);
    assert.equal(card.comparisonText, null);
    assert.ok(card.notAvailableYetText.length > 0);
    assert.ok(card.median);
    assert.ok(card.typicalRange);
  }
});

ok('does not show "No benchmark" and does not display target as zero (§13)', () => {
  const cards = cardsFor(inProgressTarget, peers(4));
  const cost = cardByMetric(cards, 'actualCostPerTotalSqm');
  assert.notEqual(cost.notAvailableYetText, 'No benchmark');
  assert.notEqual(cost.yourValue, '0 KZT/m²');
});

// ── §41: completed-target proof — same cohort, comparison now present ──────
console.log('\nprojectBenchmarkModel — completed target: same cohort/statistics, comparison now present (§41)');

ok('identical cohort/statistics whether target has an actual outcome or not; comparison appears only once known', () => {
  const dataset = peers(4);
  const before = cardByMetric(cardsFor(inProgressTarget, dataset), 'actualCostPerTotalSqm');
  const after = cardByMetric(cardsFor(completedTarget, dataset), 'actualCostPerTotalSqm');
  assert.equal(before.sampleSize, after.sampleSize);
  assert.equal(before.median, after.median);
  assert.equal(before.typicalRange, after.typicalRange);
  assert.equal(before.comparisonAvailable, false);
  assert.equal(after.comparisonAvailable, true);
  assert.ok(after.yourValue);
  assert.ok(after.comparisonText);
});

// ── §12/§28: comparison text uses engine values verbatim, no recalculation ──
console.log('\nprojectBenchmarkModel — comparison text (§12, §28)');

ok('vs-median text includes both delta and percent when the engine provides percentFromMedian', () => {
  const dataset = [480000, 500000, 520000, 550000].map(actualCost => peer({ actualCost, storeSizeSqm: 1000 }));
  const target = { ...inProgressTarget, actualCost: 530000000 }; // -> actualCostPerTotalSqm = 530000, median = 510000... wait storeSizeSqm 1000 -> per-sqm values 480/500/520/550
  const card = cardByMetric(cardsFor(target, dataset), 'actualCostPerTotalSqm');
  assert.equal(card.median, '510 KZT/m²');
  assert.equal(card.yourValue, '530,000 KZT/m²'); // target actualCost 530,000,000 / area 1000 = 530,000 KZT/m²
  assert.match(card.comparisonText, /^\+529,490 KZT\/m² \(\+103,821\.6%\)$/); // delta = 530000 - 510 = 529490, percent = (529490/510)*100
});

ok('openingVarianceDays never shows a percent in its comparison text (engine never provides percentFromMedian for it)', () => {
  const dataset = peers(3, { targetOpeningDate: '2025-04-10', actualOpeningDate: '2025-04-08' }); // -2 days each
  const target = { ...completedTarget, targetOpeningDate: '2025-04-10', actualOpeningDate: '2025-04-05' }; // -5 days
  const card = cardByMetric(cardsFor(target, dataset), 'openingVarianceDays');
  assert.equal(card.comparisonAvailable, true);
  assert.doesNotMatch(card.comparisonText, /%/);
});

// ── §23/§27/§46: signed values, never absolute, never a "+-" artifact ──────
console.log('\nprojectBenchmarkModel — Opening Variance sign semantics (§23, §27, §46)');

ok('negative median (early openings) is preserved verbatim, not converted to absolute value', () => {
  const dataset = peers(3, { targetOpeningDate: '2025-04-10', actualOpeningDate: '2025-04-08' }); // -2 days each
  const card = cardByMetric(cardsFor(inProgressTarget, dataset), 'openingVarianceDays');
  assert.equal(card.median, '-2 days');
  assert.ok(!card.median.includes('+-') && !card.median.includes('-+'));
});

ok('positive comparison delta is prefixed with a literal "+", zero never renders "+0" or "-0"', () => {
  const dataset = peers(3, { targetOpeningDate: '2025-04-10', actualOpeningDate: '2025-04-10' }); // 0 variance each
  const target = { ...completedTarget, targetOpeningDate: '2025-04-10', actualOpeningDate: '2025-04-13' }; // +3
  const card = cardByMetric(cardsFor(target, dataset), 'openingVarianceDays');
  assert.equal(card.median, '0 days');
  assert.equal(card.yourValue, '+3 days');
  assert.match(card.comparisonText, /^\+3 days$/);
});

ok('Opening Variance card carries the "earlier/later" hint, other cards do not', () => {
  const cards = cardsFor(inProgressTarget, peers(4));
  assert.equal(cardByMetric(cards, 'openingVarianceDays').hint, '− earlier · + later');
  assert.equal(cardByMetric(cards, 'actualCostPerTotalSqm').hint, null);
});

// ── §15/§43: INSUFFICIENT_EVIDENCE — no fabricated statistics ───────────────
console.log('\nprojectBenchmarkModel — INSUFFICIENT_EVIDENCE (§15, §43)');

ok('2 comparable projects (below the minimum of 3) shows the insufficient-evidence card, no median', () => {
  const card = cardByMetric(cardsFor(inProgressTarget, peers(2)), 'actualCostPerTotalSqm');
  assert.equal(card.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(card.bestAvailableSampleSize, 2);
  assert.equal(card.minimumSampleSize, 3);
  assert.equal(card.median, undefined);
});

// ── §16/§44: TARGET_NOT_ELIGIBLE — human-facing reason, no engine dump ─────
console.log('\nprojectBenchmarkModel — TARGET_NOT_ELIGIBLE (§16, §44)');

ok('missing projectType shows the friendly "Project Type is required" message, not a raw engine string', () => {
  const target = { ...inProgressTarget, projectType: undefined };
  const card = cardByMetric(cardsFor(target, peers(4)), 'actualCostPerTotalSqm');
  assert.equal(card.status, 'TARGET_NOT_ELIGIBLE');
  assert.equal(card.reasonText, 'Project Type is required to identify comparable projects.');
  assert.doesNotMatch(card.reasonText, /at |\bnull\b|undefined|Error/);
});

ok('missing country AND projectType together lists both', () => {
  const target = { ...inProgressTarget, country: undefined, projectType: undefined };
  const card = cardByMetric(cardsFor(target, peers(4)), 'actualCostPerTotalSqm');
  assert.equal(card.reasonText, 'Country and Project Type are required to identify comparable projects.');
});

ok('absolute-cost metric with missing target currency shows the currency-specific message', () => {
  const target = { ...inProgressTarget, currencyCode: undefined };
  const card = cardByMetric(cardsFor(target, peers(4)), 'actualCostPerTotalSqm');
  assert.equal(card.status, 'TARGET_NOT_ELIGIBLE');
  assert.equal(card.reasonText, 'Currency is required to compare historical costs.');
});

ok('costVariancePercent does not require target currency (dimensionless, no FX boundary)', () => {
  const target = { ...inProgressTarget, currencyCode: undefined };
  const card = cardByMetric(cardsFor(target, peers(4)), 'costVariancePercent');
  assert.equal(card.status, 'AVAILABLE');
});

// ── §17/§18/§19: explainability — criteria only, no similarity score ───────
console.log('\nprojectBenchmarkModel — Comparison basis / explainability (§17, §19)');

ok('criteria list contains only the fields the winning tier actually applied, in human labels', () => {
  const card = cardByMetric(cardsFor(inProgressTarget, peers(4)), 'actualCostPerTotalSqm');
  assert.equal(card.tierLabel, 'Close match');
  const labels = card.criteria.map(c => c.label);
  assert.deepEqual(labels, ['Country', 'Project type', 'Store concept', 'Location type', 'Area', 'Currency']);
  assert.deepEqual(card.criteria.find(c => c.label === 'Country'), { label: 'Country', value: 'Kazakhstan' });
});

ok('a metric with no currency requirement never shows a Currency criterion row', () => {
  const card = cardByMetric(cardsFor(inProgressTarget, peers(4)), 'actualConstructionDays');
  assert.ok(!card.criteria.some(c => c.label === 'Currency'));
});

ok('no similarity score / match percentage ever appears in a card (§19)', () => {
  const cards = cardsFor(inProgressTarget, peers(4));
  const dumped = JSON.stringify(cards).toLowerCase();
  assert.doesNotMatch(dumped, /similarity|match score/);
});

ok('technical tier identifiers (Tier 1, CLOSE_MATCH) are not shown as the primary label — human label is used', () => {
  const card = cardByMetric(cardsFor(inProgressTarget, peers(4)), 'actualCostPerTotalSqm');
  assert.equal(card.tierLabel, 'Close match');
  assert.notEqual(card.tierLabel, 'CLOSE_MATCH');
  assert.notEqual(card.tierLabel, 'Tier 1');
});

// ── §42: per-metric cohorts differ, no universal cohort ────────────────────
console.log('\nprojectBenchmarkModel — different metrics may show different sample sizes (§42)');

ok('cost cards and schedule cards can have different sample sizes from the same dataset', () => {
  const dataset = [...peers(5), ...peers(3, { actualCost: undefined, budget: undefined })];
  const cards = cardsFor(inProgressTarget, dataset);
  const cost = cardByMetric(cards, 'actualCostPerTotalSqm');
  const schedule = cardByMetric(cards, 'actualConstructionDays');
  assert.equal(cost.sampleSize, 5);
  assert.equal(schedule.sampleSize, 8);
});

// ── §45: multi-currency — never a mixed-currency median ────────────────────
console.log('\nprojectBenchmarkModel — multi-currency (§45)');

ok('cost benchmark only ever reflects the target\'s own currency cohort, even when other currencies are present', () => {
  const dataset = [...peers(4), ...peers(4, { currencyCode: 'USD' })];
  const card = cardByMetric(cardsFor(inProgressTarget, dataset), 'actualCostPerTotalSqm');
  assert.equal(card.sampleSize, 4); // KZT peers only
  assert.match(card.median, /KZT\/m²$/);
});

ok('costVariancePercent may combine both currencies per the engine\'s own broader policy (unmodified)', () => {
  const dataset = [...peers(4), ...peers(4, { currencyCode: 'USD' })];
  const card = cardByMetric(cardsFor(inProgressTarget, dataset), 'costVariancePercent');
  assert.equal(card.sampleSize, 8);
});

// ── §30: target self-exclusion reflected in displayed sample size ─────────
console.log('\nprojectBenchmarkModel — current project never appears in its own cohort (§30)');

ok('a target present in the caller\'s projects[] does not inflate its own displayed sample size', () => {
  // completedTarget shares inProgressTarget's storeCode; simulate the target
  // itself sitting inside the authorized projects[] collection twice.
  const cards = buildProjectBenchmarkCards(inProgressTarget, [inProgressTarget, completedTarget, ...peers(4)]);
  const card = cardByMetric(cards, 'actualCostPerTotalSqm');
  assert.equal(card.sampleSize, 4);
});

console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
