import { listProjectSnags } from '../../services/snags/snagService.js';
import { buildContractorWorkspaceSummary, computeContractorWorkspaceRows } from '../../engines/contractorWorkspaceEngine.js';
import { loadScheduleCommitmentProjection } from '../contractorSchedule/loadScheduleCommitmentProjection.js';
export { CONTRACTOR_WORKSPACE_FILTERS, filterContractorWorkspaceRows, rowNeedsAttention } from '../../engines/contractorWorkspaceEngine.js';

function groupReportsByProjectId(reports) {
  const map = {};
  for (const report of reports) {
    const key = report.projectId;
    if (!map[key]) map[key] = [];
    map[key].push(report);
  }
  return map;
}

/**
 * Thin I/O + composition wrapper for the Contractor Workspace ("My Work")
 * page — fetches each assigned project's snags (no portfolio-wide snag feed
 * exists yet, so this loops the same per-project listProjectSnags() the PM
 * Field Snag pages already use) and hands everything to the pure
 * contractorWorkspaceEngine for the actual computation/sort/summary.
 * `projects` must already be scoped to this contractor (assigned_projects) by
 * the caller — the summary is built from the same rows, so it can never see
 * more than that scope either.
 *
 * Phase 3D.1: also fetches the live schedule commitment projection (ONE
 * bounded batch query for this contractor's assigned project set, via the
 * same canonical loadScheduleCommitmentProjection.js Dashboard uses — never
 * a second, independently-derived lifecycle mapping) so an Approved
 * Baseline is reflected here too, not just the conservative default.
 * @returns {{ rows: Array, summary: object }}
 */
export async function loadContractorWorkspaceRows(projects, reports, actor) {
  const reportsByProjectId = groupReportsByProjectId(reports);
  const [snagLists, scheduleCommitmentProjection] = await Promise.all([
    Promise.all(projects.map(project => listProjectSnags(project.id).catch(() => []))),
    loadScheduleCommitmentProjection(projects).catch(() => new Map()),
  ]);
  const snagsByProjectId = {};
  projects.forEach((project, i) => { snagsByProjectId[project.id] = snagLists[i]; });

  const rows = computeContractorWorkspaceRows(projects, reportsByProjectId, snagsByProjectId, actor, new Date(), scheduleCommitmentProjection);
  return { rows, summary: buildContractorWorkspaceSummary(rows) };
}
