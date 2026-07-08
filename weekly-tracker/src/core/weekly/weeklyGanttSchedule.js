import { getProjectGantt, updateWPDates } from '../../services/ganttService.js';

export async function loadWeeklyGanttTasks(projectId) {
  if (!projectId) return [];
  return (await getProjectGantt(projectId)) || [];
}

export async function saveWeeklyGanttDates(projectId, wpId, dates) {
  if (!projectId || !wpId) return;
  await updateWPDates(projectId, wpId, dates);
}
