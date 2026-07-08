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

/**
 * Fetch canonical contractor reports and adapt them for legacy-shaped screens.
 */
export async function getAllReportsForScreens() {
  const { reports, wps, projects } = await fetchAllContractorReportsRaw();

  const wpsByReportId = groupWpsByReportId(wps);
  const templateTypeByProjectId = {};
  for (const p of projects) templateTypeByProjectId[p.id] = p.template_type;

  return validateArray(
    ContractorReportSchema,
    adaptContractorReportsToLegacy(reports, wpsByReportId, templateTypeByProjectId),
    'contractor_reports'
  );
}

export async function getReportsForProjectForScreens(projectId) {
  const { reports, wps, templateType } = await fetchContractorReportsForProjectRaw(projectId);
  if (reports.length === 0) return [];

  const wpsByReportId = groupWpsByReportId(wps);

  return validateArray(
    ContractorReportSchema,
    adaptContractorReportsToLegacy(reports, wpsByReportId, { [projectId]: templateType }),
    'contractor_reports'
  );
}
