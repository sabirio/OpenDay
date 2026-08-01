/**
 * @deprecated as a DIRECT IMPORT SITE — new callers must go through
 * runOpenDayOrchestrator() (new imports of this function are blocked by
 * architecture guard). This does NOT mean the composition logic itself is
 * dead: runOpenDayOrchestrator() calls this function directly and
 * republishes its result as compatibility.legacyState — it is still the
 * one live implementation of this composition, just no longer meant to be
 * reached by new code except through that orchestrator.
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
  daysSince, daysUntil,
} from '../../utils/reportUtils';
import { calculateProjectProgress, progressAtIndex, buildWeekOverWeekComparison } from '../../engines/progressEngine';
import { computePriorityScore } from '../../config/dashboardConstants';
import { computeProjectRiskScore } from '../../engines/riskEngine';
import { computeConfidenceLevel } from '../../engines/pmAlignmentEngine';
import { computeContractorScores } from '../../engines/contractorEngine';
import { computeProjectHealth } from '../../engines/projectHealthEngine';
import { computeOpeningReadiness } from '../../engines/openingReadinessEngine';
import { deriveReportDueState, REPORT_DUE_STATE } from '../../engines/reportDueStateEngine.js';
import { WORK_PACKAGES as GANTT_WPS } from '../../config/masterTaskLibrary';
import { V2_TEMPLATE_TYPE } from '../../domains/construction/templates/retailFitoutV2';
import { resolveProjectScopeTemplate } from '../../domains/construction/templates/versionedScopeTemplate.js';
import { resolveProjectProgressTemplate } from '../projects/weights/resolveProjectProgressTemplate.js';
import { buildV2OpeningReadinessOptions } from '../projects/scope/buildV2OpeningReadinessOptions';
import { resolveProjectScopeSelection } from '../projects/scope/getScopeWPIds';
import { isTemplateValid } from '../projects';
import { resolveEffectiveV2ZoneAreas } from '../projects/areas/resolveProjectArea';
import { deriveScheduleCommitmentState } from '../schedule/scheduleCommitmentState.js';
import { deriveAssessmentAvailability } from '../schedule/scheduleAssessmentAvailability.js';

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
 * @param {string|null} [options.contractorScheduleLifecycleStatus] — Phase 3D.1: the
 *   DISPLAY-level submission status (scheduleSubmissionReadModel.js's
 *   deriveSubmissionDisplayStatus() output, with 'NONE' passed as 'DRAFT') for a
 *   CONTRACTOR_MANAGED project. Omitted/null defaults to NOT_YET_COMMITTED for
 *   CONTRACTOR_MANAGED (the safe, conservative default — never silently COMMITTED)
 *   and is irrelevant for AUTO_GENERATED (always COMMITTED regardless).
 * @param {string|Date|null} [options.commitmentEstablishedAt] — Approved Baseline reviewed_at
 * @param {string|Date|null} [options.firstCommittedPlannedStart] — earliest planned_start in that baseline
 * @returns {import('./types.js').ProjectState}
 */
