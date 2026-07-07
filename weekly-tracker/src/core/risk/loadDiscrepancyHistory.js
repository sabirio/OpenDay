import { getDiscrepancyHistory } from '../../services/dashboardService.js';

export async function loadDiscrepancyHistory(projectId, limit = 20) {
  return getDiscrepancyHistory(projectId, limit);
}
