/**
 * reportUtils.js — MIXED file, not purely legacy. See src/engines/PROGRESS_MODEL.md.
 *
 * - Legacy (already @legacy-marked below): PHASE_ORDER, getStatusScore(),
 *   computeCumulativeStatuses(), estimateProgressFromStatuses() — old 4-phase
 *   flat-status format only. Do not call from new code.
 * - Canonical-adjacent (NOT legacy): isWPReport(), computeWPCumulativeStatuses().
 *   progressEngine.js itself imports and calls these directly to build the
 *   Gantt-format cumulative status object it computes progress from — they
 *   are part of the canonical pipeline, not a migration target.
 *
 * Wave 6: do not add a blanket "do not use this file" banner here — half of
 * it is load-bearing for progressEngine.js. See PROGRESS_MODEL.md before
 * assuming any function here should be avoided.
 */

// Both legacy imports below are audited, intentional legacy-fallback
// imports — tracked in src/tests/architectureGuard.test.mjs's
// ALLOWED_LEGACY_IMPORTERS. Migrating would rewrite live legacy-report
// compatibility behavior; out of scope here and hard-constraint-protected
// (no business-semantics/weight-formula changes).
// eslint-disable-next-line no-restricted-imports
import {
  constructionWeights,
  testingWeights,
  handoverWeights,
  phaseWeights,
  statusScores,
} from "../config/reportWeights.js";

// eslint-disable-next-line no-restricted-imports
import {
  WP_STATUS_SCORES,
  WORK_PACKAGES,
  makeEmptyWPStatuses,
} from "../config/workPackages.js";

// ─── LEGACY FORMAT SUPPORT ────────────────────────────────────────────────────
// The functions below exist to handle the old report format where progress was
// stored as status strings (e.g. "In Progress", "Completed") in flat fields:
//   demolitionStatus, constructionStatuses, testingStatuses, handoverStatuses
//
// These functions MUST remain until all projects use the Gantt workPackageStatuses format.
// For new code, always use: import { calculateProjectProgressResult } from '../engines/progressEngine'
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @legacy — supports old weekly-report format (demolitionStatus / constructionStatuses / …)
 * Keep until all projects are migrated to Gantt workPackageStatuses format.
 * Do NOT call from new code. Use progressEngine.js → calculateProjectProgressResult() instead.
 * Not exported — used only internally in this file (no external importer found).
 */
const PHASE_ORDER = [
  "Demolition works",
  "Construction works",
  "Testing & Commissioning",
  "Handover",
];

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB");
}

/**
 * @legacy — supports old weekly-report format (demolitionStatus / constructionStatuses / …)
 * Keep until all projects are migrated to Gantt workPackageStatuses format.
 * Do NOT call from new code. Use progressEngine.js → calculateProjectProgressResult() instead.
 */
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

/**
 * @legacy — supports old weekly-report format (demolitionStatus / constructionStatuses / …)
 * Keep until all projects are migrated to Gantt workPackageStatuses format.
 * Do NOT call from new code. Use progressEngine.js → calculateProjectProgressResult() instead.
 */
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
 * Format-agnostic merge for workPackageStatuses.
 * Works for both old (workPackages.js task names) and Gantt (masterTaskLibrary labels).
 * Keeps the entry with the highest effective progress per task.
 */
function mergeGanttWPStatuses(snapshots) {
  const merged = {};
  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    for (const [phaseId, tasks] of Object.entries(snapshot)) {
      if (!merged[phaseId]) merged[phaseId] = {};
      for (const [taskName, entry] of Object.entries(tasks || {})) {
        if (!entry) continue;
        const effectivePct = e => {
          const raw = e?.progress;
          if (raw !== null && raw !== undefined && raw !== '') {
            const n = Number(raw);
            if (!Number.isNaN(n)) return n;
          }
          return (WP_STATUS_SCORES[e?.status] ?? 0) * 100;
        };
        const cur = merged[phaseId][taskName];
        if (!cur || effectivePct(entry) > effectivePct(cur)) {
          merged[phaseId][taskName] = entry;
        }
      }
    }
  }
  return merged;
}

/**
 * Reconciles one task's "currently selected report" entry against its
 * "cumulative up to that date" entry, keeping whichever has the higher
 * effective status score. Deliberately scores a missing/Not-Applicable
 * entry as -1 (worse than Not Started's 0) so an explicit Not Started
 * always wins over an absent/inapplicable comparison — NOT the same as
 * getWPStatusScore()'s `?? 0` fallback (that would make Not Applicable
 * indistinguishable from Not Started here and could flip the result).
 * Extracted verbatim from WeeklyReports.jsx (architecture-conformance pass).
 *
 * @param {{status?: string}|undefined} currentEntry
 * @param {{status?: string}|undefined} cumulativeEntry
 * @returns {object} whichever of the two entries wins
 */
