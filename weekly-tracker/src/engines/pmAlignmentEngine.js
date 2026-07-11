// @ts-check
import { getStatusScore, DAY_MS } from "../utils/reportUtils";
// Both legacy imports below are audited, intentional legacy-fallback
// imports — tracked in src/tests/architectureGuard.test.mjs's
// ALLOWED_LEGACY_IMPORTERS. Migrating would rewrite live legacy-report
// compatibility behavior; out of scope here and hard-constraint-protected
// (no business-semantics/weight-formula changes).
// eslint-disable-next-line no-restricted-imports
import { WORK_PACKAGES, WP_STATUS_SCORES } from "../config/workPackages";
// eslint-disable-next-line no-restricted-imports
import { constructionWeights, testingWeights, handoverWeights } from "../config/reportWeights";
import { CONFIDENCE_WEIGHTS, CONFIDENCE_LEVEL_THRESHOLDS, CONFIDENCE_LEVELS } from "../config/confidenceConfig";

/** @typedef {import('../types').AlignmentItem} AlignmentItem */
/** @typedef {import('../types').AlignmentSummary} AlignmentSummary */

// ─── Legacy key lists (old column-based format) ───────────────────────────────
export const CONS_KEYS = Object.keys(constructionWeights || {});
export const TEST_KEYS = Object.keys(testingWeights || {});
export const HAND_KEYS = Object.keys(handoverWeights || {});

// ─── Shared comparison helper ─────────────────────────────────────────────────

// AD-005: intentionally separate scale — uses 0–1 status-score diff, not percentage-point delta.
/**
 * @param {string} name
 * @param {string|null} gcS
 * @param {string|null} pmS
 * @param {string|null} [wpId]
 * @param {string|null} [taskName]
 * @returns {AlignmentItem|null}
 */
function buildAlignmentItem(name, gcS, pmS, wpId = null, taskName = null) {
  if (!gcS && !pmS) return null;

  // Normalize status strings to 0–1 scores
  const gcScore = gcS ? (WP_STATUS_SCORES[gcS] ?? getStatusScore(gcS)) : 0;
  const pmScore = pmS ? (WP_STATUS_SCORES[pmS] ?? getStatusScore(pmS)) : 0;

  // Skip Not Applicable comparisons — they are excluded from discrepancy counts
  if (gcS === "Not Applicable" || pmS === "Not Applicable") return null;

  const diff = gcScore - pmScore; // positive = GC ahead of PM (overstatement)

  const overstate   = diff > 0.4;
  const match       = Math.abs(diff) <= 0.15;
  const mismatchType =
    diff > 0.75  ? "Major overstatement"
    : diff > 0.4  ? "Overstatement"
    : diff > 0.15 ? "Minor overstatement"
    : diff < -0.15 ? "PM ahead"
    : "Match";

  // Severity only assigned for non-null mismatches worth acting on
  const severity =
    diff > 0.75  ? "CRITICAL"
    : diff > 0.4  ? "HIGH"
    : diff > 0.15 ? "MEDIUM"
    : null;

  return {
    name,
    wpId,
    taskName,
    gcStatus: gcS || "—",
    pmStatus: pmS || "—",
    gcScore,
    pmScore,
    diff,
    overstate,
    match,
    mismatchType,
    severity,
  };
}

// ─── New WP format alignment ──────────────────────────────────────────────────

/**
 * @param {Record<string, any>} gcReport
 * @param {Record<string, any>} pmVisit
 * @returns {AlignmentItem[]}
 */
function computePmAlignmentItemsWP(gcReport, pmVisit) {
  const items = [];

  for (const wp of WORK_PACKAGES) {
    const gcWP = gcReport.workPackageStatuses?.[wp.id];
    const pmWP = pmVisit.pmWorkPackageStatuses?.[wp.id];

    // Skip entirely if neither side has data for this WP
    if (!gcWP && !pmWP) continue;

    for (const task of wp.tasks) {
      const gcEntry = gcWP?.[task.name];
      const pmEntry = pmWP?.[task.name];

      const gcS = gcEntry?.status || null;
      const pmS = pmEntry?.observedStatus || null;

      // Only compare if PM has actually observed this task
      if (!pmS) continue;

      const item = buildAlignmentItem(task.name, gcS, pmS, wp.id, task.name);
      if (item) items.push(item);
    }
  }

  return items;
}

// ─── Legacy column-based format alignment ────────────────────────────────────

