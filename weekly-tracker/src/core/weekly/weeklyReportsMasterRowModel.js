import { currentISOWeek } from '../../utils/scheduleUtils';
import { formatDate } from '../../utils/reportUtils';

// Shared by the master-row builder (always the latest report) and the
// WeeklyReports detail header (whichever report the Report Date selector
// currently has open) so the week-label/status/attention presentation logic
// exists in exactly one place — only the report/isMissing inputs differ.
export function describeReportContext(report, isMissing) {
  const reportDate = report?.reportingDate || report?.submittedAt;
  const isoWeek = reportDate ? currentISOWeek(new Date(reportDate)) : null;
  const weekLabel = isoWeek ? `Week ${Number(isoWeek.slice(-2))}` : "Date unavailable";
  const attentionLabel = [
    report?.activitiesBlocked === "Yes" ? "Blocked" : null,
    report?.supportRequired === "Yes" ? "Support" : null,
    report?.riskScale ? `Risk ${report.riskScale}` : null,
  ].filter(Boolean).join(" · ");

  return {
    status: isMissing ? "missing" : "submitted",
    statusLabel: isMissing ? "Missing" : "Submitted",
    reportingContext: [weekLabel, reportDate ? formatDate(reportDate) : null].filter(Boolean).join(" · "),
    attentionLabel: attentionLabel || null,
  };
}

// One master row per project — never per report. The Weekly Reports master
// pane is a project list; a project's row always summarizes its latest
// report (contractorReports is reversed to newest-first here). Historical
// reports remain reachable only via the detail pane's Report Date selector,
// not as separate master entries.
export function buildWeeklyReportsMasterRows(allRows) {
  return allRows.map((row) => {
    const project = row.canonical?.snapshot?.project ?? row.project;
    const canonicalReports = [...(row.canonical?.snapshot?.contractorReports ?? [])].reverse();
    const projectCode = project?.storeCode ?? "";
    const projectName = project?.shoppingMallName ?? "";

    if (canonicalReports.length === 0) {
      return {
        key: String(project.id),
        projectId: String(project.id),
        reportId: "",
        projectCode,
        projectName,
        status: "missing",
        statusLabel: "Missing",
        reportingContext: "No contractor report",
        attentionLabel: null,
      };
    }

    const latestReport = canonicalReports[0];
    const summary = describeReportContext(latestReport, row.missingReport);

    return {
      key: String(project.id),
      projectId: String(project.id),
      reportId: String(latestReport.id),
      projectCode,
      projectName,
      ...summary,
    };
  });
}
