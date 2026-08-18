import { adaptContractorReportsToLegacy } from './adaptContractorReportToLegacy.js';
import { ContractorReportSchema } from '../../schemas/contractorReportSchema';
import { validateArray } from '../../schemas/validate';
import { fetchAllContractorReportsRaw, fetchContractorReportsForProjectRaw } from '../../services/contractorReportService';

function groupWpsByReportId(wps) {
  const map = {};
  for (const wp of wps || []) {
    if (!map[wp.report_id]) map[wp.report_id] = [];
    map[wp.report_id].push(wp);
  }
  return map;
}

function groupRiskWorkGroupIdsByReportId(links) {
  const map = {};
  for (const link of links || []) {
    if (!map[link.report_id]) map[link.report_id] = [];
    map[link.report_id].push(link.work_group_id);
  }
  return map;
}

/**
 * Fetch canonical contractor reports and adapt them for legacy-shaped screens.
 */
export async function getAllReportsForScreens() {
  const { reports, wps, riskWorkGroups, projects } = await fetchAllContractorReportsRaw();

  const wpsByReportId = groupWpsByReportId(wps);
  const riskWorkGroupIdsByReportId = groupRiskWorkGroupIdsByReportId(riskWorkGroups);
  const projectById = {};
  for (const p of projects) projectById[p.id] = p;

  return validateArray(
    ContractorReportSchema,
    adaptContractorReportsToLegacy(reports, wpsByReportId, projectById, riskWorkGroupIdsByReportId),
    'contractor_reports'
  );
}

export async function getReportsForProjectForScreens(projectId) {
  const { reports, wps, riskWorkGroups, project } = await fetchContractorReportsForProjectRaw(projectId);
  if (reports.length === 0) return [];

  const wpsByReportId = groupWpsByReportId(wps);
  const riskWorkGroupIdsByReportId = groupRiskWorkGroupIdsByReportId(riskWorkGroups);

  return validateArray(
    ContractorReportSchema,
    adaptContractorReportsToLegacy(reports, wpsByReportId, { [projectId]: project }, riskWorkGroupIdsByReportId),
    'contractor_reports'
  );
}