/**
 * @legacy
 * This path handles old `reports` format alignment (demolitionStatus /
 * constructionStatuses / testingStatuses / handoverStatuses flat columns).
 * Canonical path (computePmAlignmentItemsWP above) uses the Gantt
 * workPackageStatuses / pmWorkPackageStatuses shape.
 * Keep for backward compatibility until legacy reports are deprecated.
 * See: src/engines/COMPARISON_MODEL.md
 * @param {Record<string, any>} gcReport
 * @param {Record<string, any>} pmVisit
 * @returns {AlignmentItem[]}
 */
function computePmAlignmentItemsLegacy(gcReport, pmVisit) {
  /** @type {AlignmentItem[]} */
  const items = [];

  /** @param {string} name @param {string} gcS @param {string} pmS */
  const push = (name, gcS, pmS) => {
    const item = buildAlignmentItem(name, gcS || "", pmS || "");
    if (item) items.push(item);
  };

  push("Demolition", gcReport.demolitionStatus || "", pmVisit.demolitionStatus || "");
  CONS_KEYS.forEach(k => push(k, gcReport.constructionStatuses?.[k] || "", pmVisit.constructionStatuses?.[k] || ""));
  TEST_KEYS.forEach(k => push(k, gcReport.testingStatuses?.[k] || "", pmVisit.testingStatuses?.[k] || ""));
  HAND_KEYS.forEach(k => push(k, gcReport.handoverStatuses?.[k] || "", pmVisit.handoverStatuses?.[k] || ""));

  return items;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compare GC-reported task statuses against PM-observed statuses.
 * Automatically detects new WP format vs legacy column format.
 *
 * Returns an array of alignment items, each describing one task comparison.
 * Items where both sides are null, or where either side is "Not Applicable",
 * are excluded from the result.
 * @param {Record<string, any>|null} gcReport
 * @param {Record<string, any>|null} pmVisit
 * @returns {AlignmentItem[]}
 */
export function computePmAlignmentItems(gcReport, pmVisit) {
  if (!gcReport || !pmVisit) return [];

  // New format: workPackageStatuses on GC + pmWorkPackageStatuses on PM visit
  const useNewFormat =
    gcReport.workPackageStatuses != null ||
    pmVisit.pmWorkPackageStatuses != null;

  if (useNewFormat) {
    return computePmAlignmentItemsWP(gcReport, pmVisit);
  }

  // Fall back to legacy column format
  return computePmAlignmentItemsLegacy(gcReport, pmVisit);
}

/**
 * How much can we trust the risk score for this project?
 *
 * Points breakdown (max 8):
 *   Report count: 1 (≥1) / 2 (≥4) / 3 (≥8)
 *   Site visit count: 2 (1 visit) / 3 (≥2 visits)
 *   Report freshness: 1 (≤14d) / 2 (≤7d)
 *
 * Levels: LOW (0–2) | MEDIUM (3–5) | HIGH (6–8)
 * @param {Array<Record<string, any>>} projReports
 * @param {Array<Record<string, any>>} projSiteVisits
 * @param {Record<string, any>|null} latestReport
 * @returns {{level: 'LOW'|'MEDIUM'|'HIGH', pts: number, maxPts: number, color: string, colorBg: string, label: string, breakdown: Array<{dimension: string, earned: number, max: number, detail: string}>}}
 */
export function computeConfidenceLevel(projReports, projSiteVisits, latestReport, referenceDate = new Date()) {
  const W = CONFIDENCE_WEIGHTS;
  const breakdown = [];
  let maxPts = 0;

  // Report history depth
  const reportEarned = W.reportHistoryThresholds.find(t => projReports.length >= t.count)?.pts ?? 0;
  maxPts += W.reportHistoryMax;
  breakdown.push({
    dimension: 'Report history',
    earned: reportEarned,
    max: W.reportHistoryMax,
    detail: projReports.length === 0
      ? 'No reports submitted'
      : `${projReports.length} report${projReports.length === 1 ? '' : 's'} submitted`,
  });

  // PM verification coverage
  const visitEarned = W.pmSiteVisitsThresholds.find(t => projSiteVisits.length >= t.count)?.pts ?? 0;
  maxPts += W.pmSiteVisitsMax;
  breakdown.push({
    dimension: 'PM site visits',
    earned: visitEarned,
    max: W.pmSiteVisitsMax,
    detail: projSiteVisits.length === 0
      ? 'No site visits recorded'
      : `${projSiteVisits.length} site visit${projSiteVisits.length === 1 ? '' : 's'} recorded`,
  });

  // Report freshness
  let freshnessEarned = 0;
  let freshnessDetail = 'No recent report';
  if (latestReport) {
    const daysSince = Math.floor(
      (new Date(referenceDate).getTime() - new Date(latestReport.reportingDate || latestReport.submittedAt).getTime())
      / DAY_MS
    );
    freshnessEarned = daysSince <= W.reportFreshnessFreshDays ? W.reportFreshnessMax
      : daysSince <= W.reportFreshnessStaleDays ? Math.ceil(W.reportFreshnessMax / 2) : 0;
    freshnessDetail = `Last report ${daysSince}d ago`;
  }
  maxPts += W.reportFreshnessMax;
  breakdown.push({
    dimension: 'Report freshness',
    earned: freshnessEarned,
    max: W.reportFreshnessMax,
    detail: freshnessDetail,
  });

  // Photo evidence on the latest report
  const hasPhotos = (latestReport?.photos?.length ?? 0) > 0;
  const photoEarned = hasPhotos ? W.photoEvidenceMax : 0;
  maxPts += W.photoEvidenceMax;
  breakdown.push({
    dimension: 'Photo evidence',
    earned: photoEarned,
    max: W.photoEvidenceMax,
    detail: latestReport
      ? (hasPhotos ? `${latestReport.photos.length} photo${latestReport.photos.length === 1 ? '' : 's'} attached` : 'No photos on latest report')
      : 'No reports submitted',
  });

  // Suspicious jump: this report's own claimed overallProgress vs. the report
  // immediately before it — a self-reported-claim-quality check, distinct
  // from the official weighted progress engine (see P1.4). A jump this large
  // in one reporting period isn't necessarily wrong, just worth a second look.
  let jumpPenalty = 0;
  let jumpDetail = 'Not enough report history to compare';
  const sorted = [...projReports].sort((a, b) => Date.parse(a.reportingDate || a.submittedAt) - Date.parse(b.reportingDate || b.submittedAt));
  const [prev, latest] = sorted.slice(-2);
  if (prev && latest) {
    const jump = (latest.overallProgress ?? 0) - (prev.overallProgress ?? 0);
    if (jump >= W.suspiciousJumpThresholdPct) {
      jumpPenalty = W.suspiciousJumpPenalty;
      jumpDetail = `Jumped +${jump}pp in one report (${prev.overallProgress ?? 0}% → ${latest.overallProgress ?? 0}%)`;
    } else {
      jumpDetail = `Latest change: ${jump >= 0 ? '+' : ''}${jump}pp`;
    }
  }
  breakdown.push({
    dimension: 'Reporting pattern',
    earned: -jumpPenalty,
    max: 0,
    detail: jumpDetail,
  });

  const rawPts = reportEarned + visitEarned + freshnessEarned + photoEarned - jumpPenalty;
  const pts = Math.max(0, Math.min(maxPts, rawPts));

  const ratio = maxPts > 0 ? pts / maxPts : 0;
  const level = ratio >= CONFIDENCE_LEVEL_THRESHOLDS.HIGH ? CONFIDENCE_LEVELS.HIGH : ratio >= CONFIDENCE_LEVEL_THRESHOLDS.MEDIUM ? CONFIDENCE_LEVELS.MEDIUM : CONFIDENCE_LEVELS.LOW;
  const color   = level === "HIGH" ? "var(--status-done)"  : level === "MEDIUM" ? "var(--status-warn)" : "var(--text-muted)";
  const colorBg = level === "HIGH" ? "var(--status-done-bg)" : level === "MEDIUM" ? "var(--status-warn-bg)" : "var(--bg-elevated)";
  const label =
    level === "HIGH"   ? "High confidence" :
    level === "MEDIUM" ? "Moderate confidence" :
                         "Limited data";

  return { level, pts, maxPts, color, colorBg, label, breakdown };
}

/**
 * @param {AlignmentItem[]} items
 * @returns {AlignmentSummary}
 */
export function summarizeAlignmentItems(items) {
  const overstatements = items.filter(i => i.overstate);
  const matches = items.filter(i => i.match);
  const matchRate = items.length > 0 ? Math.round((matches.length / items.length) * 100) : 100;
  return { matchRate, overstatements, matches };
}

// pmAlignmentScore (see contScore.pmAlignmentScore, computed by contractorEngine)
// is on a 0-100 scale — display code showing "score / 100" should import this
// instead of hardcoding the denominator.
export const MAX_ALIGNMENT_SCORE = 100;

/** Rows that have at least one PM site visit recorded — PmAlignmentTab.jsx's
 * "anything to show?" gate, single-sourced instead of reimplemented per call site. */
export function filterRowsWithSiteVisits(rows) {
  return rows.filter(r => r.projSiteVisits.length > 0);
}
