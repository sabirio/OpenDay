import { listProjectSnags } from '../../services/snags/snagService.js';
import { computeContractorWorkspaceRows } from '../../engines/contractorWorkspaceEngine.js';

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
 * contractorWorkspaceEngine for the actual computation/sort. `projects` must
 * already be scoped to this contractor (assigned_projects) by the caller.
 */
export async function loadContractorWorkspaceRows(projects, reports, actor) {
  const reportsByProjectId = groupReportsByProjectId(reports);
  const snagLists = await Promise.all(
    projects.map(project => listProjectSnags(project.id).catch(() => []))
  );
  const snagsByProjectId = {};
  projects.forEach((project, i) => { snagsByProjectId[project.id] = snagLists[i]; });

  return computeContractorWorkspaceRows(projects, reportsByProjectId, snagsByProjectId, actor);
}
