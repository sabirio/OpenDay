import {
  constructionWeights,
  testingWeights,
  handoverWeights,
  phaseWeights,
  statusScores,
} from "../config/reportWeights";

import {
  WORK_PACKAGES,
  WP_STATUS_SCORES,
  computePackageProgress,
  computeProjectProgressFromWP,
  mergeWPStatuses,
  makeEmptyWPStatuses,
} from "../config/workPackages";

export const PHASE_ORDER = [
  "Demolition works",
  "Construction works",
  "Testing & Commissioning",
  "Handover",
];

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB");
}

export function getStatusScore(value) {
  if (!value && value !== 0) return 0;
  const raw = String(value).trim();
  if (statusScores?.[raw] !== undefined) return statusScores[raw];
  const n = raw.toLowerCase();
  if (n.includes("completed") || n.includes("ready") || n.includes("accepted")) return 1;
  if (n.includes("in progress") || n.includes("started")) return 0.5;
  if (n.includes("planned") || n.includes("scheduled")) return 0.25;
  if (n.includes("not") || n === "no") return 0;
  return 0.25;
}

export function computeCumulativeStatuses(projectReports) {
  if (!projectReports || projectReports.length === 0) return null;

  const sorted = [...projectReports].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  );

  let maxPhaseIdx = -1;
  let bestDemoStatus = null;
  const bestConstruction = {};
  const bestTesting = {};
  const bestHandover = {};

  for (const r of sorted) {
    const phases = Array.isArray(r.currentPhases) ? r.currentPhases : (r.currentPhase ? [r.currentPhase] : []);
    phases.forEach((p) => {
      const idx = PHASE_ORDER.indexOf(p);
      if (idx > maxPhaseIdx) maxPhaseIdx = idx;
    });

    if (r.demolitionStatus) {
      const s = getStatusScore(r.demolitionStatus);
      if (!bestDemoStatus || s > getStatusScore(bestDemoStatus)) bestDemoStatus = r.demolitionStatus;
    }

    Object.keys(constructionWeights || {}).forEach((k) => {
      const st = r.constructionStatuses?.[k];
      if (st && (!bestConstruction[k] || getStatusScore(st) > getStatusScore(bestConstruction[k])))
        bestConstruction[k] = st;
    });

    Object.keys(testingWeights || {}).forEach((k) => {
      const st = r.testingStatuses?.[k];
      if (st && (!bestTesting[k] || getStatusScore(st) > getStatusScore(bestTesting[k])))
        bestTesting[k] = st;
    });

    Object.keys(handoverWeights || {}).forEach((k) => {
      const st = r.handoverStatuses?.[k];
      if (st && (!bestHandover[k] || getStatusScore(st) > getStatusScore(bestHandover[k])))
        bestHandover[k] = st;
    });
  }

  const latest = sorted[sorted.length - 1];

  const latestPhases = Array.isArray(latest?.currentPhases)
    ? latest.currentPhases
    : (latest?.currentPhase ? [latest.currentPhase] : []);
  const latestPhaseIndices = latestPhases.map((p) => PHASE_ORDER.indexOf(p)).filter((i) => i >= 0);
  const minActiveIdx = latestPhaseIndices.length > 0 ? Math.min(...latestPhaseIndices) : maxPhaseIdx;

  if (minActiveIdx > 0) bestDemoStatus = "Completed";
  if (minActiveIdx > 1) {
    Object.keys(constructionWeights || {}).forEach((k) => { bestConstruction[k] = "Completed"; });
  }
  if (minActiveIdx > 2) {
    Object.keys(testingWeights || {}).forEach((k) => { bestTesting[k] = "Completed"; });
  }

  return {
    demolitionStatus: bestDemoStatus,
    constructionStatuses: bestConstruction,
    testingStatuses: bestTesting,
    handoverStatuses: bestHandover,
    currentPhase: maxPhaseIdx >= 0 ? PHASE_ORDER[maxPhaseIdx] : (latest?.currentPhases?.[0] || latest?.currentPhase),
    projectScheduleStatus: latest?.projectScheduleStatus,
  };
}

// ─── Work Package utilities (new format) ──────────────────────────────────────

/** Returns true if a report uses the new workPackageStatuses format */
export function isWPReport(report) {
  return report && report.workPackageStatuses != null;
}

/**
 * Compute cumulative WP statuses across all project reports that use the new format.
 * Keeps the best (highest scoring) status per task across all reports.
 */
