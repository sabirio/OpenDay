import { getById as getProjectById } from '../../services/projectService';

/**
 * Fallback project fetch for the Contractor Schedule page — mirrors
 * contractorReportContextModel.js's loadContractorReportFallbackContext:
 * only fetches when the caller doesn't already have the project from its
 * pre-loaded (RLS-scoped) `projects` prop. An unauthorized or nonexistent
 * project id both resolve via the same underlying getById() rejection —
 * see ContractorSchedule.jsx for why that convergence is deliberate.
 */
export async function loadContractorScheduleProjectFallback(projectId, { hasProject }) {
  if (hasProject) return null;
  return getProjectById(projectId);
}
