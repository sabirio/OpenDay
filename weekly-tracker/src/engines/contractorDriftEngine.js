// Contractor Drift Engine — detects systematic over/under-reporting patterns.
// Pure functions, no React imports, testable in Node.js.
import { computePmAlignmentItems } from './pmAlignmentEngine';
import { RISK_WEIGHTS } from '../config/riskWeights';

// A2 (2026-07-06): "trust index" / bias-correction fields, added alongside
// the existing avgHistoricalDrift/correctionFactor (kept as-is for
// DriftChart.jsx's backward compatibility — that's a simple, all-history
// average; these are the recency-weighted counterpart used for forecasting).

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a timeline of contractor drift scores across all site visits.
 *
 * For each site visit, finds the most recent GC report filed before the visit
 * date, runs computePmAlignmentItems(), and sums the per-task diffs.
 *
 * @param {object[]} sortedReports  — GC reports sorted oldest-first
 * @param {object[]} siteVisits     — PM site visit records for the same project
 * @returns Array of drift data points, one per site visit.
 *   [{ week, date, driftScore, itemCount, avgDiff }]
 *   driftScore = Σ(gcScore – pmScore) across all compared tasks
 *   avgDiff    = driftScore / itemCount
 */
export function computeDriftTimeline(sortedReports, siteVisits) {
  if (!siteVisits || siteVisits.length === 0) return [];

  const sortedVisits = [...siteVisits].sort(
    (a, b) => new Date(a.visitDate || a.submittedAt) - new Date(b.visitDate || b.submittedAt)
  );

  return sortedVisits.map((visit, i) => {
    const visitDate = new Date(visit.visitDate || visit.submittedAt);

    // Last GC report at or before this visit date
    const gcReport = [...sortedReports]
      .filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate)
      .sort((a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt))[0];

    if (!gcReport) {
      return { week: i + 1, date: visit.visitDate || visit.submittedAt, driftScore: 0, itemCount: 0, avgDiff: 0 };
    }

    const items      = computePmAlignmentItems(gcReport, visit);
    const driftScore = items.reduce((sum, item) => sum + item.diff, 0);
    const itemCount  = items.length;
    const avgDiff    = itemCount > 0 ? driftScore / itemCount : 0;

    return {
      week:       i + 1,
      date:       visit.visitDate || visit.submittedAt,
      driftScore: Math.round(driftScore * 100) / 100,
      itemCount,
      avgDiff:    Math.round(avgDiff * 100) / 100,
    };
  });
}

/**
 * Classify the drift timeline into one of four patterns.
 *
 * @param {object[]} driftTimeline  — from computeDriftTimeline()
 * @returns { pattern, confidence, description, avgOverallDrift }
 *
 * Patterns:
 *   'systematic_overstatement' — avgDiff > +0.15 on 70%+ of visits
 *   'panic_report'             — sharp drop (> 0.4 in one step) after sustained high values
 *   'front_loading'            — high in first half, lower in second half
 *   'accurate'                 — no detectable pattern
 */
export function computeDriftPattern(driftTimeline) {
  if (!driftTimeline || driftTimeline.length === 0) {
    return { pattern: 'accurate', confidence: 'low', description: 'Insufficient data', avgOverallDrift: 0 };
  }

  const avgOverallDrift = driftTimeline.reduce((s, p) => s + p.avgDiff, 0) / driftTimeline.length;
  const rounded         = Math.round(avgOverallDrift * 100) / 100;

  if (driftTimeline.length < 2) {
    return { pattern: 'accurate', confidence: 'low', description: 'Only one data point available', avgOverallDrift: rounded };
  }

  // Systematic overstatement: most visits show positive drift
  const overPts   = driftTimeline.filter(p => p.avgDiff > 0.15).length;
  const overRatio = overPts / driftTimeline.length;
  if (avgOverallDrift > 0.15 && overRatio >= 0.7) {
    return {
      pattern:         'systematic_overstatement',
      confidence:      driftTimeline.length >= 4 ? 'high' : 'medium',
      description:     `Contractor consistently overstates progress by an average of ${Math.round(avgOverallDrift * 100)}%`,
      avgOverallDrift: rounded,
    };
  }

  // Panic report: a sudden large drop after sustained overstatement
  for (let i = 1; i < driftTimeline.length; i++) {
    const drop = driftTimeline[i - 1].avgDiff - driftTimeline[i].avgDiff;
    if (drop > 0.4 && driftTimeline[i - 1].avgDiff > 0.15) {
      return {
        pattern:         'panic_report',
        confidence:      'medium',
        description:     'Sudden drop in reported progress detected after sustained overstatement',
        avgOverallDrift: rounded,
      };
    }
  }

  // Front-loading: higher drift in first half than second half
  if (driftTimeline.length >= 4) {
    const half       = Math.floor(driftTimeline.length / 2);
    const firstAvg   = driftTimeline.slice(0, half).reduce((s, p) => s + p.avgDiff, 0) / half;
    const secondAvg  = driftTimeline.slice(half).reduce((s, p) => s + p.avgDiff, 0) / (driftTimeline.length - half);
    if (firstAvg > 0.2 && secondAvg < firstAvg - 0.15) {
      return {
        pattern:         'front_loading',
        confidence:      'medium',
        description:     'Contractor overstated progress early in the project, with better alignment later',
        avgOverallDrift: rounded,
      };
    }
  }

  return {
    pattern:         'accurate',
    confidence:      driftTimeline.length >= 3 ? 'high' : 'medium',
    description:     'No systematic overstatement or understatement detected',
    avgOverallDrift: rounded,
  };
}

