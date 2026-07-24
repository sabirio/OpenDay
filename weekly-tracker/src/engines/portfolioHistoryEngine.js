/**
 * portfolioHistoryEngine — pure aggregation over many canonical projects'
 * Historical Project Facts (mirrors portfolioRiskEngine.js's split from
 * riskEngine.js: per-project facts stay in historyEngine.js, cross-project
 * aggregation lives here). Historical Data Foundation v1 only — this is
 * DATA COVERAGE, not Benchmark Engine: no averages, medians, percentiles,
 * rankings, or outlier detection. Those belong to a later engine that
 * consumes this same dataset.
 *
 * No Supabase — callers pass in whatever canonical projects they are
 * already authorized to see (existing company/RLS/project-access
 * semantics); this module never queries anything itself.
 */
import { buildHistoricalProjectFacts } from './historyEngine.js';

/** projects[] -> HistoricalProjectFacts[], same order as input. */
export function buildHistoricalProjectDataset(projects) {
  return (projects || []).map(buildHistoricalProjectFacts);
}

const COVERAGE_DIMENSIONS = [
  ['plannedScheduleEligible', 'plannedSchedule'],
  ['actualScheduleEligible', 'actualSchedule'],
  ['openingPerformanceEligible', 'openingPerformance'],
  ['costPerTotalSqmEligible', 'costPerTotalSqm'],
  ['costPerSalesSqmEligible', 'costPerSalesSqm'],
  ['costVarianceEligible', 'costVariance'],
  ['contractorAttributionEligible', 'contractorAttribution'],
];

/**
 * How much useful historical evidence does the given dataset actually
 * contain? Counts only — never an average/median/benchmark value.
 * @param {ReturnType<typeof buildHistoricalProjectDataset>} dataset
 */
export function buildHistoricalDataCoverage(dataset) {
  const rows = dataset || [];

  const coverage = { totalProjects: rows.length };
  for (const [outputKey, eligibilityKey] of COVERAGE_DIMENSIONS) {
    coverage[outputKey] = rows.filter(row => row.eligibility[eligibilityKey]).length;
  }
  coverage.projectsWithQualityIssues = rows.filter(row => row.qualityIssues.length > 0).length;

  // Currency counts only (§28) — never a cross-currency value, no FX.
  const eligibleCostProjectsByCurrency = {};
  for (const row of rows) {
    const isCostEligible = row.eligibility.costPerTotalSqm || row.eligibility.costPerSalesSqm || row.eligibility.costVariance;
    const currencyCode = row.financial.currencyCode;
    if (isCostEligible && currencyCode) {
      eligibleCostProjectsByCurrency[currencyCode] = (eligibleCostProjectsByCurrency[currencyCode] || 0) + 1;
    }
  }
  coverage.eligibleCostProjectsByCurrency = eligibleCostProjectsByCurrency;

  return coverage;
}
