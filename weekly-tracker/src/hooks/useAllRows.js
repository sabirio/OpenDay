import { useMemo } from 'react';
import {
  estimateProgressFromStatuses,
  computeCumulativeStatuses, computeWPCumulativeStatuses,
  daysSince, isMissingReport, daysUntil,
} from '../utils/reportUtils';
import { calculateProjectProgress, progressAtIndex, buildWeekOverWeekComparison } from '../engines/progressEngine';
import { PROJECT_COLORS, computePriorityScore } from '../config/dashboardConstants';
import { computeProjectRiskScore } from '../engines/riskEngine';
import { computeConfidenceLevel } from '../engines/pmAlignmentEngine';
import { computeContractorScores } from '../engines/contractorEngine';
import { computeProjectHealth } from '../engines/projectHealthEngine';
import { computeOpeningReadiness } from '../engines/openingReadinessEngine';
import { WORK_PACKAGES as GANTT_WPS } from '../config/masterTaskLibrary';
import { getScopeWPIds } from '../core/projects/scope/getScopeWPIds';
import { isTemplateValid } from '../core/projects';

// Mirrors WeeklyReports.jsx's gatedTemplate resolution (pinned template →
// fallback to the active template → gated on isTemplateValid) so progress
// doesn't diverge between pages for projects with a custom template_id.
function resolveGatedTemplate(project, templatesById, activeTemplateFallback) {
  const raw = project?.templateId
    ? (templatesById[project.templateId] ?? activeTemplateFallback)
    : activeTemplateFallback;
  return raw && isTemplateValid(raw) ? raw : null;
}

/**
 * Shared allRows computation — same logic as Dashboard's internal useMemo,
 * plus projSiteVisits stored per row (needed for getCommands).
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
    const sorted         = [...projReports].sort((a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt));
    const cumulativeStatuses    = computeCumulativeStatuses(projReports) || {};
    const wpCumulativeStatuses  = computeWPCumulativeStatuses(projReports) || null;
    const latestReport = sorted[sorted.length - 1] || null;

    const scopeWPIds = getScopeWPIds(project?.scope, GANTT_WPS);
    const phaseWeightOverrides = project?.scope?.weightOverrides ?? null;
    const gatedTemplate = resolveGatedTemplate(project, templatesById, activeTemplateFallback);

    const progress = wpCumulativeStatuses
      ? calculateProjectProgress(wpCumulativeStatuses.workPackageStatuses, scopeWPIds, phaseWeightOverrides, gatedTemplate)
      : estimateProgressFromStatuses(cumulativeStatuses);

    const color           = PROJECT_COLORS[idx % PROJECT_COLORS.length];
    const progressPoints  = sorted.map((r, i) => ({ date: r.reportingDate || r.submittedAt, value: progressAtIndex(sorted, i) }));
    const daysSinceReport = latestReport ? daysSince(latestReport.reportingDate || latestReport.submittedAt) : null;
    const missingReport   = isMissingReport(latestReport);
    const daysToOpening   = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
    const riskScore       = computeProjectRiskScore(project, projReports, progress, projSiteVisits);
    const riskLevel       = riskScore.level;
    const priorityScore   = computePriorityScore(riskLevel, daysToOpening, missingReport);
    const { progressComparison, prevProgressComparison } = buildWeekOverWeekComparison(project, progress, project.progressHistory ?? []);
    const confidence      = computeConfidenceLevel(projReports, projSiteVisits, latestReport);
    // contScore carries the contractor-vs-PM alignment/drift history (pmAlignmentScore,
    // pmAlignmentDetails — per-visit match rate over time) alongside performance/reporting
    // sub-scores. health folds riskScore + progress + contScore into one 0-100 project-health
    // number. readiness resolves opening blockers from the same wpCumulativeStatuses already
    // computed above for progress. All three via their canonical engines — no new calc here.
    const contScore       = computeContractorScores(project, projReports, projSiteVisits);
    const health          = computeProjectHealth(riskScore, progress, contScore, latestReport);
    const readiness       = computeOpeningReadiness(wpCumulativeStatuses, project.targetOpeningDate ?? null);

    return {
      project, latestReport, cumulativeStatuses, wpCumulativeStatuses, progress,
      projReports, projSiteVisits, sorted, color, progressPoints,
      daysSinceReport, missingReport, daysToOpening, riskScore, riskLevel, priorityScore,
      progressComparison, prevProgressComparison, confidence, contScore, health, readiness,
    };
  }), [projects, reports, siteVisits, templatesById, activeTemplateFallback]);
}