/**
 * Exponentially-weighted moving average of a contractor's bias, across a
 * chronologically-ordered (oldest-first) drift timeline — recent
 * discrepancies count more than old ones, unlike avgHistoricalDrift's plain
 * average. Same 0-1 scale as avgDiff/avgHistoricalDrift (0.08 = "+8%").
 *
 * @param {object[]} driftTimeline — from computeDriftTimeline(), oldest-first
 * @param {number}   [alpha=0.3]
 * @returns {{ biasEwma: number, sampleCount: number }}
 */
export function computeBiasEwma(driftTimeline, alpha = 0.3) {
  if (!driftTimeline || driftTimeline.length === 0) return { biasEwma: 0, sampleCount: 0 };
  let ewma = driftTimeline[0].avgDiff;
  for (let i = 1; i < driftTimeline.length; i++) {
    ewma = alpha * driftTimeline[i].avgDiff + (1 - alpha) * ewma;
  }
  return { biasEwma: Math.round(ewma * 1000) / 1000, sampleCount: driftTimeline.length };
}

/**
 * How much weight the bias estimate should carry, ramping linearly from 0
 * to full weight as more site-visit samples accumulate (full weight at 5+).
 * Engine-audit fix (2026-07-16): single shared source of truth — this exact
 * formula previously lived independently in computeAdjustedProgress() and
 * computeContractorDriftProfile(), risking silent divergence if one were
 * ever tuned without the other (the recurring bug class this project has
 * hit before — see F-02/F-01 in the July audit).
 * @param {number} sampleCount
 * @returns {number} 0-1
 */
export function computeDriftConfidenceFactor(sampleCount) {
  return Math.min(1, sampleCount / 5);
}

/**
 * Apply a contractor's known bias to one reported progress value, for
 * forecasting only (Monte Carlo / SPI alternate series) — never for the
 * official reported number itself.
 *
 * Below 3 site-visit samples, the bias estimate isn't trustworthy enough to
 * act on: returns reportedProgress unchanged (the bias is still fine to
 * *display*, just not to apply).
 *
 * @param {number} reportedProgress — 0-100
 * @param {number} biasEwma         — 0-1 scale, from computeBiasEwma()
 * @param {number} sampleCount
 * @returns {number} adjusted progress, 0-100, clamped
 */
export function computeAdjustedProgress(reportedProgress, biasEwma, sampleCount) {
  if (sampleCount < 3) return reportedProgress;
  const confidenceFactor = computeDriftConfidenceFactor(sampleCount);
  const adjusted = reportedProgress - (biasEwma * 100) * confidenceFactor;
  return Math.round(Math.max(0, Math.min(100, adjusted)) * 10) / 10;
}

/**
 * Risk-engine input: does this contractor's bias warrant its own risk
 * factor? Pure function — computeRiskRows.js reads the result, no
 * recalculation there (same pattern as A3's readiness.verdict).
 *
 * @param {object|null} driftProfile — computeContractorDriftProfile() output
 * @returns {{ pts: number, value: string } | null} null when below threshold
 *   or not yet reliable (sampleCount < 3)
 */
export function computeDriftRiskFactor(driftProfile) {
  const W = RISK_WEIGHTS.systematicOverstatement;
  if (!driftProfile || !driftProfile.reliable) return null;
  const biasPct = driftProfile.biasEwma * 100;
  if (biasPct < W.thresholdPct) return null;
  return {
    pts: W.pts,
    value: `${driftProfile.contractorName || 'Contractor'} historically overstates by ~${Math.round(biasPct)}% (n=${driftProfile.sampleCount})`,
  };
}

