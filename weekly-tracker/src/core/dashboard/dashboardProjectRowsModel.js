import { runOpenDayOrchestrator } from '../canonical/index.js';
import { PROJECT_COLORS } from '../../config/dashboardConstants.js';

export function buildCanonicalProjectRows({ projects = [], reports = [], siteVisits = [], templatesById = {}, activeTemplateFallback = null, calculatedAt }) {
  return projects.map((project, idx) => {
    const projReports = reports.filter(report => String(report.projectId) === String(project.id));
    const projSiteVisits = siteVisits.filter(visit => String(visit.projectId) === String(project.id));
    const candidateTemplate = project?.templateId
      ? (templatesById[project.templateId] ?? activeTemplateFallback)
      : activeTemplateFallback;
    const result = runOpenDayOrchestrator({
      project,
      contractorReports: projReports,
      siteVisits: projSiteVisits,
      progressHistory: project.progressHistory,
      template: candidateTemplate,
    }, { templatesById, activeTemplateFallback, calculatedAt });
    return {
      ...result.compatibility.legacyState,
      progress: result.progress.overallProgress,
      canonical: result,
      calculatedAt: result.calculatedAt,
      orchestrationOptions: { templatesById, activeTemplateFallback },
      color: PROJECT_COLORS[idx % PROJECT_COLORS.length],
    };
  });
}
