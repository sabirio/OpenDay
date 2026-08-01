import { useMemo } from 'react';
import { buildCanonicalProjectRows } from '../core/dashboard/dashboardProjectRowsModel.js';
import { useScheduleCommitmentProjection } from './useScheduleCommitmentProjection.js';

/**
 * Shared allRows computation — thin React wrapper around evaluateProjectState
 * (src/core/opendayEngine), plus projSiteVisits stored per row (needed for
 * getCommands) and a UI-only color assigned by list position.
 *
 * Phase 3D.1: also fetches the live schedule commitment projection (one
 * bounded batch query, not one per project — see
 * useScheduleCommitmentProjection.js) so a real Approved Baseline is
 * reflected in readiness/risk/health/report-due state, not just the
 * conservative "not yet committed" default.
 *
 * @param {Array} projects
 * @param {Array} reports
 * @param {Array} siteVisits
 * @param {Object} templatesById — { [templateId]: template } from fetchAllTemplates()
 * @param {Object|null} activeTemplateFallback — the org's is_active=true template
 */
export function useAllRows(projects, reports, siteVisits = [], templatesById = {}, activeTemplateFallback = null) {
  const scheduleCommitmentProjection = useScheduleCommitmentProjection(projects);
  return useMemo(() => {
    const calculatedAt = new Date().toISOString();
    return buildCanonicalProjectRows({ projects, reports, siteVisits, templatesById, activeTemplateFallback, calculatedAt, scheduleCommitmentProjection });
  }, [projects, reports, siteVisits, templatesById, activeTemplateFallback, scheduleCommitmentProjection]);
}
