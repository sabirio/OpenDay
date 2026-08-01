import { runOpenDayOrchestrator } from '../canonical/index.js';
import { PROJECT_COLORS } from '../../config/dashboardConstants.js';

/**
 * Phase 3D.1: threads one project's entry from the live schedule commitment
 * projection (see useScheduleCommitmentProjection.js /
 * loadScheduleCommitmentProjection.js) into runOpenDayOrchestrator's
 * options — a missing entry (projection still loading, or this project was
 * never CONTRACTOR_MANAGED) safely resolves to the same conservative
 * defaults evaluateProjectState.js already falls back to on its own.
 *
 * Projection Completeness Hardening: an UNAVAILABLE entry (query failure or
 * an incomplete Approved Baseline snapshot) has lifecycleStatus/approvedAt/
 * earliestCommittedPlannedStart all null too, so it numerically resolves to
 * the SAME conservative NOT_YET_COMMITTED default as a missing/loading
 * entry — engines have no fourth "unknown" commitmentState to fall back to
 * without a wider redesign, and silently guessing COMMITTED or fabricating
 * OVERDUE from missing data would be worse. What this function does add is
 * visibility: scheduleProjectionAvailability is carried onto the row itself
 * (never silently dropped) so this "we don't actually know" case stays
 * distinguishable from a genuinely resolved NO_VERSION lookup, even though
 * today's engine-level number happens to coincide with it.
 */
function commitmentOptionsFor(scheduleCommitmentProjection, projectId) {
  const facts = scheduleCommitmentProjection?.get(String(projectId));
  if (!facts) return { scheduleProjectionAvailability: null };
  return {
    contractorScheduleLifecycleStatus: facts.lifecycleStatus,
    commitmentEstablishedAt: facts.approvedAt,
    firstCommittedPlannedStart: facts.earliestCommittedPlannedStart,
    scheduleProjectionAvailability: facts.projectionAvailability ?? null,
  };
}

export function buildCanonicalProjectRows({ projects = [], reports = [], siteVisits = [], templatesById = {}, activeTemplateFallback = null, calculatedAt, scheduleCommitmentProjection = null }) {
  return projects.map((project, idx) => {
    const projReports = reports.filter(report => String(report.projectId) === String(project.id));
    const projSiteVisits = siteVisits.filter(visit => String(visit.projectId) === String(project.id));
    const candidateTemplate = project?.templateId
      ? (templatesById[project.templateId] ?? activeTemplateFallback)
      : activeTemplateFallback;
    const { scheduleProjectionAvailability, ...commitmentOptions } = commitmentOptionsFor(scheduleCommitmentProjection, project.id);
    const result = runOpenDayOrchestrator({
      project,
      contractorReports: projReports,
      siteVisits: projSiteVisits,
      progressHistory: project.progressHistory,
      template: candidateTemplate,
    }, { templatesById, activeTemplateFallback, calculatedAt, ...commitmentOptions });
    return {
      ...result.compatibility.legacyState,
      progress: result.progress.overallProgress,
      canonical: result,
      calculatedAt: result.calculatedAt,
      // commitmentOptions travels with orchestrationOptions so a later
      // rebuild (projectDetailDrawerModel.js's cache-miss path) uses the
      // SAME commitment facts this row was already built with, instead of
      // silently losing them and falling back to the conservative default.
      orchestrationOptions: { templatesById, activeTemplateFallback, ...commitmentOptions },
      scheduleProjectionAvailability,
      color: PROJECT_COLORS[idx % PROJECT_COLORS.length],
    };
  });
}
