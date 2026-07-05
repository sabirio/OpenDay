import { useMemo } from 'react';
import { evaluateProjectState } from '../core/opendayEngine/evaluateProjectState.js';
import { PROJECT_COLORS } from '../config/dashboardConstants';

/**
 * Shared allRows computation — thin React wrapper around evaluateProjectState
 * (src/core/opendayEngine), plus projSiteVisits stored per row (needed for
 * getCommands) and a UI-only color assigned by list position.
 *
 * @param {Array} projects
 * @param {Array} reports
 * @param {Array} siteVisits
 * @param {Object} templatesById — { [templateId]: template } from fetchAllTemplates()
 * @param {Object|null} activeTemplateFallback — the org's is_active=true template
 */
export function useAllRows(projects, reports, siteVisits = [], templatesById = {}, activeTemplateFallback = null) {
  return useMemo(() => projects.map((project, idx) => {
    const projReports    = reports.filter(r => r.projectId === project.id);
    const projSiteVisits = siteVisits.filter(sv => String(sv.projectId) === String(project.id));
    const state = evaluateProjectState(project, projReports, projSiteVisits, { templatesById, activeTemplateFallback });
    return { ...state, color: PROJECT_COLORS[idx % PROJECT_COLORS.length] };
  }), [projects, reports, siteVisits, templatesById, activeTemplateFallback]);
}
