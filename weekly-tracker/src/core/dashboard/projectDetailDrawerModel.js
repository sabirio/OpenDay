import { runOpenDayOrchestrator } from '../canonical/index.js';
import { isTemplateValid } from '../projects/index.js';
import { deriveOpeningStatusLabel } from './openingStatusLabel.js';

// Phase 3D.1: attaches a presentation-only opening.statusLabel — never
// recalculates opening.status itself, just picks CONTRACTOR_MANAGED-aware
// wording for it (see openingStatusLabel.js). Centralized here so
// DashboardProjectOverview.jsx (a component) never needs to import core/
// directly — components only ever read the already-composed summary.
// contractorScheduleLifecycleStatus (when the live projection resolved one)
// distinguishes DRAFT from CHANGES_REQUESTED wording — commitmentState alone
// collapses both into NOT_YET_COMMITTED. scheduleProjectionAvailability
// (Projection Completeness Hardening) is read from `row` directly in both
// call sites below — it is a Dashboard-row-level fact set by
// dashboardProjectRowsModel.js from the batch projection lookup, not part
// of runOpenDayOrchestrator's own return shape, so it is unaffected by
// which branch (cached vs. rebuilt) produced the rest of the summary.
function withOpeningStatusLabel(summary, project, contractorScheduleLifecycleStatus, scheduleProjectionAvailability) {
  if (!summary?.opening) return summary;
  return {
    ...summary,
    opening: {
      ...summary.opening,
      statusLabel: deriveOpeningStatusLabel({
        scheduleOwnershipMode: project?.scheduleOwnershipMode ?? null,
        contractorScheduleLifecycleStatus: contractorScheduleLifecycleStatus ?? null,
        scheduleProjectionAvailability: scheduleProjectionAvailability ?? null,
        readinessStatus: summary.opening.status,
      }),
    },
  };
}

export function buildProjectDetailDrawerModel(row, projSiteVisits) {
  if (!row) return null;
  if (row.canonical?.compatibility?.projectSummary) {
    return withOpeningStatusLabel(row.canonical.compatibility.projectSummary, row.project, row.contractorScheduleLifecycleStatus, row.scheduleProjectionAvailability);
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
  return withOpeningStatusLabel(result.compatibility.projectSummary, row.project, result.contractorScheduleLifecycleStatus, row.scheduleProjectionAvailability);
}
