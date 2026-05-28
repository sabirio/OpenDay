import { getStatusScore } from "../utils/reportUtils";
import { WORK_PACKAGES, WP_STATUS_SCORES } from "../config/workPackages";
import { constructionWeights, testingWeights, handoverWeights } from "../config/reportWeights";

// ─── Legacy key lists (old column-based format) ───────────────────────────────
export const CONS_KEYS = Object.keys(constructionWeights || {});
export const TEST_KEYS = Object.keys(testingWeights || {});
export const HAND_KEYS = Object.keys(handoverWeights || {});

// ─── Shared comparison helper ─────────────────────────────────────────────────

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

function computePmAlignmentItemsLegacy(gcReport, pmVisit) {
  const items = [];

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
 */
export function computeConfidenceLevel(projReports, projSiteVisits, latestReport) {
  let pts = 0;

  // Report history depth
  if (projReports.length >= 8)      pts += 3;
  else if (projReports.length >= 4) pts += 2;
  else if (projReports.length >= 1) pts += 1;

  // PM verification coverage
  if (projSiteVisits.length >= 2)      pts += 3;
  else if (projSiteVisits.length === 1) pts += 2;

  // Report freshness
  if (latestReport) {
    const daysSince = Math.floor(
      (Date.now() - new Date(latestReport.reportingDate || latestReport.submittedAt).getTime())
      / 86400000
    );
    if (daysSince <= 7)       pts += 2;
    else if (daysSince <= 14) pts += 1;
  }

  // LOW 0–2 | MEDIUM 3–5 | HIGH 6–8
  const level = pts >= 6 ? "HIGH" : pts >= 3 ? "MEDIUM" : "LOW";
  const color = level === "HIGH" ? "#22c55e" : level === "MEDIUM" ? "#f59e0b" : "#94a3b8";
  const label =
    level === "HIGH"   ? "High confidence" :
    level === "MEDIUM" ? "Moderate confidence" :
                         "Limited data";

  return { level, pts, maxPts: 8, color, label };
}
