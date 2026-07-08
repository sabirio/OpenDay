import { computeProjectSummary } from '../../engines/projectSummaryEngine.js';

export function buildProjectDetailDrawerModel(row, projSiteVisits) {
  if (!row) return null;
  const { project, progress, projReports, wpCumulativeStatuses } = row;
  return computeProjectSummary(project, projReports, projSiteVisits, progress, wpCumulativeStatuses);
}