export function computeWPCumulativeStatuses(projectReports) {
  if (!projectReports || projectReports.length === 0) return null;

  const wpReports = projectReports.filter(isWPReport);
  if (wpReports.length === 0) return null;

  const sorted = [...wpReports].sort(
    (a, b) =>
      new Date(a.reportingDate || a.submittedAt) -
      new Date(b.reportingDate || b.submittedAt)
  );

  const snapshots = sorted.map((r) => r.workPackageStatuses);
  const merged = mergeWPStatuses(snapshots);
  const latest = sorted[sorted.length - 1];

  return {
    workPackageStatuses: merged,
    projectScheduleStatus: latest?.projectScheduleStatus,
    currentPhase: latest?.currentPhase || latest?.currentPhases?.[0],
  };
}

/**
 * Estimate progress % from either old or new report format.
 * Tries new WP format first; falls back to old estimateProgressFromStatuses.
 */
export function estimateProgressAuto(r) {
  if (!r) return 0;
  if (isWPReport(r)) {
    return computeProjectProgressFromWP(r.workPackageStatuses);
  }
  return estimateProgressFromStatuses(r);
}

/**
 * Get per-package progress map { [wpId]: 0-100 } from a WP report.
 */
export function getPackageProgressMap(wpStatuses) {
  if (!wpStatuses) return {};
  const map = {};
  for (const wp of WORK_PACKAGES) {
    map[wp.id] = computePackageProgress(wpStatuses, wp.id);
  }
  return map;
}

export function estimateProgressFromStatuses(r) {
  if (!r) return 0;

  const demoW = phaseWeights?.["Demolition works"] || 0;
  const consW = phaseWeights?.["Construction works"] || 0;
  const testW = phaseWeights?.["Testing & Commissioning"] || 0;
  const handW = phaseWeights?.["Handover"] || 0;
  const totalWeight = demoW + consW + testW + handW;
  if (totalWeight === 0)
    return r.projectScheduleStatus === "On Track" ? 65 : r.projectScheduleStatus === "At Risk" ? 30 : r.projectScheduleStatus === "Delayed" ? 20 : r.projectScheduleStatus === "Critical" ? 10 : 0;

  let weightedSum = 0;

  if (demoW && r.demolitionStatus)
    weightedSum += demoW * getStatusScore(r.demolitionStatus);

  if (consW) {
    let iT = 0, iS = 0;
    Object.keys(constructionWeights || {}).forEach((k) => {
      const w = constructionWeights[k] || 0, st = r.constructionStatuses?.[k];
      if (w > 0 && st !== undefined) { iT += w; iS += w * getStatusScore(st); }
    });
    if (iT > 0) weightedSum += consW * (iS / iT);
  }

  if (testW) {
    let iT = 0, iS = 0;
    Object.keys(testingWeights || {}).forEach((k) => {
      const w = testingWeights[k] || 0, st = r.testingStatuses?.[k];
      if (w > 0 && st !== undefined) { iT += w; iS += w * getStatusScore(st); }
    });
    if (iT > 0) weightedSum += testW * (iS / iT);
  }

  if (handW) {
    let iT = 0, iS = 0;
    Object.keys(handoverWeights || {}).forEach((k) => {
      const w = handoverWeights[k] || 0, st = r.handoverStatuses?.[k];
      if (w > 0 && st !== undefined) { iT += w; iS += w * getStatusScore(st); }
    });
    if (iT > 0) weightedSum += handW * (iS / iT);
  }

  return Math.round((weightedSum / totalWeight) * 100);
}

// ─── Shared constants ─────────────────────────────────────────────────────────

export const DAY_MS = 86400000;

// ─── Schedule status predicates ───────────────────────────────────────────────

export function isBadScheduleStatus(status)    { return status === "At Risk" || status === "Delayed" || status === "Critical"; }
export function isSevereScheduleStatus(status) { return status === "Delayed" || status === "Critical"; }

// ─── Report freshness helpers ─────────────────────────────────────────────────

export function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / DAY_MS);
}

export function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / DAY_MS);
}

export function isMissingReport(latestReport) {
  if (!latestReport) return true;
  return daysSince(latestReport.reportingDate || latestReport.submittedAt) > 7;
}

// ─── Progress history ─────────────────────────────────────────────────────────

export function progressAtIndex(sortedReports, index) {
  const slice = sortedReports.slice(0, index + 1);
  const wpCum = computeWPCumulativeStatuses(slice);
  if (wpCum?.workPackageStatuses) {
    return computeProjectProgressFromWP(wpCum.workPackageStatuses);
  }
  return estimateProgressFromStatuses(computeCumulativeStatuses(slice));
}
