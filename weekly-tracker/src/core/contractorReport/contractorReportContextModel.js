import { getById as getProjectById } from '../../services/projectService';
import { getReportsForProjectForScreens } from '../../services/contractorReportService';
import { getProjectGantt } from '../../services/ganttService';

/**
 * Conditionally fetch the project/reports the page doesn't already have as
 * props (mirrors the previous inline Promise.all in ContractorReport.jsx —
 * only the caller knows which of the two it's missing).
 */
export async function loadContractorReportFallbackContext(projectId, { hasProject, hasReports }) {
  const [loadedProject, loadedReports] = await Promise.all([
    hasProject ? Promise.resolve(null) : getProjectById(projectId),
    hasReports ? Promise.resolve(null) : getReportsForProjectForScreens(projectId),
  ]);
  return { loadedProject, loadedReports };
}

/**
 * Gantt WP tasks for the contractor report form, narrowed to the project's
 * configured scope (unscoped projects see everything).
 */
export async function loadContractorGanttTasks(projectId, activeWPIds) {
  const rawTasks = await getProjectGantt(projectId);
  return activeWPIds ? (rawTasks || []).filter(t => activeWPIds.includes(t.id)) : (rawTasks || []);
}
