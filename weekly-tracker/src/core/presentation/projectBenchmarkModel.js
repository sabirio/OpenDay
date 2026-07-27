/**
 * projectBenchmarkModel — the ONE facade between Project Benchmark UI and the
 * frozen Historical Data Foundation / Benchmark Engine v1. Composes those
 * engines into ready-to-render card view models; never recomputes a cohort,
 * a statistic, or a comparison delta itself — only formats numbers the
 * engines already produced. Mirrors the existing
 * core/presentation/projectInfoPresentationModel.js convention (UI reaches
 * engines/ only through a core/presentation/*Model.js facade).
 *
 * No Supabase, no React — `projects` is whatever authorized canonical
 * project collection the caller already has (App.jsx's projectService
 * fetch); this module never queries anything itself.
 */
import { buildHistoricalProjectFacts } from '../../engines/historyEngine.js';
import { buildHistoricalProjectDataset } from '../../engines/portfolioHistoryEngine.js';
import { buildProjectBenchmarks, BENCHMARK_COHORT_POLICY } from '../../engines/benchmarkEngine.js';

// ── product-facing metric configuration (§8/§20-24) — the exact 5 frozen
// v1 metrics, no more. Order here is the card render order. ────────────────
const METRIC_CARDS = [
  { metric: 'actualCostPerTotalSqm', title: 'Cost / Total m²', kind: 'currency_per_sqm', notAvailableYetText: 'Actual cost not available yet' },
  { metric: 'actualCostPerSalesSqm', title: 'Cost / Sales m²', kind: 'currency_per_sqm', notAvailableYetText: 'Actual cost not available yet' },
  { metric: 'actualConstructionDays', title: 'Construction Duration', kind: 'days', notAvailableYetText: 'Actual duration not available yet' },
  { metric: 'openingVarianceDays', title: 'Opening Variance', kind: 'days_signed', notAvailableYetText: 'Actual opening date not available yet', hint: '− earlier · + later' },
  { metric: 'costVariancePercent', title: 'Cost Variance', kind: 'percent_signed', notAvailableYetText: 'Actual cost not available yet' },
];

const TIER_LABELS = {
  CLOSE_MATCH: 'Close match',
  STRONG_MATCH: 'Strong match',
  BROAD_MATCH: 'Broad match',
  MARKET_PROJECT_TYPE: 'Market & project type',
};

const CRITERIA_LABELS = {
  country: 'Country',
  projectType: 'Project type',
  storeConcept: 'Store concept',
  locationType: 'Location type',
  currencyCode: 'Currency',
};

