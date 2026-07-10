import { useMemo } from 'react';
import { buildCanonicalProjectRows } from '../core/dashboard/dashboardProjectRowsModel.js';

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
  return useMemo(() => {
    const calculatedAt = new Date().toISOString();
    return buildCanonicalProjectRows({ projects, reports, siteVisits, templatesById, activeTemplateFallback, calculatedAt });
  }, [projects, reports, siteVisits, templatesById, activeTemplateFallback]);
}
