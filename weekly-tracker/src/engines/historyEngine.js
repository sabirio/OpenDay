/**
 * historyEngine — Historical Data Foundation v1. Pure projection over ONE
 * canonical project (the shape `projectService.fromDB()` produces — the
 * same object used by live Portfolio/Project Information and by Import) into
 * a deterministic, immutable "Historical Project Facts" record.
 *
 * There is no separate historical-project model: a live OpenDay project and
 * an imported historical project are the exact same canonical shape, so
 * this is the ONE builder for both — see docs/SourceOfTruth.md "Historical
 * Data Foundation v1" for the full design rationale (per-dimension
 * eligibility instead of a global `is_historical` flag, no persisted
 * derived metrics, unknown ≠ zero, forecast fields excluded).
 *
 * No Supabase, no React, no DB writes — this module only ever computes from
 * the project object it is given.
 */
import { diffDays } from './dateMath.js';

// ── generic guards ──────────────────────────────────────────────────────
function hasText(value) {
  return typeof value === 'string' ? value.trim() !== '' : value != null;
}
function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}
function num(value) {
  return Number(value);
}
function isValidDateString(value) {
  return typeof value === 'string' && value !== '' && Number.isFinite(new Date(value).getTime());
}
/** end - start, in whole calendar days, or null if either date is invalid/unparseable. */
function safeDiffDays(startIso, endIso) {
  if (!isValidDateString(startIso) || !isValidDateString(endIso)) return null;
  const result = diffDays(startIso, endIso);
  return Number.isFinite(result) ? result : null;
}
/** Whole-days difference, gated on the chronology being non-negative (a genuine duration/period can't be negative) — null otherwise. */
function safeDurationDays(startIso, endIso) {
  const value = safeDiffDays(startIso, endIso);
  return value !== null && value >= 0 ? value : null;
}

// ── raw facts (§5) — one-to-one reuse of projectService's own camelCase
// field names, grouped for readability. No new field naming invented. ─────
function buildRawFacts(project) {
  return {
    identity: {
      storeCode: project?.storeCode ?? null,
    },
    location: {
      country: project?.country ?? null,
      city: project?.city ?? null,
      locationType: project?.locationType ?? null,
    },
    classification: {
      projectType: project?.projectType ?? null,
      storeConcept: project?.storeConcept ?? null,
    },
    areas: {
      totalArea: project?.storeSizeSqm ?? null,
      salesArea: project?.salesAreaSqm ?? null,
      backOfHouseArea: project?.backOfHouseAreaSqm ?? null,
    },
    // PLANNED facts — user/project intent, editable, never engine-derived.
    plannedDates: {
      constructionStart: project?.constructionStartDate ?? null,
      constructionEnd: project?.constructionEndDate ?? null,
      targetOpening: project?.targetOpeningDate ?? null,
    },
    // ACTUAL facts — observed history. Deliberately NEVER
    // constructionCompletionDate/forecastOpeningDate (those are engine-owned
    // CPM forecasts, not historical truth — see docs/SourceOfTruth.md).
    actualDates: {
      actualConstructionStart: project?.actualConstructionStartDate ?? null,
      actualConstructionCompletion: project?.actualConstructionCompletionDate ?? null,
      actualOpening: project?.actualOpeningDate ?? null,
    },
    financial: {
      // Live project objects expose these as explicitly legacy import facts.
      // The fallback keeps this pure engine compatible with already-sealed
      // historical fixtures and records created before that naming boundary.
      budget: project?.legacyBudget ?? project?.budget ?? null,
      actualCost: project?.legacyActualCost ?? project?.actualCost ?? null,
      currencyCode: project?.currencyCode ?? null,
    },
    contractor: {
      generalContractor: project?.generalContractor ?? null,
    },
  };
}

