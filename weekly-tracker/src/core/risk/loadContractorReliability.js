import { computeContractorReliability } from '../../engines/reliabilityEngine.js';
import { fetchContractorReliabilityRecords } from '../../services/dashboardService.js';

export async function loadContractorReliability(projectIds) {
  if (!projectIds || projectIds.length === 0) return new Map();
  const records = await fetchContractorReliabilityRecords(projectIds);
  return computeContractorReliability(projectIds, records);
}
