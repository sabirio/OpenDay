import { getLastReport } from '../../services/contractorReportService';

/** Most recent contractor report for a project — used to auto-link a new site visit. */
export async function getLastContractorReport(projectId) {
  return getLastReport(projectId);
}
