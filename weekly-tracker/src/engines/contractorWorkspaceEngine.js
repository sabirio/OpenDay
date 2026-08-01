import { daysSince, daysUntil } from '../utils/reportUtils.js';
import { getAvailableSnagActions } from '../core/snags/workflow.js';
import { deriveDueState } from './snagReadModelEngine.js';
import { deriveReportDueState, REPORT_DUE_STATE } from './reportDueStateEngine.js';
import { deriveScheduleCommitmentState } from '../core/schedule/scheduleCommitmentState.js';

// "My Work" for a contractor is deliberately NOT the PM risk/readiness/priority
// engine (openingReadinessEngine.js / riskEngine.js / actionEngine.js) — those
// compute PM-facing schedule risk, which is out of scope for what a contractor
// should see about their own work. This engine only composes contractor-facing
// facts that already exist: report recency (reportUtils, same functions
// evaluateProjectState.js uses for missingReport/daysSinceReport), snag
// actionability (core/snags/workflow.js's own getAvailableSnagActions — the
// single canonical rule for "can this contractor act on this snag right now",
// already used to gate the Snag Detail page's UI), and snag due-state
// (snagReadModelEngine.js's deriveDueState — the same rule that powers the
// PM Site Snag overview's "Overdue Observations" metric).
function latestReportOf(projectReports) {
  const sorted = [...projectReports].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  );
  return sorted[sorted.length - 1] || null;
}

// Single pass over a project's snags: counts how many are currently
// actionable by this contractor, and — of those — how many are also
// OVERDUE per the canonical due-state rule. A closed/cancelled snag is never
// actionable (getAvailableSnagActions returns []) so it's excluded from both
// counts automatically; a snag with no dueDate can never be OVERDUE
// (deriveDueState returns NO_DUE_DATE), so it's never counted as overdue.
function summarizeSnagsForActor(snags, actor, referenceDate) {
  return snags.reduce((acc, snag) => {
    if (getAvailableSnagActions(snag, actor).length === 0) return acc;
    acc.actionableCount += 1;
    if (deriveDueState(snag, referenceDate) === 'OVERDUE') acc.overdueCount += 1;
    return acc;
  }, { actionableCount: 0, overdueCount: 0 });
}

/**
 * @param {Array} projects - the contractor's own assigned projects
 * @param {Object} reportsByProjectId - { [projectId]: Array<report> }
 * @param {Object} snagsByProjectId - { [projectId]: Array<snag> }
 * @param {{ id: string, role: string }} actor
 * @param {Date} [referenceDate]
 * @returns {Array} rows sorted by contractor-actionable urgency: projects with
 *   overdue actionable snags first, then missing/overdue report, then most
 *   actionable snags, then nearest opening date.
 */
export function computeContractorWorkspaceRows(projects, reportsByProjectId, snagsByProjectId, actor, referenceDate = new Date()) {
  const rows = projects.map(project => {
    const projectReports = reportsByProjectId[project.id] || [];
    const projectSnags = snagsByProjectId[project.id] || [];
    const latestReport = latestReportOf(projectReports);
    // Phase 3D.1: no lifecycle-status/commitment-timestamp fetch is wired
    // into this bulk contractor view yet — scheduleOwnershipMode alone
    // (already on the project row) is enough to keep AUTO_GENERATED
    // projects byte-identical and to stop a fresh CONTRACTOR_MANAGED
    // project's report obligation from being fabricated before any
    // commitment exists (the conservative default is NOT_YET_COMMITTED,
    // never falsely COMMITTED).
    const scheduleOwnershipMode = project?.scheduleOwnershipMode ?? null;
    const commitmentState = deriveScheduleCommitmentState({ scheduleOwnershipMode });
    const reportDueState = deriveReportDueState({ scheduleOwnershipMode, commitmentState, latestReport, referenceDate });
    const missingReport = reportDueState === REPORT_DUE_STATE.OVERDUE;
    const daysSinceReport = latestReport
      ? daysSince(latestReport.reportingDate || latestReport.submittedAt, referenceDate)
      : null;
    const daysToOpening = project.targetOpeningDate ? daysUntil(project.targetOpeningDate, referenceDate) : null;
    const { actionableCount, overdueCount } = summarizeSnagsForActor(projectSnags, actor, referenceDate);
    return {
      project, latestReport, missingReport, daysSinceReport, daysToOpening,
      actionableSnagCount: actionableCount, overdueSnagCount: overdueCount,
      reportDueState,
    };
  });

  return rows.sort((a, b) => {
    const aOverdue = a.overdueSnagCount > 0, bOverdue = b.overdueSnagCount > 0;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (a.missingReport !== b.missingReport) return a.missingReport ? -1 : 1;
    if (a.actionableSnagCount !== b.actionableSnagCount) return b.actionableSnagCount - a.actionableSnagCount;
    const aOpen = a.daysToOpening ?? Infinity;
    const bOpen = b.daysToOpening ?? Infinity;
    return aOpen - bOpen;
  });
}

/**
 * Pure projection over already-scoped, already-computed workspace rows — no
 * I/O, no re-scoping. Must only ever be called with rows already limited to
 * a contractor's assigned_projects; it has no way to see (and therefore
 * cannot leak) any other project's data.
 * @param {Array} rows - result of computeContractorWorkspaceRows()
 */
export function buildContractorWorkspaceSummary(rows) {
  return rows.reduce((summary, row) => ({
    projectCount: summary.projectCount + 1,
    reportsNeedingActionCount: summary.reportsNeedingActionCount + (row.missingReport ? 1 : 0),
    openObservationsCount: summary.openObservationsCount + row.actionableSnagCount,
    overdueObservationsCount: summary.overdueObservationsCount + row.overdueSnagCount,
  }), { projectCount: 0, reportsNeedingActionCount: 0, openObservationsCount: 0, overdueObservationsCount: 0 });
}

export const CONTRACTOR_WORKSPACE_FILTERS = Object.freeze({
  ALL: 'all',
  REPORTS: 'reports',
  OBSERVATIONS: 'observations',
  OVERDUE: 'overdue',
});

/**
 * Filters already-scoped, already-computed rows by the same flags the
 * summary counts are built from — a project-level filter (does this project
 * have overdue/actionable work), not a per-observation expansion. Never
 * re-scopes or re-fetches; operates purely on the rows it's given.
 * @param {Array} rows - result of computeContractorWorkspaceRows()
 * @param {string} filter - one of CONTRACTOR_WORKSPACE_FILTERS
 */
export function filterContractorWorkspaceRows(rows, filter) {
  if (filter === CONTRACTOR_WORKSPACE_FILTERS.REPORTS) return rows.filter(row => row.missingReport);
  if (filter === CONTRACTOR_WORKSPACE_FILTERS.OBSERVATIONS) return rows.filter(row => row.actionableSnagCount > 0);
  if (filter === CONTRACTOR_WORKSPACE_FILTERS.OVERDUE) return rows.filter(row => row.overdueSnagCount > 0);
  return rows;
}

/**
 * A project "needs attention" if it has any overdue/actionable observation
 * or a report that requires action — the same flags the sort and the
 * summary already use, so this can never disagree with either.
 * @param {object} row
 */
export function rowNeedsAttention(row) {
  return row.missingReport || row.actionableSnagCount > 0;
}
