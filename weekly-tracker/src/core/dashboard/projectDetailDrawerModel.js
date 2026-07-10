import { runOpenDayOrchestrator } from '../canonical/index.js';
import { isTemplateValid } from '../projects/index.js';

export function buildProjectDetailDrawerModel(row, projSiteVisits) {
  if (!row) return null;
  if (row.canonical?.compatibility?.projectSummary) {
    return row.canonical.compatibility.projectSummary;
  }
  const { templatesById = {}, activeTemplateFallback = null } = row.orchestrationOptions || {};
  const candidateTemplate = row.project?.templateId
    ? (templatesById[row.project.templateId] ?? activeTemplateFallback)
    : activeTemplateFallback;
  const template = candidateTemplate && isTemplateValid(candidateTemplate) ? candidateTemplate : null;
  const result = runOpenDayOrchestrator({
    project: row.project,
    contractorReports: row.projReports,
    siteVisits: projSiteVisits,
    progressHistory: row.project?.progressHistory,
    template,
  }, row.orchestrationOptions);
  return result.compatibility.projectSummary;
}
