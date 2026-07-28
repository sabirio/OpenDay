/**
 * @deprecated Sprint 3 compatibility implementation. Production consumers
 * must use runOpenDayOrchestrator(); new imports are blocked by architecture guard.
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
import { V2_TEMPLATE_TYPE } from '../../domains/construction/templates/retailFitoutV2';
import { resolveProjectScopeTemplate } from '../../domains/construction/templates/versionedScopeTemplate.js';
import { buildV2ProgressTemplate } from '../projects/weights/buildV2ProgressTemplate';
import { buildV2OpeningReadinessOptions } from '../projects/scope/buildV2OpeningReadinessOptions';
import { getScopeWPIds } from '../projects/scope/getScopeWPIds';
import { isTemplateValid } from '../projects';
import { resolveEffectiveV2ZoneAreas } from '../projects/areas/resolveProjectArea';

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
  const { templatesById = {}, activeTemplateFallback = null, calculatedAt = new Date().toISOString(), riskCompatibilityInput = null, canonicalScopeWPIds = null } = options;
  const referenceDate = new Date(calculatedAt);

  const sorted = [...projReports].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  );
  const cumulativeStatuses   = computeCumulativeStatuses(projReports) || {};
  const wpCumulativeStatuses = computeWPCumulativeStatuses(projReports) || null;
  const latestReport = sorted[sorted.length - 1] || null;

  const isV2 = project?.templateType === V2_TEMPLATE_TYPE;
  const resolvedScopeTemplate = resolveProjectScopeTemplate(project, { templatesById });
  const scopeWPIds = canonicalScopeWPIds ?? getScopeWPIds(project?.scope, isV2 ? resolvedScopeTemplate.workPackages : GANTT_WPS);
  const phaseWeightOverrides = project?.scope?.weightOverrides ?? null;
  // v2 has no pinned-template concept (templateId/templatesById is a v1-only,
  // TemplateEditor-driven mechanism) — its "template" is instead built fresh
  // from the project's own zone areas/scope via buildV2ProgressTemplate.
  const gatedTemplate = isV2 ? null : resolveGatedTemplate(project, templatesById, activeTemplateFallback);
  const v2ProgressTemplate = isV2
    ? buildV2ProgressTemplate(resolveEffectiveV2ZoneAreas(project), project?.scope?.zones ?? null, project?.scope?.categories ?? null, resolvedScopeTemplate)
    : null;

  const progress = wpCumulativeStatuses
    ? calculateProjectProgress(wpCumulativeStatuses.workPackageStatuses, scopeWPIds, phaseWeightOverrides, isV2 ? v2ProgressTemplate : gatedTemplate)
    : estimateProgressFromStatuses(cumulativeStatuses);

  const progressPoints  = sorted.map((r, i) => ({ date: r.reportingDate || r.submittedAt, value: progressAtIndex(sorted, i, null, null, phaseWeightOverrides) }));
  const daysSinceReport = latestReport ? daysSince(latestReport.reportingDate || latestReport.submittedAt, referenceDate) : null;
  const missingReport   = isMissingReport(latestReport, referenceDate);
  const daysToOpening   = project.targetOpeningDate ? daysUntil(project.targetOpeningDate, referenceDate) : null;
  // readiness is computed before riskScore (A3) so computeProjectRiskScore can
  // read readiness.verdict — the single source of truth for "can we actually
  // close everything in time" — rather than re-deriving it from scratch.
  const v2ReadinessOptions = isV2 ? buildV2OpeningReadinessOptions(resolvedScopeTemplate) : null;
  const readiness       = computeOpeningReadiness(wpCumulativeStatuses, project.targetOpeningDate ?? null, scopeWPIds, v2ReadinessOptions, referenceDate);
  const riskScore       = computeProjectRiskScore(project, projReports, progress, projSiteVisits, readiness, referenceDate, riskCompatibilityInput);
  const riskLevel       = riskScore.level;
  const priorityScore   = computePriorityScore(riskLevel, daysToOpening, missingReport);
  const { progressComparison, prevProgressComparison } = buildWeekOverWeekComparison(project, progress, project.progressHistory ?? [], undefined, referenceDate);
  const confidence      = computeConfidenceLevel(projReports, projSiteVisits, latestReport, referenceDate);
  // contScore carries the contractor-vs-PM alignment/drift history (pmAlignmentScore,
  // pmAlignmentDetails - per-visit match rate over time) alongside performance/reporting
  // sub-scores. health folds riskScore + progress + contScore into one 0-100 project-health
  // number. Both via their canonical engines - no new calc here.
  const contScore = computeContractorScores(project, projReports, projSiteVisits, referenceDate);
  const health    = computeProjectHealth(riskScore, progress, contScore, latestReport);

  return {
    project, latestReport, cumulativeStatuses, wpCumulativeStatuses, progress,
    projReports, projSiteVisits, sorted, progressPoints,
    daysSinceReport, missingReport, daysToOpening, riskScore, riskLevel, priorityScore,
    progressComparison, prevProgressComparison, confidence, contScore, health, readiness,
  };
}
