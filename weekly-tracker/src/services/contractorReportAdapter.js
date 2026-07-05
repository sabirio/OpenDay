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
      progress: wp.progress_pct ?? 0,
      comment: wp.comment || "",
    };
    return acc;
  }, {});
}

// Human-readable phase names actually reported on, for the "Current Phase" column.
function deriveCurrentPhases(wps) {
  const phaseIds = new Set();
  for (const wp of (wps || [])) {
    const meta = getWPById(wp.wp_id);
    if (meta?.phaseId) phaseIds.add(meta.phaseId);
  }
  return [...phaseIds].map(id => getPhaseById(id)?.label).filter(Boolean);
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
    overallProgress: contractorReport.overall_progress ?? 0,
    submittedBy: contractorReport.submitted_by || null,
    projectScheduleStatus: contractorReport.project_schedule_status || "On Track",
    workPackageStatuses: buildWorkPackageStatuses(wps),
    photos: [],
    risks: [],
    riskOwners: [],
    supportTypes: [],
    currentPackages: [],
    currentPhases: deriveCurrentPhases(wps),
    sourceTable: "contractor_reports",
  };
}

export function adaptContractorReportsToLegacy(reports, wpsByReportId = {}) {
  return (reports || [])
    .map((report) => adaptContractorReportToLegacy(report, wpsByReportId[report.id] || []))
    .filter(Boolean);
}
