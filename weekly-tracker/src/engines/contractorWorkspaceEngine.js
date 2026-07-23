import { daysSince, daysUntil, isMissingReport } from '../utils/reportUtils.js';
import { getAvailableSnagActions } from '../core/snags/workflow.js';

// "My Work" for a contractor is deliberately NOT the PM risk/readiness/priority
// engine (openingReadinessEngine.js / riskEngine.js / actionEngine.js) — those
// compute PM-facing schedule risk, which is out of scope for what a contractor
// should see about their own work. This engine only composes contractor-facing
// facts that already exist: report recency (reportUtils, same functions
// evaluateProjectState.js uses for missingReport/daysSinceReport) and snag
// actionability (core/snags/workflow.js's own getAvailableSnagActions — the
// single canonical rule for "can this contractor act on this snag right now",
// already used to gate the Snag Detail page's UI).
function latestReportOf(projectReports) {
  const sorted = [...projectReports].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  );
  return sorted[sorted.length - 1] || null;
}

function countActionableSnags(snags, actor) {
  return snags.filter(snag => getAvailableSnagActions(snag, actor).length > 0).length;
}

/**
 * @param {Array} projects - the contractor's own assigned projects
 * @param {Object} reportsByProjectId - { [projectId]: Array<report> }
 * @param {Object} snagsByProjectId - { [projectId]: Array<snag> }
 * @param {{ id: string, role: string }} actor
 * @param {Date} [referenceDate]
 * @returns {Array} rows sorted by contractor-actionable urgency: overdue/missing
 *   report first, then most actionable snags, then nearest opening date.
 */
export function computeContractorWorkspaceRows(projects, reportsByProjectId, snagsByProjectId, actor, referenceDate = new Date()) {
  const rows = projects.map(project => {
    const projectReports = reportsByProjectId[project.id] || [];
    const projectSnags = snagsByProjectId[project.id] || [];
    const latestReport = latestReportOf(projectReports);
    const missingReport = isMissingReport(latestReport, referenceDate);
    const daysSinceReport = latestReport
      ? daysSince(latestReport.reportingDate || latestReport.submittedAt, referenceDate)
      : null;
    const daysToOpening = project.targetOpeningDate ? daysUntil(project.targetOpeningDate, referenceDate) : null;
    const actionableSnagCount = countActionableSnags(projectSnags, actor);
    return { project, latestReport, missingReport, daysSinceReport, daysToOpening, actionableSnagCount };
  });

  return rows.sort((a, b) => {
    if (a.missingReport !== b.missingReport) return a.missingReport ? -1 : 1;
    if (a.actionableSnagCount !== b.actionableSnagCount) return b.actionableSnagCount - a.actionableSnagCount;
    const aOpen = a.daysToOpening ?? Infinity;
    const bOpen = b.daysToOpening ?? Infinity;
    return aOpen - bOpen;
  });
}
