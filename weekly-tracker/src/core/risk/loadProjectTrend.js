import { computeProjectTrendPoints } from '../../engines/spiEngine.js';
import { fetchProjectTrendInputs } from '../../services/ganttService.js';

export async function loadProjectTrend(projectId, weeksBack = 8) {
  const { reports, tasks } = await fetchProjectTrendInputs(projectId, weeksBack);
  return computeProjectTrendPoints(reports, tasks);
}
