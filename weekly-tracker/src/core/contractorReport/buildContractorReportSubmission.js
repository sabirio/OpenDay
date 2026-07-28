import { normalizeReport } from '../../services/reportService';
import { computeWPCumulativeStatuses, computeCumulativeStatuses } from '../../utils/reportUtils';
import { calculateProjectProgressResult, calculateRawWPAverageProgress, resolveLegacyTaskEffectiveProgressPct } from '../../engines/progressEngine';
import { getWPGrouping, isZonedTemplate } from '../projects/grouping/getWPGrouping';
import { buildV2ProgressTemplate } from '../projects/weights/buildV2ProgressTemplate';
import { getScopeWPIds } from '../projects/scope/getScopeWPIds';
import { resolveProjectScopeTemplate } from '../../domains/construction/templates/versionedScopeTemplate.js';
import { resolveEffectiveV2ZoneAreas } from '../projects/areas/resolveProjectArea';
// Audited, intentional legacy-fallback import (P0 data-integrity fix, see
// AGENTS.md task history) — tracked in
// src/tests/architectureGuard.test.mjs's ALLOWED_LEGACY_IMPORTERS. Only used
// inside the `ganttTasks.length === 0` branch below, mirroring every other
// legacy-report consumer's gating convention.
// eslint-disable-next-line no-restricted-imports
import { encodeLegacyWpTaskId } from '../../config/workPackages';
import { legacyStatusToDbStatus } from '../../config/statusScores';

/**
 * Pure composition of one contractor report submission: synthesizes
 * workPackageStatuses from the Gantt slider inputs when a Gantt schedule is
 * active, normalizes the report shape, and computes the cumulative
 * (all-reports-to-date) progress plus this report's own raw WP average.
 * No I/O — submitContractorReportModel.js persists the result.
 *
 * cumulativeProgress is the canonical calculateProjectProgressResult()
 * output (becomes progress_history.overall_progress); contractorRawAverageProgress
 * is a distinct, unweighted average of just this report's WPs (becomes
 * contractor_reports.overall_progress) — P1.4: never let the raw average
 * silently stand in for cumulative progress.
 */
// P0 fix: for a project with no Gantt schedule, wpProgressArray was
// unconditionally [] (see git history), which silently dropped every
// legacy-form WP status out of contractor_report_wps and left
// contractor_reports.overall_progress at 0 even though the contractor had
// reported real statuses — the only surviving copy was the unread
// progress_history.snapshot.legacy_report JSON blob. This builds the same
// structured rows the Gantt branch already produces, from the legacy form's
// own workPackageStatuses, scoped to this report's active packages (the
// legacy equivalent of "this report's WPs" — mirrors how the Gantt branch is
// already scoped to the project's active Gantt tasks, not the whole catalog).
// 'Not Applicable' tasks are skipped — same exclusion comparisonResult()
// already applies when comparing PM vs GC status.
function buildLegacyWpProgressArray(workPackageStatuses, currentPackages) {
  const scopedWpIds = currentPackages?.length ? currentPackages : Object.keys(workPackageStatuses || {});
  const rows = [];
  for (const wpId of scopedWpIds) {
    const tasks = workPackageStatuses?.[wpId];
    if (!tasks) continue;
    for (const [taskName, entry] of Object.entries(tasks)) {
      if (!entry?.status || entry.status === 'Not Applicable') continue;
      rows.push({
        wpId: encodeLegacyWpTaskId(wpId, taskName),
        progress_pct: resolveLegacyTaskEffectiveProgressPct(entry.status, entry.progress),
        status: legacyStatusToDbStatus(entry.status),
        comment: entry.comment || '',
      });
    }
  }
  return rows;
}

export function buildContractorReportSubmission({
  project, form, photoUrls, prevReport, ganttTasks, ganttWpProgress, reports, currentPhases,
}) {
  const isV2 = isZonedTemplate(project.templateType);
  const scopeTemplate = resolveProjectScopeTemplate(project);
  let workPackageStatuses = form.workPackageStatuses || {};
  if (ganttTasks.length > 0) {
    const synthesized = {};
    for (const task of ganttTasks) {
      const entry = ganttWpProgress[task.id] || {};
      const pct = entry.progress_pct ?? task.actual_progress ?? 0;
      const ganttStatus = entry.status ?? task.status ?? 'not_started';
      const wpStatus =
        ganttStatus === 'completed' ? 'Completed'
        : (ganttStatus === 'in_progress' || ganttStatus === 'delayed' || ganttStatus === 'blocked') ? 'In Progress'
        : 'Not Started';
      // v2's workPackageStatuses is keyed by categoryId, not the zoneId
      // task.phaseId carries (see buildV2ProgressTemplate.js) — resolved
      // live via getWPGrouping, never trusted from the stored task row.
      const wpId = isV2 ? (getWPGrouping(project.templateType, task.id, scopeTemplate)?.categoryId ?? task.phaseId) : task.phaseId;
      const taskName = task.label;
      if (wpId && taskName) {
        if (!synthesized[wpId]) synthesized[wpId] = {};
        synthesized[wpId][taskName] = { status: wpStatus, progress: pct };
      }
    }
    workPackageStatuses = synthesized;
  }

  const mainReportPayload = normalizeReport({
    id: Date.now(),
    projectId: project.id,
    storeCode: project.storeCode,
    projectName: project.shoppingMallName,
    contractor: project.generalContractor,
    submittedAt: new Date().toISOString(),
    previousReportId: prevReport?.id ?? null,

    ...form,

    currentPhase: currentPhases[0] || "",
    currentPhases,
    currentPackages: form.currentPackages || [],
    workPackageStatuses,
    photos: photoUrls,
  });

  // Compute cumulative progress (all prior reports + this one) before saving,
  // so the history row stores the same number the Weekly Reports screen shows.
  const projectReports = reports.filter(r => String(r.projectId) === String(project.id));
  const allReports = [...projectReports, mainReportPayload];
  const wpCum  = computeWPCumulativeStatuses(allReports);
  const legCum = computeCumulativeStatuses(allReports);
  const scopeWPIds = isV2 ? getScopeWPIds(project.scope, scopeTemplate.workPackages) : null;
  const v2Template = isV2
    ? buildV2ProgressTemplate(resolveEffectiveV2ZoneAreas(project), project.scope?.zones ?? null, project.scope?.categories ?? null, scopeTemplate)
    : null;
  const cumulativeProgress = calculateProjectProgressResult(wpCum, legCum, scopeWPIds, v2Template, project.scope?.weightOverrides ?? null).progress;

  const wpProgressArray = ganttTasks.length > 0
    ? ganttTasks.map(task => {
      const value = ganttWpProgress[task.id] || {};
      return {
        wpId: task.id,
        progress_pct: value.progress_pct ?? 0,
        status: value.status ?? "not_started",
        comment: value.comment ?? "",
      };
    })
    : buildLegacyWpProgressArray(workPackageStatuses, form.currentPackages);

  const contractorRawAverageProgress = calculateRawWPAverageProgress(wpProgressArray, cumulativeProgress);

  return { mainReportPayload, wpProgressArray, cumulativeProgress, contractorRawAverageProgress };
}