export function pickReconciledStatusEntry(currentEntry, cumulativeEntry) {
  const e = currentEntry || {};
  const c = cumulativeEntry || {};
  const eScore = WP_STATUS_SCORES[e.status] ?? -1;
  const cScore = WP_STATUS_SCORES[c.status] ?? -1;
  return cScore >= eScore ? (c.status ? c : e) : (e.status ? e : c);
}

/**
 * Builds the cumulative best WP statuses across all of a project's reports,
 * used ONLY to prefill a new contractor report form's starting state
 * (ContractorReport.jsx's makeInitialForm) — NOT the same question as
 * computeWPCumulativeStatuses() below (which drives the read-only progress
 * DISPLAY on WeeklyReports.jsx). Deliberately kept as its own function
 * rather than merged into computeWPCumulativeStatuses/mergeGanttWPStatuses:
 * this one prefers whichever entry looks most advanced by EITHER status OR
 * numeric progress (an "OR" comparator, generous for a form starting
 * point), while mergeGanttWPStatuses compares a single combined
 * effectivePct per entry (accurate for display) — forcing them into one
 * algorithm would change one of the two behaviors.
 * Moved from components/contractor/formHelpers.js (architecture-conformance
 * pass); its local `_WP_SCORES` duplicate of WP_STATUS_SCORES was dropped
 * in favor of the canonical map already imported by this file.
 */
export function buildCumulativeWPStatuses(allReports) {
  const base = makeEmptyWPStatuses();
  for (const report of allReports) {
    const snap = report.workPackageStatuses;
    if (!snap) continue;
    for (const wp of WORK_PACKAGES) {
      const pkgSnap = snap[wp.id] || {};
      for (const task of wp.tasks) {
        const s = pkgSnap[task.name];
        if (!s) continue;
        const cur = base[wp.id][task.name];
        if ((WP_STATUS_SCORES[s.status] ?? -1) > (WP_STATUS_SCORES[cur.status] ?? -1) ||
            (s.progress || 0) > (cur.progress || 0)) {
          base[wp.id][task.name] = { ...cur, ...s };
        }
      }
    }
  }
  return base;
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
  // Use format-agnostic merge (works for both Gantt and old WP formats)
  const merged = mergeGanttWPStatuses(snapshots);
  const latest = sorted[sorted.length - 1];

  return {
    workPackageStatuses: merged,
    projectScheduleStatus: latest?.projectScheduleStatus,
    currentPhase: latest?.currentPhase || latest?.currentPhases?.[0],
  };
}

/**
 * @legacy — supports old weekly-report format (demolitionStatus / constructionStatuses / …)
 * Keep until all projects are migrated to Gantt workPackageStatuses format.
 * Do NOT call from new code. Use progressEngine.js → calculateProjectProgressResult() instead.
 */
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

// Single source of truth for the projectScheduleStatus/pmScheduleAssessment
// vocabulary — every raw "'At Risk'"-style literal comparison elsewhere in
// the app should import these instead of hardcoding the string.
export const SCHEDULE_STATUS = Object.freeze({
  ON_TRACK: "On Track",
  AT_RISK:  "At Risk",
  DELAYED:  "Delayed",
  CRITICAL: "Critical",
});

export function isBadScheduleStatus(status) {
  return status === SCHEDULE_STATUS.AT_RISK || status === SCHEDULE_STATUS.DELAYED || status === SCHEDULE_STATUS.CRITICAL;
}
export function isSevereScheduleStatus(status) {
  return status === SCHEDULE_STATUS.DELAYED || status === SCHEDULE_STATUS.CRITICAL;
}

// ─── Report freshness helpers ─────────────────────────────────────────────────

export function daysSince(dateStr, referenceDate = new Date()) {
  return Math.floor((new Date(referenceDate).getTime() - new Date(dateStr).getTime()) / DAY_MS);
}

export function daysUntil(dateStr, referenceDate = new Date()) {
  return Math.ceil((new Date(dateStr).getTime() - new Date(referenceDate).getTime()) / DAY_MS);
}

export function isMissingReport(latestReport, referenceDate = new Date()) {
  if (!latestReport) return true;
  return daysSince(latestReport.reportingDate || latestReport.submittedAt, referenceDate) > 7;
}

