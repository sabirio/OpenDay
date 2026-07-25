/**
 * benchmarkEngine — Benchmark Engine v1. Answers "which genuinely comparable
 * previous projects should this project be benchmarked against, and what
 * does that cohort tell us?" for exactly the 5 v1-supported metrics.
 *
 * Consumes HistoricalProjectFacts[] (see engines/historyEngine.js /
 * engines/portfolioHistoryEngine.js) — never recalculates a Historical
 * Foundation metric or eligibility flag, never queries Supabase, never
 * accepts raw DB project rows. "Evidence Over Opinion": cohort selection is
 * a deterministic, explainable rule set (country/projectType/concept/
 * locationType/area-tolerance tiers) — there is no similarity score, no AI,
 * no opaque weighting.
 *
 * This is a project-profile benchmark (what happened), not a forecast (what
 * will happen) — Forecast Engine is a separate, later concern.
 */
import { buildHistoricalProjectFacts } from './historyEngine.js';

// ── generic guards (small, local — mirrors historyEngine.js's own private
// helpers rather than exporting/importing across engines for a few lines) ──
function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}
function isFiniteNum(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
function identityOf(row) {
  return row?.identity?.storeCode ?? null;
}
function isSameProject(a, b) {
  if (a === b) return true;
  const idA = identityOf(a);
  const idB = identityOf(b);
  return idA != null && idB != null && idA === idB;
}

// ── centralized cohort-tier policy (§ tier criteria) — ONE owner, no
// scattered literals. Country + projectType are mandatory for every tier
// (enforced once, in isCandidateEligible, not repeated per tier). ──────────
const COHORT_TIERS = [
  { tier: 1, label: 'CLOSE_MATCH', requireStoreConcept: true, requireLocationType: true, areaTolerancePercent: 0.25 },
  { tier: 2, label: 'STRONG_MATCH', requireStoreConcept: true, requireLocationType: false, areaTolerancePercent: 0.40 },
  { tier: 3, label: 'BROAD_MATCH', requireStoreConcept: false, requireLocationType: false, areaTolerancePercent: 0.50 },
  { tier: 4, label: 'MARKET_PROJECT_TYPE', requireStoreConcept: false, requireLocationType: false, areaTolerancePercent: null },
];
const MIN_BENCHMARK_SAMPLE_SIZE = 3;
export const BENCHMARK_COHORT_POLICY = Object.freeze({ tiers: COHORT_TIERS, minSampleSize: MIN_BENCHMARK_SAMPLE_SIZE });

// ── the exactly-5 v1-supported metrics. Each entry documents its own
// currency/positive-cost/percent-from-median rules — see docs/SourceOfTruth.md
// "Benchmark Engine v1" for the rationale behind each boundary decision. ────
const SUPPORTED_METRICS = {
  actualCostPerTotalSqm: {
    eligibilityKey: 'costPerTotalSqm', unit: 'currency_per_sqm',
    requiresCurrency: true, requiresPositiveCost: true, supportsPercentFromMedian: true,
  },
  actualCostPerSalesSqm: {
    eligibilityKey: 'costPerSalesSqm', unit: 'currency_per_sqm',
    requiresCurrency: true, requiresPositiveCost: true, supportsPercentFromMedian: true,
  },
  actualConstructionDays: {
    eligibilityKey: 'actualSchedule', unit: 'days',
    requiresCurrency: false, requiresPositiveCost: false, supportsPercentFromMedian: true,
  },
  openingVarianceDays: {
    // Signed (early opening = negative) — never take absolute value, never
    // derive a percent-of-median from a value that can legitimately be 0.
    eligibilityKey: 'openingPerformance', unit: 'days',
    requiresCurrency: false, requiresPositiveCost: false, supportsPercentFromMedian: false,
  },
  costVariancePercent: {
    // Dimensionless already — no FX boundary needed (§ currency boundary:
    // absolute cost-per-area metrics require same currency, this one does not).
    eligibilityKey: 'costVariance', unit: 'percent',
    requiresCurrency: false, requiresPositiveCost: false, supportsPercentFromMedian: false,
  },
};
export const SUPPORTED_BENCHMARK_METRICS = Object.freeze(Object.keys(SUPPORTED_METRICS));

// ── target comparison availability — separate from cohort eligibility
// (above). Answers "does THIS project already have its own measured
// outcome for this metric?" — never a reason to withhold cohort evidence,
// only a reason to withhold the target-vs-median comparison itself. ───────
function isComparisonAvailable(target, metricDef, targetValue) {
  if (targetValue == null) return false;
  if (!target?.eligibility?.[metricDef.eligibilityKey]) return false;
  if (metricDef.requiresPositiveCost && !(isFiniteNum(target?.financial?.actualCost) && target.financial.actualCost > 0)) return false;
  return true;
}

// ── base compatibility (§ base compatibility rules — ALL v1 metrics) ───────
// Candidate's metric value presence is checked by the caller (it needs the
// metric key, which this function intentionally doesn't take — see
// isCandidateEligibleForMetric below).
function isCandidateEligible(target, candidate, metricDef) {
  if (isSameProject(target, candidate)) return false;
  if (!candidate?.eligibility?.[metricDef.eligibilityKey]) return false;
  if (candidate?.location?.country !== target.location.country) return false;
  if (candidate?.classification?.projectType !== target.classification.projectType) return false;
  if (metricDef.requiresCurrency && candidate?.financial?.currencyCode !== target.financial.currencyCode) return false;
  if (metricDef.requiresPositiveCost && !(isFiniteNum(candidate?.financial?.actualCost) && candidate.financial.actualCost > 0)) return false;
  return true;
}

// ── tier-specific criteria (§ deterministic cohort tiers) ──────────────────
function matchesTier(target, candidate, tier) {
  if (tier.requireStoreConcept) {
    if (!hasText(target.classification.storeConcept)) return false; // unknown target value never matches anything
    if (candidate.classification.storeConcept !== target.classification.storeConcept) return false;
  }
  if (tier.requireLocationType) {
    if (!hasText(target.location.locationType)) return false;
    if (candidate.location.locationType !== target.location.locationType) return false;
  }
  if (tier.areaTolerancePercent != null) {
    const targetArea = target.areas.totalArea;
    if (!(isFiniteNum(targetArea) && targetArea > 0)) return false; // no divide-by-zero / no guessing
    const candidateArea = candidate.areas.totalArea;
    if (!isFiniteNum(candidateArea)) return false;
    const lower = targetArea * (1 - tier.areaTolerancePercent);
    const upper = targetArea * (1 + tier.areaTolerancePercent);
    if (candidateArea < lower || candidateArea > upper) return false;
  }
  return true;
}

function buildCriteria(target, tier, metricDef) {
  const criteria = {
    country: target.location.country,
    projectType: target.classification.projectType,
  };
  if (tier.requireStoreConcept) criteria.storeConcept = target.classification.storeConcept;
  if (tier.requireLocationType) criteria.locationType = target.location.locationType;
  if (tier.areaTolerancePercent != null) {
    const targetArea = target.areas.totalArea;
    criteria.totalAreaTolerancePercent = tier.areaTolerancePercent * 100;
    criteria.totalAreaRange = (isFiniteNum(targetArea) && targetArea > 0)
      ? { min: targetArea * (1 - tier.areaTolerancePercent), max: targetArea * (1 + tier.areaTolerancePercent) }
      : null;
  }
  if (metricDef.requiresCurrency) criteria.currencyCode = target.financial.currencyCode;
  if (metricDef.requiresPositiveCost) criteria.excludesNonPositiveActualCost = true;
  return criteria;
}

// ── statistics (§ statistics) — one deterministic percentile algorithm:
// linear interpolation between ranks (a.k.a. "PERCENTILE.INC"), documented
// here since no existing repo helper computes percentiles this way
// (monteCarloEngine.js uses a nearest-rank lookup suited to its own N=10000
// simulation array, not this small-N cohort case). No outlier trimming. ────
function percentileOf(sortedValues, p) {
  const n = sortedValues.length;
  if (n === 1) return sortedValues[0];
  const index = (p / 100) * (n - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight;
}
function computeStatistics(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    sampleSize: n,
    min: sorted[0],
    max: sorted[n - 1],
    mean: sum / n,
    median: percentileOf(sorted, 50),
    p25: percentileOf(sorted, 25),
    p75: percentileOf(sorted, 75),
  };
}

/**
 * buildProjectBenchmark — single-metric cohort benchmark for one target
 * project against an authorized dataset. Pure function: target/dataset are
 * HistoricalProjectFacts (already built by Historical Foundation), never raw
 * project rows, never queried here.
 *
 * @param {{ target: object, dataset: object[], metric: string }} args
 * @returns {{ metric: string, status: 'AVAILABLE'|'INSUFFICIENT_EVIDENCE'|'TARGET_NOT_ELIGIBLE',
 *   target: object, cohort: object, statistics: object|null, comparison: object|null, reason?: string }}
 */
export function buildProjectBenchmark({ target, dataset, metric }) {
  const metricDef = SUPPORTED_METRICS[metric];
  if (!metricDef) {
    throw new Error(`buildProjectBenchmark: unsupported metric "${metric}". Supported: ${SUPPORTED_BENCHMARK_METRICS.join(', ')}`);
  }

  const targetIdentity = { storeCode: identityOf(target) };
  const targetValue = target?.metrics?.[metric] ?? null;
  const targetCurrency = metricDef.requiresCurrency ? (target?.financial?.currencyCode ?? null) : null;

  // comparisonAvailable is a target-outcome question ("has this project
  // finished/measured this metric yet?"), fully independent of whether a
  // comparable historical cohort can be selected. A brand-new/in-progress
  // project must still be able to receive cohort statistics — see
  // docs/SourceOfTruth.md "Benchmark Engine v1 — target cohort eligibility
  // vs. target comparison availability".
  const comparisonAvailable = isComparisonAvailable(target, metricDef, targetValue);

  // ── TARGET_NOT_ELIGIBLE gate — can a comparable cohort even be DEFINED
  // for this target? Only cohort-defining context matters here (country,
  // projectType, and — for absolute cost-per-area metrics only — currency).
  // The target's OWN outcome (eligibility flag / metric value / positive
  // cost) must never block cohort selection; that only gates
  // comparisonAvailable above. No cohort search is attempted below when
  // this gate fails. ─────────────────────────────────────────────────────
  const cohortContextReasons = [];
  if (!hasText(target?.location?.country)) cohortContextReasons.push('target country is unknown');
  if (!hasText(target?.classification?.projectType)) cohortContextReasons.push('target projectType is unknown');
  if (metricDef.requiresCurrency && !hasText(target?.financial?.currencyCode)) cohortContextReasons.push('target currency is unknown');

  if (cohortContextReasons.length > 0) {
    return {
      metric,
      status: 'TARGET_NOT_ELIGIBLE',
      target: { projectIdentity: targetIdentity, value: targetValue, unit: metricDef.unit, currencyCode: targetCurrency, comparisonAvailable },
      cohort: {
        tier: null, tierLabel: null, criteria: null, sampleSize: 0, projectIdentities: [],
        bestAvailableTier: null, bestAvailableTierLabel: null, bestAvailableSampleSize: null, bestAvailableProjectIdentities: [],
        tiersEvaluated: [],
      },
      statistics: null,
      comparison: null,
      reason: cohortContextReasons.join('; '),
    };
  }

  const pool = Array.isArray(dataset) ? dataset : [];
  const baseCompatible = pool.filter(candidate => isCandidateEligibleForMetric(target, candidate, metric, metricDef));

  const tiersEvaluated = COHORT_TIERS.map(tier => {
    const matches = baseCompatible.filter(candidate => matchesTier(target, candidate, tier));
    return {
      tier: tier.tier,
      tierLabel: tier.label,
      criteria: buildCriteria(target, tier, metricDef),
      sampleSize: matches.length,
      matches,
    };
  });

  const winning = tiersEvaluated.find(t => t.sampleSize >= MIN_BENCHMARK_SAMPLE_SIZE);

  if (!winning) {
    const best = tiersEvaluated.reduce((a, b) => (b.sampleSize > a.sampleSize ? b : a), tiersEvaluated[0]);
    return {
      metric,
      status: 'INSUFFICIENT_EVIDENCE',
      target: { projectIdentity: targetIdentity, value: targetValue, unit: metricDef.unit, currencyCode: targetCurrency, comparisonAvailable },
      cohort: {
        // No winning cohort was found — tier/criteria/sampleSize describe
        // nothing here (never fabricate a benchmark from an under-sized
        // sample). bestAvailable* exposes what was closest, for transparency.
        tier: null, tierLabel: null, criteria: null, sampleSize: 0, projectIdentities: [],
        bestAvailableTier: best.sampleSize > 0 ? best.tier : null,
        bestAvailableTierLabel: best.sampleSize > 0 ? best.tierLabel : null,
        bestAvailableSampleSize: best.sampleSize,
        bestAvailableProjectIdentities: best.matches.map(m => ({ storeCode: identityOf(m) })),
        tiersEvaluated: tiersEvaluated.map(({ matches: _matches, ...rest }) => rest),
      },
      statistics: null,
      comparison: null,
      reason: `No cohort tier reached the minimum sample size of ${MIN_BENCHMARK_SAMPLE_SIZE}; best available is ${best.tierLabel} with ${best.sampleSize} project(s).`,
    };
  }

  const values = winning.matches.map(m => m.metrics[metric]);
  const statistics = computeStatistics(values);

  // Cohort statistics are computed unconditionally (evidence about the
  // historical cohort never depends on whether the target itself has
  // finished) — only the target-vs-median comparison is gated.
  let comparison = null;
  if (comparisonAvailable) {
    const deltaFromMedian = targetValue - statistics.median;
    const percentFromMedian = (metricDef.supportsPercentFromMedian && statistics.median !== 0)
      ? (deltaFromMedian / statistics.median) * 100
      : null;
    comparison = { deltaFromMedian, percentFromMedian };
  }

  return {
    metric,
    status: 'AVAILABLE',
    target: { projectIdentity: targetIdentity, value: targetValue, unit: metricDef.unit, currencyCode: targetCurrency, comparisonAvailable },
    cohort: {
      tier: winning.tier,
      tierLabel: winning.tierLabel,
      criteria: winning.criteria,
      sampleSize: winning.sampleSize,
      projectIdentities: winning.matches.map(m => ({ storeCode: identityOf(m) })),
      bestAvailableTier: winning.tier, bestAvailableTierLabel: winning.tierLabel, bestAvailableSampleSize: winning.sampleSize,
      bestAvailableProjectIdentities: winning.matches.map(m => ({ storeCode: identityOf(m) })),
      tiersEvaluated: tiersEvaluated.map(({ matches: _matches, ...rest }) => rest),
    },
    statistics,
    comparison,
  };
}

// isCandidateEligible above needs the metric key (not just its definition
// object) to read candidate.metrics[metric] — small wrapper keeps the public
// per-metric-definition function free of that extra parameter.
function isCandidateEligibleForMetric(target, candidate, metric, metricDef) {
  if (!isFiniteNum(candidate?.metrics?.[metric])) return false;
  return isCandidateEligible(target, candidate, metricDef);
}

/**
 * buildProjectBenchmarks — all 5 supported metrics at once for one target
 * project. No UI, no persistence — pure aggregation of buildProjectBenchmark().
 *
 * @param {object} target - HistoricalProjectFacts for the project being benchmarked
 * @param {object[]} dataset - HistoricalProjectFacts[] (the authorized cohort pool)
 * @returns {Record<string, ReturnType<typeof buildProjectBenchmark>>}
 */
export function buildProjectBenchmarks(target, dataset) {
  const result = {};
  for (const metric of SUPPORTED_BENCHMARK_METRICS) {
    result[metric] = buildProjectBenchmark({ target, dataset, metric });
  }
  return result;
}

// Re-exported for tests/consumers that want to build facts once and reuse
// them for both Historical Foundation reporting and Benchmark Engine calls,
// without a second import path. Not a new builder — same function.
export { buildHistoricalProjectFacts };
