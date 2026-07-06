/**
 * Adapts contractor_reports + contractor_report_wps rows to the legacy report
 * shape consumed by screens that have not been migrated yet.
 */

import { getWPById, getPhaseById } from '../config/masterTaskLibrary.js';

const STATUS_TO_LEGACY = {
  completed: "Completed",
  in_progress: "In Progress",
  delayed: "In Progress",
  blocked: "In Progress",
  not_started: "Not Started",
};

function toLegacyStatus(status) {
  return STATUS_TO_LEGACY[status] || "Not Started";
}

// Defensive numeric coercion at the adapter boundary (P1.3): contractor_reports
// .overall_progress and contractor_report_wps.progress_pct are Postgres numeric
// columns, but a corrupted/legacy row can still surface as a non-numeric string,
// NaN, or an out-of-range value. `?? 0` alone only catches null/undefined — a
// bad-but-non-null value would flow through unchanged into workPackageStatuses,
// fail ContractorReportSchema's z.number() check downstream, and silently drop
// the ENTIRE report from the reports list (one bad WP row disappearing a whole
// report is worse than clamping that one value). Clamp here instead, once, at
// the boundary where raw DB rows become the shape engines consume.
function toFiniteProgress(value, label) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    if (value != null) console.warn(`[contractorReportAdapter] non-numeric ${label}:`, value);
    return 0;
  }
  return Math.min(100, Math.max(0, n));
}

// contractor_report_wps.wp_id stores the fine-grained work-package id (e.g.
// "walls.framing") from the shared masterTaskLibrary — NOT a phase id, and the
// table has no wp_label/phase_id columns of its own. The legacy shape consumed
// by progressEngine.calculatePhaseProgress() is keyed [phaseId][taskLabel], so
// both must be resolved from the static library here.
function buildWorkPackageStatuses(wps) {
  return (wps || []).reduce((acc, wp) => {
    const meta    = getWPById(wp.wp_id);
    const phaseId = meta?.phaseId || wp.wp_id;
    const label   = meta?.label   || wp.wp_id;
    if (!phaseId) return acc;

    if (!acc[phaseId]) acc[phaseId] = {};
    acc[phaseId][label] = {
      status: toLegacyStatus(wp.status),
      progress: toFiniteProgress(wp.progress_pct, `contractor_report_wps.progress_pct (wp_id=${wp.wp_id})`),
      comment: wp.comment || "",
    };
    return acc;
  }, {});
}

// Furthest-along phase with actual progress, for the "Current Phase" column —
// not every phase ever touched, just where the contractor stands right now.
function deriveCurrentPhases(wps) {
  let furthest = null;
  for (const wp of (wps || [])) {
    const hasProgress = (wp.progress_pct ?? 0) > 0 || (wp.status && wp.status !== 'not_started');
    if (!hasProgress) continue;
    const meta = getWPById(wp.wp_id);
    const phase = meta?.phaseId ? getPhaseById(meta.phaseId) : null;
    if (!phase) continue;
    if (!furthest || phase.order > furthest.order) furthest = phase;
  }
  return furthest ? [furthest.label] : [];
}

function normalizePhotos(photoUrls) {
  if (!Array.isArray(photoUrls)) return [];
  return photoUrls.filter((photo) => typeof photo === 'string' && photo.trim().length > 0);
}

export function adaptContractorReportToLegacy(contractorReport, wps = []) {
  if (!contractorReport) return null;

  const reportingDate = contractorReport.report_date || contractorReport.submitted_at;

  return {
    id: contractorReport.id,
    projectId: contractorReport.project_id,
    submittedAt: contractorReport.submitted_at || contractorReport.created_at || reportingDate,
    reportingDate,
    weekNumber: contractorReport.week_number ?? null,
    overallProgress: toFiniteProgress(contractorReport.overall_progress, `contractor_reports.overall_progress (id=${contractorReport.id})`),
    submittedBy: contractorReport.submitted_by || null,
    projectScheduleStatus: contractorReport.project_schedule_status || "On Track",
    workPackageStatuses: buildWorkPackageStatuses(wps),
    photos: normalizePhotos(contractorReport.photo_urls),
    risks: [],
    riskOwners: [],
    supportTypes: [],
    currentPackages: [],
    currentPhases: deriveCurrentPhases(wps),
    // 023: these 6 columns didn't exist on contractor_reports before — the RPC
    // silently dropped them into progress_history.snapshot's opaque JSONB blob,
    // so Weekly Reports' Look Ahead/Declaration panels always showed empty.
    nextWeekTop3: contractorReport.next_week_top3 || "",
    weekAfterTop3: contractorReport.week_after_top3 || "",
    activitiesBlocked: contractorReport.activities_blocked || "No",
    delayReason: contractorReport.delay_reason || "",
    pendingIssues: contractorReport.pending_issues || "",
    finalComments: contractorReport.final_comments || "",
    sourceTable: "contractor_reports",
  };
}

export function adaptContractorReportsToLegacy(reports, wpsByReportId = {}) {
  return (reports || [])
    .map((report) => adaptContractorReportToLegacy(report, wpsByReportId[report.id] || []))
    .filter(Boolean);
}