/**
 * Build a drift profile for a contractor across all their projects.
 *
 * @param {object[]} projects       — all projects
 * @param {object[]} reports        — all GC reports
 * @param {object[]} siteVisits     — all PM site visits
 * @param {string}   contractorName — must match project.generalContractor
 * @returns {object} contractor drift profile
 */
export function computeContractorDriftProfile(projects, reports, siteVisits, contractorName) {
  if (!contractorName) return null;

  const contractorProjects = projects.filter(p => p.generalContractor === contractorName);
  if (contractorProjects.length === 0) {
    return {
      contractorName,
      projectCount:        0,
      avgHistoricalDrift:  0,
      correctionFactor:    1,
      reliabilityScore:    100,
      worstProject:        null,
      pattern:             { pattern: 'accurate', confidence: 'low', description: 'No projects found', avgOverallDrift: 0 },
      biasEwma:            0,
      sampleCount:         0,
      confidenceFactor:    0,
      reliable:            false,
    };
  }

  const projectResults = contractorProjects.map(project => {
    const projReports    = reports.filter(r => String(r.projectId) === String(project.id));
    const projSiteVisits = siteVisits.filter(v => String(v.projectId) === String(project.id));
    const sorted = [...projReports].sort(
      (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
    );
    const timeline  = computeDriftTimeline(sorted, projSiteVisits);
    const avgDrift  = timeline.length > 0
      ? Math.round((timeline.reduce((s, p) => s + p.avgDiff, 0) / timeline.length) * 100) / 100
      : 0;
    return { storeCode: project.storeCode, avgDrift, timeline };
  });

  const allTimelines       = projectResults.flatMap(r => r.timeline);
  const avgHistoricalDrift = allTimelines.length > 0
    ? Math.round((allTimelines.reduce((s, p) => s + p.avgDiff, 0) / allTimelines.length) * 100) / 100
    : 0;

  // 100 = perfect alignment; penalise proportionally to absolute average drift
  const reliabilityScore  = Math.round(Math.max(0, Math.min(100, 100 - Math.abs(avgHistoricalDrift) * 200)));
  const correctionFactor  = Math.round((1 + avgHistoricalDrift) * 100) / 100;

  const sorted            = [...projectResults].sort((a, b) => Math.abs(b.avgDrift) - Math.abs(a.avgDrift));
  const worstProject      = sorted[0] || null;

  // EWMA needs a single chronological (oldest-first) timeline across ALL of
  // the contractor's projects — allTimelines above is just a concatenation
  // in whatever order contractorProjects happened to be in, not date order.
  const chronological = [...allTimelines].sort((a, b) => new Date(a.date) - new Date(b.date));
  const { biasEwma, sampleCount } = computeBiasEwma(chronological);
  const confidenceFactor = computeDriftConfidenceFactor(sampleCount);
  const reliable = sampleCount >= 3;

  return {
    contractorName,
    projectCount:        contractorProjects.length,
    avgHistoricalDrift,
    correctionFactor,
    reliabilityScore,
    worstProject,
    pattern:             computeDriftPattern(allTimelines),
    biasEwma,
    sampleCount,
    confidenceFactor,
    reliable,
  };
}

// ─── Display formatting (DriftChart.jsx) ───────────────────────────────────────
// avgHistoricalDrift/biasEwma/worstProject.avgDrift are all the same kind of
// value — a signed proportion (e.g. 0.12 = +12%) — so one pair of formatters
// covers all three instead of each display site re-deriving its own.

/** A drift proportion (e.g. 0.12) as a signed rounded percent (e.g. 12). */
export function formatDriftPct(drift) {
  return Math.round((drift ?? 0) * 100);
}

/** Absolute rounded percent — for badge-color lookups that don't care about sign. */
export function formatAbsDriftPct(drift) {
  return Math.abs(Math.round((drift ?? 0) * 100));
}

/** Magnitude of a drift proportion, for significance-threshold comparisons. */
export function driftMagnitude(drift) {
  return Math.abs(drift ?? 0);
}

// Below this magnitude, a contractor's historical drift isn't worth calling
// out in the UI — DriftChart.jsx's "historically overstates/understates by"
// note and its "Worst: <project>" line both gate on this same bar.
export const DRIFT_SIGNIFICANCE_THRESHOLD = 0.05;