// ── presentation-only formatting (no recalculation — every number here was
// already computed by Benchmark Engine; toLocaleString only rounds for
// display, it never changes the underlying value used for comparison). ────
function formatCurrencyPerSqm(value, currencyCode) {
  if (value == null) return null;
  const formatted = value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return currencyCode ? `${formatted} ${currencyCode}/m²` : formatted;
}
function formatDays(value) {
  if (value == null) return null;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} days`;
}
// Sign carries meaning (early/late, over/under) — never converted to
// absolute value. Zero never renders a "+"/"-" artifact.
function signPrefix(value) {
  if (value > 0) return '+';
  return ''; // negative numbers already render their own "-"; zero gets no sign
}
function formatSignedDays(value) {
  if (value == null) return null;
  const normalized = value === 0 ? 0 : value; // avoid a "-0 days" artifact
  return `${signPrefix(normalized)}${normalized.toLocaleString('en-US', { maximumFractionDigits: 0 })} days`;
}
function formatSignedPercent(value) {
  if (value == null) return null;
  const normalized = value === 0 ? 0 : value;
  return `${signPrefix(normalized)}${normalized.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function valueFormatter(kind) {
  switch (kind) {
    case 'currency_per_sqm': return formatCurrencyPerSqm;
    case 'days': return formatDays;
    case 'days_signed': return formatSignedDays;
    case 'percent_signed': return formatSignedPercent;
    default: return () => null;
  }
}

function formatRange(min, max, kind, currencyCode) {
  if (min == null || max == null) return null;
  const fmt = valueFormatter(kind);
  const minText = fmt(min, currencyCode);
  const maxText = fmt(max, currencyCode);
  // Strip the repeated unit off the lower bound ("480,000 – 550,000 KZT/m²"
  // instead of "480,000 KZT/m² – 550,000 KZT/m²").
  const minNumberOnly = minText.replace(/\s.*$/, '');
  return `${minNumberOnly} – ${maxText}`;
}

// Only the criteria the chosen cohort tier actually applied are shown
// (§17) — never a nonexistent criterion, never a similarity score (§19).
function buildCriteriaList(criteria) {
  if (!criteria) return [];
  const items = [];
  for (const key of ['country', 'projectType', 'storeConcept', 'locationType']) {
    if (criteria[key]) items.push({ label: CRITERIA_LABELS[key], value: criteria[key] });
  }
  if (criteria.totalAreaTolerancePercent != null) {
    items.push({ label: 'Area', value: `±${criteria.totalAreaTolerancePercent}%` });
  }
  if (criteria.currencyCode) {
    items.push({ label: CRITERIA_LABELS.currencyCode, value: criteria.currencyCode });
  }
  return items;
}

// Human-facing TARGET_NOT_ELIGIBLE messaging (§16) — derived from which
// cohort-context facts are missing, not a raw dump of the engine's internal
// `reason` string (no stack traces / object dumps ever reach the UI).
function humanizeNotEligible(reason) {
  const missingCountry = /country/i.test(reason || '');
  const missingProjectType = /projectType/i.test(reason || '');
  const missingCurrency = /currency/i.test(reason || '');

  const missing = [];
  if (missingCountry) missing.push('Country');
  if (missingProjectType) missing.push('Project Type');

  if (missing.length > 0) {
    return `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required to identify comparable projects.`;
  }
  if (missingCurrency) {
    return 'Currency is required to compare historical costs.';
  }
  return 'Project context is insufficient to identify comparable projects.';
}

function buildCard(config, result) {
  const base = { metric: config.metric, title: config.title, status: result.status, hint: config.hint ?? null };

  if (result.status === 'TARGET_NOT_ELIGIBLE') {
    return { ...base, reasonText: humanizeNotEligible(result.reason) };
  }

  if (result.status === 'INSUFFICIENT_EVIDENCE') {
    return {
      ...base,
      bestAvailableSampleSize: result.cohort.bestAvailableSampleSize ?? 0,
      minimumSampleSize: BENCHMARK_COHORT_POLICY.minSampleSize,
    };
  }

  // AVAILABLE — statistics are always present here regardless of whether
  // the target itself has an actual outcome yet (frozen Benchmark Engine
  // rule: a project does not need to be finished to receive a benchmark).
  const fmt = valueFormatter(config.kind);
  const currencyCode = result.target.currencyCode;
  const { statistics, cohort, target, comparison } = result;

  return {
    ...base,
    median: fmt(statistics.median, currencyCode),
    typicalRange: formatRange(statistics.p25, statistics.p75, config.kind, currencyCode),
    mean: fmt(statistics.mean, currencyCode),
    fullRange: formatRange(statistics.min, statistics.max, config.kind, currencyCode),
    sampleSize: cohort.sampleSize,
    tierLabel: TIER_LABELS[cohort.tierLabel] ?? cohort.tierLabel,
    criteria: buildCriteriaList(cohort.criteria),
    comparisonAvailable: target.comparisonAvailable,
    yourValue: target.comparisonAvailable ? fmt(target.value, currencyCode) : null,
    comparisonText: (target.comparisonAvailable && comparison)
      ? formatComparison(comparison, config.kind, currencyCode)
      : null,
    notAvailableYetText: config.notAvailableYetText,
  };
}

// A signed comparison always needs its own formatter, even for metrics
// whose plain value display is unsigned (e.g. "96 days" vs "-4 days late").
function formatComparison(comparison, kind, currencyCode) {
  const deltaText = kind === 'currency_per_sqm'
    ? formatSignedCurrencyPerSqm(comparison.deltaFromMedian, currencyCode)
    : kind === 'percent_signed'
      ? formatSignedPercent(comparison.deltaFromMedian)
      : formatSignedDays(comparison.deltaFromMedian);
  if (comparison.percentFromMedian == null) return deltaText;
  return `${deltaText} (${formatSignedPercent(comparison.percentFromMedian)})`;
}
// Plain-arithmetic absolute value (no calculation-shaped helper needed —
// this is presentation formatting, not a new formula).
function magnitudeOf(value) {
  return value < 0 ? -value : value;
}
function formatSignedCurrencyPerSqm(value, currencyCode) {
  if (value == null) return null;
  const normalized = value === 0 ? 0 : value;
  const magnitude = magnitudeOf(normalized).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${signPrefix(normalized)}${magnitude}${currencyCode ? ` ${currencyCode}/m²` : ''}`;
}

/**
 * buildProjectBenchmarkCards — the one entry point Project Benchmark UI
 * calls. `project` is the canonical target project (projectService.fromDB
 * shape); `projects` is the caller's already-authorized project collection
 * (no independent query — RLS/company scoping happened before this was
 * called). Returns exactly 5 card view models, one per frozen v1 metric,
 * each independently AVAILABLE / INSUFFICIENT_EVIDENCE / TARGET_NOT_ELIGIBLE
 * (per-metric eligibility — never one universal cohort for the page).
 *
 * @param {object} project
 * @param {object[]} projects
 * @returns {object[]} card view models, same order as METRIC_CARDS
 */
export function buildProjectBenchmarkCards(project, projects) {
  const target = buildHistoricalProjectFacts(project);
  const dataset = buildHistoricalProjectDataset(projects);
  const results = buildProjectBenchmarks(target, dataset);
  return METRIC_CARDS.map(config => buildCard(config, results[config.metric]));
}
