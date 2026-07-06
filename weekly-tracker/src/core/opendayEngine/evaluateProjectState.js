/**
 * evaluateProjectState — the canonical per-project derived state.
 *
 * P1.2: this is a pure extraction of the composition logic that used to live
 * inline in hooks/useAllRows.js (still the only caller). It does not
 * introduce a new formula anywhere — every value here is produced by an
 * existing engine; this function's only job is to fetch-then-compose them
 * in one documented place instead of duplicating the composition per page.
 *
 * @see types.js for the ProjectState shape.
 */
import {
  estimateProgressFromStatuses,
  computeCumulativeStatuses, computeWPCumulativeStatuses,
  daysSince, isMissingReport, daysUntil,
} from '../../utils/reportUtils';
import { calculateProjectProgress, progressAtIndex, buildWeekOverWeekComparison } from '../../engines/progressEngine';
import { computePriorityScore } from '../../config/dashboardConstants';
import { computeProjectRiskScore } from '../../engines/riskEngine';
import { computeConfidenceLevel } from '../../engines/pmAlignmentEngine';
import { computeContractorScores } from '../../engines/contractorEngine';
import { computeProjectHealth } from '../../engines/projectHealthEngine';
import { computeOpeningReadiness } from '../../engines/openingReadinessEngine';
import { WORK_PACKAGES as GANTT_WPS } from '../../config/masterTaskLibrary';
import { getScopeWPIds } from '../projects/scope/getScopeWPIds';
import { isTemplateValid } from '../projects';

// Mirrors WeeklyReports.jsx's gatedTemplate resolution (pinned template ->
// fallback to the active template -> gated on isTemplateValid) so progress
// doesn't diverge between pages for projects with a custom template_id.
function resolveGatedTemplate(project, templatesById, activeTemplateFallback) {
  const raw = project?.templateId
    ? (templatesById[project.templateId] ?? activeTemplateFallback)
    : activeTemplateFallback;
  return raw && isTemplateValid(raw) ? raw : null;
}

/**
 * @param {object} project — a single project row (camelCase, from projectService)
 * @param {Array} projReports — this project's contractor reports only (legacy-adapted shape)
 * @param {Array} projSiteVisits — this project's site visits only
 * @param {object} [options]
 * @param {object} [options.templatesById] — { [templateId]: template } from fetchAllTemplates()
 * @param {object|null} [options.activeTemplateFallback] — the org's is_active=true template
 * @returns {import('./types.js').ProjectState}
 */
export function evaluateProjectState(project, projReports, projSiteVisits = [], options = {}) {
  const { templatesById = {}, activeTemplateFallback = null } = options;

  const sorted = [...projReports].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  );
  const cumulativeStatuses   = computeCumulativeStatuses(projReports) || {};
  const wpCumulativeStatuses = computeWPCumulativeStatuses(projReports) || null;
  const latestReport = sorted[sorted.length - 1] || null;

  const scopeWPIds = getScopeWPIds(project?.scope, GANTT_WPS);
  const phaseWeightOverrides = project?.scope?.weightOverrides ?? null;
  const gatedTemplate = resolveGatedTemplate(project, templatesById, activeTemplateFallback);

  const progress = wpCumulativeStatuses
    ? calculateProjectProgress(wpCumulativeStatuses.workPackageStatuses, scopeWPIds, phaseWeightOverrides, gatedTemplate)
    : estimateProgressFromStatuses(cumulativeStatuses);

  const progressPoints  = sorted.map((r, i) => ({ date: r.reportingDate || r.submittedAt, value: progressAtIndex(sorted, i) }));
  const daysSinceReport = latestReport ? daysSince(latestReport.reportingDate || latestReport.submittedAt) : null;
  const missingReport   = isMissingReport(latestReport);
  const daysToOpening   = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
  // readiness is computed before riskScore (A3) so computeProjectRiskScore can
  // read readiness.verdict — the single source of truth for "can we actually
  // close everything in time" — rather than re-deriving it from scratch.
  const readiness       = computeOpeningReadiness(wpCumulativeStatuses, project.targetOpeningDate ?? null, scopeWPIds);
  const riskScore       = computeProjectRiskScore(project, projReports, progress, projSiteVisits, readiness);
  const riskLevel       = riskScore.level;
  const priorityScore   = computePriorityScore(riskLevel, daysToOpening, missingReport);
  const { progressComparison, prevProgressComparison } = buildWeekOverWeekComparison(project, progress, project.progressHistory ?? []);
  const confidence      = computeConfidenceLevel(projReports, projSiteVisits, latestReport);
  // contScore carries the contractor-vs-PM alignment/drift history (pmAlignmentScore,
  // pmAlignmentDetails - per-visit match rate over time) alongside performance/reporting
  // sub-scores. health folds riskScore + progress + contScore into one 0-100 project-health
  // number. Both via their canonical engines - no new calc here.
  const contScore = computeContractorScores(project, projReports, projSiteVisits);
  const health    = computeProjectHealth(riskScore, progress, contScore, latestReport);

  return {
    project, latestReport, cumulativeStatuses, wpCumulativeStatuses, progress,
    projReports, projSiteVisits, sorted, progressPoints,
    daysSinceReport, missingReport, daysToOpening, riskScore, riskLevel, priorityScore,
    progressComparison, prevProgressComparison, confidence, contScore, health, readiness,
  };
}
