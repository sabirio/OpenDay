// @ts-check
import { getStatusScore, DAY_MS } from "../utils/reportUtils";
import { WORK_PACKAGES, WP_STATUS_SCORES } from "../config/workPackages";
import { constructionWeights, testingWeights, handoverWeights } from "../config/reportWeights";

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
export function computeConfidenceLevel(projReports, projSiteVisits, latestReport) {
  const breakdown = [];

  // Report history depth (max 3pts)
  const reportEarned =
    projReports.length >= 8 ? 3 :
    projReports.length >= 4 ? 2 :
    projReports.length >= 1 ? 1 : 0;
  breakdown.push({
    dimension: 'Report history',
    earned: reportEarned,
    max: 3,
    detail: projReports.length === 0
      ? 'No reports submitted'
      : `${projReports.length} report${projReports.length === 1 ? '' : 's'} submitted`,
  });

  // PM verification coverage (max 3pts)
  const visitEarned =
    projSiteVisits.length >= 2 ? 3 :
    projSiteVisits.length === 1 ? 2 : 0;
  breakdown.push({
    dimension: 'PM site visits',
    earned: visitEarned,
    max: 3,
    detail: projSiteVisits.length === 0
      ? 'No site visits recorded'
      : `${projSiteVisits.length} site visit${projSiteVisits.length === 1 ? '' : 's'} recorded`,
  });

  // Report freshness (max 2pts)
  let freshnessEarned = 0;
  let freshnessDetail = 'No recent report';
  if (latestReport) {
    const daysSince = Math.floor(
      (Date.now() - new Date(latestReport.reportingDate || latestReport.submittedAt).getTime())
      / DAY_MS
    );
    freshnessEarned = daysSince <= 7 ? 2 : daysSince <= 14 ? 1 : 0;
    freshnessDetail = `Last report ${daysSince}d ago`;
  }
  breakdown.push({
    dimension: 'Report freshness',
    earned: freshnessEarned,
    max: 2,
    detail: freshnessDetail,
  });

  const pts = reportEarned + visitEarned + freshnessEarned;

  // LOW 0–2 | MEDIUM 3–5 | HIGH 6–8
  const level = pts >= 6 ? "HIGH" : pts >= 3 ? "MEDIUM" : "LOW";
  const color   = level === "HIGH" ? "var(--status-done)"  : level === "MEDIUM" ? "var(--status-warn)" : "var(--text-muted)";
  const colorBg = level === "HIGH" ? "var(--status-done-bg)" : level === "MEDIUM" ? "var(--status-warn-bg)" : "var(--bg-elevated)";
  const label =
    level === "HIGH"   ? "High confidence" :
    level === "MEDIUM" ? "Moderate confidence" :
                         "Limited data";

  return { level, pts, maxPts: 8, color, colorBg, label, breakdown };
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