// ── data quality issues (§14/§15) — deterministic, minimal: only the
// analytical contradictions that would corrupt a derived metric if ignored.
// Missing/optional data is never itself an issue (§15's "unknown ≠ bad
// data" distinction) — only internally-inconsistent present values are. ───
function buildQualityIssues(raw) {
  const issues = [];
  const { areas, plannedDates, actualDates, financial } = raw;

  if (isValidDateString(plannedDates.constructionStart) && isValidDateString(plannedDates.constructionEnd)
    && safeDiffDays(plannedDates.constructionStart, plannedDates.constructionEnd) < 0) {
    issues.push({ code: 'PLANNED_END_BEFORE_START', field: 'constructionEndDate', message: 'Planned construction end date is before planned construction start date.' });
  }
  // Sibling of ACTUAL_OPENING_BEFORE_COMPLETION below, same naming
  // convention, for the PLANNED equivalent (target opening vs planned
  // construction end) — not in the task's literal suggested-code list, but
  // the same duration-style contradiction the task asks this section to
  // catch (§7's plannedPreOpeningDays would otherwise silently go negative).
  if (isValidDateString(plannedDates.constructionEnd) && isValidDateString(plannedDates.targetOpening)
    && safeDiffDays(plannedDates.constructionEnd, plannedDates.targetOpening) < 0) {
    issues.push({ code: 'PLANNED_OPENING_BEFORE_CONSTRUCTION_END', field: 'targetOpeningDate', message: 'Target opening date is before planned construction end date.' });
  }
  if (isValidDateString(actualDates.actualConstructionStart) && isValidDateString(actualDates.actualConstructionCompletion)
    && safeDiffDays(actualDates.actualConstructionStart, actualDates.actualConstructionCompletion) < 0) {
    issues.push({ code: 'ACTUAL_COMPLETION_BEFORE_START', field: 'actualConstructionCompletionDate', message: 'Actual construction completion date is before actual construction start date.' });
  }
  if (isValidDateString(actualDates.actualConstructionCompletion) && isValidDateString(actualDates.actualOpening)
    && safeDiffDays(actualDates.actualConstructionCompletion, actualDates.actualOpening) < 0) {
    issues.push({ code: 'ACTUAL_OPENING_BEFORE_COMPLETION', field: 'actualOpeningDate', message: 'Actual opening date is before actual construction completion date.' });
  }
  if (isFiniteNumber(areas.totalArea) && isFiniteNumber(areas.salesArea) && num(areas.salesArea) > num(areas.totalArea)) {
    issues.push({ code: 'SALES_AREA_EXCEEDS_TOTAL', field: 'salesAreaSqm', message: 'Sales area exceeds total area.' });
  }
  for (const [field, value] of Object.entries({ storeSizeSqm: areas.totalArea, salesAreaSqm: areas.salesArea, backOfHouseAreaSqm: areas.backOfHouseArea })) {
    if (isFiniteNumber(value) && num(value) < 0) {
      issues.push({ code: 'NEGATIVE_AREA', field, message: `${field} cannot be negative.` });
    }
  }
  for (const [field, value] of Object.entries({ budget: financial.budget, actualCost: financial.actualCost })) {
    if (isFiniteNumber(value) && num(value) < 0) {
      issues.push({ code: 'NEGATIVE_MONEY', field, message: `${field} cannot be negative.` });
    }
  }
  const hasMoney = isFiniteNumber(financial.budget) || isFiniteNumber(financial.actualCost);
  if (hasMoney && !hasText(financial.currencyCode)) {
    issues.push({ code: 'MONEY_WITHOUT_CURRENCY', field: 'currencyCode', message: 'Currency is required when budget or actual cost is known.' });
  }
  return issues;
}

