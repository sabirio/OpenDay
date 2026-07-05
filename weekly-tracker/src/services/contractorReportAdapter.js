/**
 * Adapts contractor_reports + contractor_report_wps rows to the legacy report
 * shape consumed by screens that have not been migrated yet.
 */

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

function buildWorkPackageStatuses(wps) {
  return (wps || []).reduce((acc, wp) => {
    const wpId = wp.wp_id;
    if (!wpId) return acc;

    const label = wp.wp_label || wp.label || wp.name || wpId;
    if (!acc[wpId]) acc[wpId] = {};
    acc[wpId][label] = {
      status: toLegacyStatus(wp.status),
      progress: wp.progress_pct ?? 0,
      comment: wp.comment || "",
    };
    return acc;
  }, {});
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
    currentPhases: [],
    sourceTable: "contractor_reports",
  };
}

export function adaptContractorReportsToLegacy(reports, wpsByReportId = {}) {
  return (reports || [])
    .map((report) => adaptContractorReportToLegacy(report, wpsByReportId[report.id] || []))
    .filter(Boolean);
}