export function evaluateProjectState(project, projReports, projSiteVisits = [], options = {}) {
  const {
    templatesById = {}, activeTemplateFallback = null, calculatedAt = new Date().toISOString(),
    riskCompatibilityInput = null, canonicalScopeWPIds = null,
    contractorScheduleLifecycleStatus = null, commitmentEstablishedAt = null, firstCommittedPlannedStart = null,
  } = options;
  const referenceDate = new Date(calculatedAt);

  // Phase 3D.1 (Section B): NO COMMITMENT YET != COMMITMENT MISSED.
  // scheduleOwnershipMode comes straight off the already-fetched project row
  // (projectService.js's fromDB() already defaults it to AUTO_GENERATED) —
  // no extra fetch needed, and AUTO_GENERATED always resolves to COMMITTED,
  // so every existing project's behavior is unchanged below. A
  // CONTRACTOR_MANAGED project resolves to NOT_YET_COMMITTED until a caller
  // supplies its real lifecycle status via options.
  const scheduleOwnershipMode = project?.scheduleOwnershipMode ?? null;
  const commitmentState = deriveScheduleCommitmentState({ scheduleOwnershipMode, contractorScheduleLifecycleStatus });
  const assessmentAvailability = deriveAssessmentAvailability(commitmentState);

  const sorted = [...projReports].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  );
  const cumulativeStatuses   = computeCumulativeStatuses(projReports) || {};
  const wpCumulativeStatuses = computeWPCumulativeStatuses(projReports) || null;
  const latestReport = sorted[sorted.length - 1] || null;

  const isV2 = project?.templateType === V2_TEMPLATE_TYPE;
  const resolvedScopeTemplate = resolveProjectScopeTemplate(project, { templatesById });
  const schemaVersion = isV2 ? resolvedScopeTemplate?.data?.schemaVersion : undefined;
  const scopeWPIds = canonicalScopeWPIds ?? resolveProjectScopeSelection({
    scope: project?.scope,
    workPackages: isV2 ? resolvedScopeTemplate.workPackages : GANTT_WPS,
    schemaVersion,
  });
  const phaseWeightOverrides = project?.scope?.weightOverrides ?? null;
  // v2 has no pinned-template concept (templateId/templatesById is a v1-only,
  // TemplateEditor-driven mechanism) — its "template" is instead built fresh
  // from the project's own zone areas/scope via resolveProjectProgressTemplate(),
  // which owns the schemaVersion-1-vs-2 template-shape decision internally.
  const gatedTemplate = isV2 ? null : resolveGatedTemplate(project, templatesById, activeTemplateFallback);
  const v2ProgressTemplate = isV2
    ? resolveProjectProgressTemplate({
        scopeTemplate: resolvedScopeTemplate,
        zoneAreas: resolveEffectiveV2ZoneAreas(project),
        activeZoneIds: project?.scope?.zones ?? null,
        activeCategoryIds: project?.scope?.categories ?? null,
      })
    : null;

  const progress = wpCumulativeStatuses
    ? calculateProjectProgress(wpCumulativeStatuses.workPackageStatuses, scopeWPIds, phaseWeightOverrides, isV2 ? v2ProgressTemplate : gatedTemplate)
    : estimateProgressFromStatuses(cumulativeStatuses);

  const progressPoints  = sorted.map((r, i) => ({ date: r.reportingDate || r.submittedAt, value: progressAtIndex(sorted, i, null, null, phaseWeightOverrides) }));
  const daysSinceReport = latestReport ? daysSince(latestReport.reportingDate || latestReport.submittedAt, referenceDate) : null;
  // Phase 3D.1 (Section 8/10): reportDueState replaces the raw isMissingReport()
  // call here — for AUTO_GENERATED it is byte-identical (see
  // reportDueStateEngine.js's legacy branch), and for CONTRACTOR_MANAGED it
  // correctly reports no obligation at all before a real commitment exists.
  // isMissingReport() itself is untouched and still available to other/legacy callers.
  const reportDueState  = deriveReportDueState({
    scheduleOwnershipMode, commitmentState, commitmentEstablishedAt, firstCommittedPlannedStart,
    latestReport, referenceDate,
  });
  const missingReport   = reportDueState === REPORT_DUE_STATE.OVERDUE;
  const daysToOpening   = project.targetOpeningDate ? daysUntil(project.targetOpeningDate, referenceDate) : null;
  // readiness is computed before riskScore (A3) so computeProjectRiskScore can
  // read readiness.verdict — the single source of truth for "can we actually
  // close everything in time" — rather than re-deriving it from scratch.
  const v2ReadinessOptions = isV2 ? buildV2OpeningReadinessOptions(resolvedScopeTemplate) : null;
  const readiness       = computeOpeningReadiness(wpCumulativeStatuses, project.targetOpeningDate ?? null, scopeWPIds, v2ReadinessOptions, referenceDate, assessmentAvailability);
  const riskScore       = computeProjectRiskScore(project, projReports, progress, projSiteVisits, readiness, referenceDate, riskCompatibilityInput, assessmentAvailability);
  const riskLevel       = riskScore.level;
  const priorityScore   = computePriorityScore(riskLevel, daysToOpening, missingReport);
  const { progressComparison, prevProgressComparison } = buildWeekOverWeekComparison(project, progress, project.progressHistory ?? [], undefined, referenceDate);
  const confidence      = computeConfidenceLevel(projReports, projSiteVisits, latestReport, referenceDate);
  // contScore carries the contractor-vs-PM alignment/drift history (pmAlignmentScore,
  // pmAlignmentDetails - per-visit match rate over time) alongside performance/reporting
  // sub-scores. health folds riskScore + progress + contScore into one 0-100 project-health
  // number. Both via their canonical engines - no new calc here.
  const contScore = computeContractorScores(project, projReports, projSiteVisits, referenceDate);
  const health    = computeProjectHealth(riskScore, progress, contScore, latestReport, assessmentAvailability);

  return {
    project, latestReport, cumulativeStatuses, wpCumulativeStatuses, progress,
    projReports, projSiteVisits, sorted, progressPoints,
    daysSinceReport, missingReport, daysToOpening, riskScore, riskLevel, priorityScore,
    progressComparison, prevProgressComparison, confidence, contScore, health, readiness,
    scheduleOwnershipMode, commitmentState, assessmentAvailability, reportDueState,
  };
}