// ── derived metrics (§7-12) — computed whenever the metric's OWN direct
// inputs allow it. A metric being non-null does not by itself mean it is
// analytically comparable — see eligibility below for that gate (e.g. a
// cost-per-sqm value with no known currency is still computed here, but
// eligibility.costPerTotalSqm is false, since it can't be safely compared
// against another project's cost-per-sqm without knowing the currency). ───
function buildMetrics(raw) {
  const { areas, plannedDates, actualDates, financial } = raw;

  const plannedConstructionDays = safeDurationDays(plannedDates.constructionStart, plannedDates.constructionEnd);
  const plannedPreOpeningDays = safeDurationDays(plannedDates.constructionEnd, plannedDates.targetOpening);
  const actualConstructionDays = safeDurationDays(actualDates.actualConstructionStart, actualDates.actualConstructionCompletion);
  const actualPreOpeningDays = safeDurationDays(actualDates.actualConstructionCompletion, actualDates.actualOpening);

  // Variance — sign is meaningful (early vs late), never gated on
  // chronology validity; positive = later than planned, negative = earlier.
  const constructionStartVarianceDays = safeDiffDays(plannedDates.constructionStart, actualDates.actualConstructionStart);
  const constructionCompletionVarianceDays = safeDiffDays(plannedDates.constructionEnd, actualDates.actualConstructionCompletion);
  const openingVarianceDays = safeDiffDays(plannedDates.targetOpening, actualDates.actualOpening);

  const hasBudget = isFiniteNumber(financial.budget);
  const hasActualCost = isFiniteNumber(financial.actualCost);
  const costVarianceAmount = (hasBudget && hasActualCost) ? (num(financial.actualCost) - num(financial.budget)) : null;
  const costVariancePercent = (hasBudget && hasActualCost && num(financial.budget) > 0)
    ? ((num(financial.actualCost) - num(financial.budget)) / num(financial.budget)) * 100
    : null;

  const hasTotalArea = isFiniteNumber(areas.totalArea) && num(areas.totalArea) > 0;
  const hasSalesArea = isFiniteNumber(areas.salesArea) && num(areas.salesArea) > 0;

  const actualCostPerTotalSqm = (hasActualCost && hasTotalArea) ? num(financial.actualCost) / num(areas.totalArea) : null;
  const actualCostPerSalesSqm = (hasActualCost && hasSalesArea) ? num(financial.actualCost) / num(areas.salesArea) : null;
  const budgetPerTotalSqm = (hasBudget && hasTotalArea) ? num(financial.budget) / num(areas.totalArea) : null;
  const budgetPerSalesSqm = (hasBudget && hasSalesArea) ? num(financial.budget) / num(areas.salesArea) : null;

  const salesAreaRatio = (isFiniteNumber(areas.salesArea) && hasTotalArea) ? num(areas.salesArea) / num(areas.totalArea) : null;
  const backOfHouseAreaRatio = (isFiniteNumber(areas.backOfHouseArea) && hasTotalArea) ? num(areas.backOfHouseArea) / num(areas.totalArea) : null;

  return {
    plannedConstructionDays,
    plannedPreOpeningDays,
    actualConstructionDays,
    actualPreOpeningDays,
    constructionStartVarianceDays,
    constructionCompletionVarianceDays,
    openingVarianceDays,
    costVarianceAmount,
    costVariancePercent,
    actualCostPerTotalSqm,
    actualCostPerSalesSqm,
    budgetPerTotalSqm,
    budgetPerSalesSqm,
    salesAreaRatio,
    backOfHouseAreaRatio,
  };
}

// ── per-dimension analytical eligibility (§17-25) — deliberately NOT one
// global is_historical/complete flag. A project can be evidence for one
// analytical dimension and not another; Benchmark Engine (later) must check
// per dimension, not gate on a single project-level boolean. ─────────────
function buildEligibility(raw) {
  const { areas, plannedDates, actualDates, financial, contractor } = raw;

  const plannedSchedule = isValidDateString(plannedDates.constructionStart) && isValidDateString(plannedDates.constructionEnd)
    && safeDiffDays(plannedDates.constructionStart, plannedDates.constructionEnd) >= 0;

  const actualSchedule = isValidDateString(actualDates.actualConstructionStart) && isValidDateString(actualDates.actualConstructionCompletion)
    && safeDiffDays(actualDates.actualConstructionStart, actualDates.actualConstructionCompletion) >= 0;

  // No chronology requirement — an early opening (negative variance) is
  // legitimate evidence, not an error (§9's explicit "do not label negative
  // values as delay").
  const openingPerformance = isValidDateString(plannedDates.targetOpening) && isValidDateString(actualDates.actualOpening);

  const hasCurrency = hasText(financial.currencyCode);
  const costPerTotalSqm = isFiniteNumber(financial.actualCost) && hasCurrency
    && isFiniteNumber(areas.totalArea) && num(areas.totalArea) > 0;
  const costPerSalesSqm = isFiniteNumber(financial.actualCost) && hasCurrency
    && isFiniteNumber(areas.salesArea) && num(areas.salesArea) > 0;
  const costVariance = isFiniteNumber(financial.budget) && isFiniteNumber(financial.actualCost) && hasCurrency
    && num(financial.budget) > 0;

  const contractorAttribution = hasText(contractor.generalContractor);

  return {
    plannedSchedule,
    actualSchedule,
    openingPerformance,
    costPerTotalSqm,
    costPerSalesSqm,
    costVariance,
    contractorAttribution,
  };
}

/**
 * buildHistoricalProjectFacts — the ONE builder for both live and imported
 * historical projects (§3/§38: there is no separate imported-vs-live path).
 * Pure and deterministic: same canonical project facts in, same Historical
 * Project Facts out. Never mutates the input project.
 *
 * @param {object} project - canonical project (projectService.fromDB shape)
 * @returns {{
 *   identity: object, location: object, classification: object, areas: object,
 *   plannedDates: object, actualDates: object, financial: object, contractor: object,
 *   metrics: object, eligibility: object, qualityIssues: Array<{code:string, field:string, message:string}>,
 * }}
 */
export function buildHistoricalProjectFacts(project) {
  const raw = buildRawFacts(project);
  return {
    ...raw,
    metrics: buildMetrics(raw),
    eligibility: buildEligibility(raw),
    qualityIssues: buildQualityIssues(raw),
  };
}
