import {
  buildProjectWPs,
  buildProjectWPsV2,
  calculateGantt,
  calculateKeyDates,
  GANTT_ENGINE_VERSION,
  isGanttStale,
} from '../../engines/ganttEngine';

export { isGanttStale };
import { computeSPIFromTasks, computeCriticalHealth } from '../../engines/spiEngine';
import { getSPIStatus } from '../../config/statusColors';
import { DEPENDENCY_RULES } from '../../config/dependencyRules';
import { getScopeWPIds } from '../projects/scope/getScopeWPIds';
import { WORK_PACKAGES as GANTT_WPS } from '../../config/masterTaskLibrary';
import { V2_TEMPLATE_TYPE as V2_TEMPLATE_ID } from '../../domains/construction/templates/retailFitoutV2';
import { resolveProjectScopeTemplate } from '../../domains/construction/templates/versionedScopeTemplate.js';
import {
  upsertGanttTasks,
  archiveGanttTasks,
  fetchProjectForGanttRegeneration,
  fetchGanttMetricsRawData,
  getProjectGanttFull,
  getProjectGantt,
} from '../../services/ganttService';
import { updateGanttDates } from '../../services/projectService';
import {
  PROJECT_AREA_BASIS,
  resolveEffectiveV2ZoneAreas,
  resolveProjectArea,
} from '../projects/areas/resolveProjectArea';

/**
 * Builds the v2 (zoned) Gantt WP set + schedule for one project. Isolated
 * from the v1 path in generateAndSaveGantt/regenerateGantt below — v1
 * projects never call this.
 */
function buildV2GanttResult(projectStart, targetOpeningDate, storeSizeSqm, templateOptions) {
  const {
    zoneAreas = {},
    activeZoneIds = null,
    activeCategoryIds = null,
    selectedWPIds = null,
    scopeTemplate = null,
  } = templateOptions;
  const resolved = resolveProjectScopeTemplate({
    templateType: V2_TEMPLATE_ID,
    templateId: scopeTemplate?.id ?? null,
    scopeTemplate,
  });
  const wps = buildProjectWPsV2(zoneAreas, projectStart, targetOpeningDate, storeSizeSqm, {
    activeZoneIds, activeCategoryIds, selectedWPIds, scopeTemplate: resolved,
  });
  const ganttResult = calculateGantt(wps, resolved.dependencies, projectStart);
  const { constructionCompletionDate, projectedOpeningDate } = calculateKeyDates(
    ganttResult,
    resolved.schedule?.completionMarkerWpId,
    resolved.schedule?.openingMarkerWpId,
    null
  );
  return { ganttResult, constructionCompletionDate, projectedOpeningDate };
}

function toGanttTaskRows(projectId, ganttResult) {
  return ganttResult.map((wp, i) => ({
    project_id:      projectId,
    wp_id:           wp.id,
    wp_label:        wp.label,
    phase_id:        wp.phaseId,
    phase_label:     wp.phaseLabel,
    planned_start:   wp.earlyStart.toISOString().split('T')[0],
    planned_end:     wp.earlyFinish.toISOString().split('T')[0],
    duration_days:   wp.duration_days,
    is_critical:     wp.isCritical,
    is_blocker:      wp.isBlocker,
    float_days:      wp.float_days,
    actual_progress: 0,
    status:          'not_started',
    is_archived:     false,
    sort_order:      i,
  }));
}

/**
 * Build Gantt from scratch for a project, persist to project_gantt_tasks,
 * and update the projects row with key dates.
 */
export async function generateAndSaveGantt(
  projectId,
  templateId,
  projectStart,
  targetOpeningDate,
  storeSizeSqm,
  templateOptions = {}
) {
  const isV2 = templateId === V2_TEMPLATE_ID;

  // Build WPs, run the Gantt algorithm, and calculate key dates — v2 uses
  // its own zoned WP builder + dependency chain + completion/opening
  // markers; v1's path below is completely unchanged.
  const { ganttResult, constructionCompletionDate, projectedOpeningDate } = isV2
    ? buildV2GanttResult(projectStart, targetOpeningDate, storeSizeSqm, templateOptions)
    : (() => {
        const wps = buildProjectWPs(templateId, projectStart, targetOpeningDate, storeSizeSqm, templateOptions);
        const gantt = calculateGantt(wps, DEPENDENCY_RULES, projectStart);
        return { ganttResult: gantt, ...calculateKeyDates(gantt) };
      })();

  await upsertGanttTasks(toGanttTaskRows(projectId, ganttResult));

  await updateGanttDates(projectId, {
    templateType:               templateId,
    ganttGeneratedAt:           new Date().toISOString(),
    ganttEngineVersion:         GANTT_ENGINE_VERSION,
    constructionCompletionDate: constructionCompletionDate?.toISOString().split('T')[0] || null,
    forecastOpeningDate:        projectedOpeningDate?.toISOString().split('T')[0] || null,
  });

  return { ganttResult, constructionCompletionDate, projectedOpeningDate };
}

/**
 * Regenerate planned dates (e.g. after scope change) while preserving actual_progress.
 */
export async function regenerateGantt(projectId) {
  const project = await fetchProjectForGanttRegeneration(projectId);

  // Get existing progress to preserve
  const existingTasks = await getProjectGanttFull(projectId);
  const progressMap = Object.fromEntries(
    existingTasks.map(t => [t.id, {
      actual_progress: t.actual_progress,
      status:          t.status,
      actual_start:    t.actual_start,
      actual_end:      t.actual_end,
    }])
  );

  const projectEndDate = project.construction_end_date || project.target_opening_date;
  const isV2 = project.template_type === V2_TEMPLATE_ID;

  let ganttResult, constructionCompletionDate, projectedOpeningDate;
  if (isV2) {
    const scope = project.scope || {};
    ({ ganttResult, constructionCompletionDate, projectedOpeningDate } = buildV2GanttResult(
      project.construction_start_date,
      projectEndDate,
      resolveProjectArea(project, PROJECT_AREA_BASIS.TOTAL_AREA) ?? 1000,
      {
        zoneAreas:         resolveEffectiveV2ZoneAreas(project),
        activeZoneIds:     scope.zones?.length > 0 ? scope.zones : null,
        activeCategoryIds: scope.categories?.length > 0 ? scope.categories : null,
        selectedWPIds:     scope.workPackages?.length > 0 ? scope.workPackages : null,
        scopeTemplate:     project.scopeTemplate,
      }
    ));
  } else {
    // Rebuild gantt — respect the project's scope (WP selection from scope configurator).
    const scopeWPIds = project.scope?.workPackages;
    const templateId = scopeWPIds?.length > 0
      ? 'custom'
      : project.template_type || 'standard_with_demo';
    const templateOptions = scopeWPIds?.length > 0
      ? { selectedWPIds: scopeWPIds }
      : {};

    const wps = buildProjectWPs(
      templateId,
      project.construction_start_date,
      projectEndDate,
      project.store_size_sqm || 1000,
      templateOptions
    );
    ganttResult = calculateGantt(wps, DEPENDENCY_RULES, project.construction_start_date);
    ({ constructionCompletionDate, projectedOpeningDate } = calculateKeyDates(ganttResult));
  }

  // Upsert with preserved progress
  const rows = ganttResult.map((wp, i) => {
    const prev = progressMap[wp.id] || {};
    return {
      project_id:      projectId,
      wp_id:           wp.id,
      wp_label:        wp.label,
      phase_id:        wp.phaseId,
      phase_label:     wp.phaseLabel,
      planned_start:   wp.earlyStart.toISOString().split('T')[0],
      planned_end:     wp.earlyFinish.toISOString().split('T')[0],
      duration_days:   wp.duration_days,
      is_critical:     wp.isCritical,
      is_blocker:      wp.isBlocker,
      float_days:      wp.float_days,
      actual_progress: prev.actual_progress || 0,
      status:          prev.status          || 'not_started',
      actual_start:    prev.actual_start    || null,
      actual_end:      prev.actual_end      || null,
      is_archived:     false,
      sort_order:      i,
    };
  });

  await upsertGanttTasks(rows);

  // F-03: archive any previously-active row whose WP fell out of the new
  // scope (e.g. a zone/category/WP deselected in the scope configurator
  // since the last generation) — without this, getProjectGantt() (which
  // only filters is_archived, never scope) keeps surfacing it in the
  // Contractor Report / PM Site Visit forms forever. Rows still in the new
  // scope are already re-asserted `is_archived: false` by the upsert above,
  // so widening scope back un-archives them automatically (via the same
  // onConflict upsert — no duplicate rows) with no separate un-archive step
  // needed here. Progress/weight calculations are unaffected by this flag
  // either way — they already scope strictly via getScopeWPIds(project.scope),
  // never via is_archived.
  const newWpIds = new Set(rows.map(r => r.wp_id));
  const toArchive = existingTasks.filter(t => !t.is_archived && !newWpIds.has(t.id));
  if (toArchive.length > 0) {
    await archiveGanttTasks(projectId, toArchive.map(t => t.id));
  }

  await updateGanttDates(projectId, {
    constructionCompletionDate: constructionCompletionDate?.toISOString().split('T')[0] || null,
    // Engine-audit fix (2026-07-16): forecastOpeningDate was previously
    // omitted here — updateGanttDates() only patches a column when its key
    // is present, so the DB's forecast_opening_date silently kept the value
    // from the last full generateAndSaveGantt() call forever, even after a
    // routine scope/date edit that regenerates the schedule.
    forecastOpeningDate:        projectedOpeningDate?.toISOString().split('T')[0] || null,
    ganttGeneratedAt:           new Date().toISOString(),
    ganttEngineVersion:         GANTT_ENGINE_VERSION,
  });

  return ganttResult;
}

/**
 * Batch-fetch SPI + critical path health for a list of project IDs.
 * Returns Map<projectId, { spi, spiStatus, criticalHealth, lastVisitDate, taskCount }>
 */
export async function loadAllGanttMetrics(projectIds) {
  if (!projectIds || projectIds.length === 0) return new Map();
  const today = new Date();

  const { allTasks, allVisits, allProjects } = await fetchGanttMetricsRawData(projectIds);

  const lastVisitMap = new Map();
  for (const v of allVisits || []) {
    if (!lastVisitMap.has(v.project_id)) lastVisitMap.set(v.project_id, v.visit_date);
  }

  const scopeWPIdsMap = new Map();
  for (const p of allProjects || []) {
    const resolved = resolveProjectScopeTemplate(p);
    const wpList = p.template_type === V2_TEMPLATE_ID ? resolved.workPackages : GANTT_WPS;
    scopeWPIdsMap.set(p.id, getScopeWPIds(p.scope ?? null, wpList));
  }

  const tasksByProject = new Map();
  for (const t of allTasks || []) {
    if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, []);
    tasksByProject.get(t.project_id).push(t);
  }

  const result = new Map();
  for (const pid of projectIds) {
    const tasks          = tasksByProject.get(pid) || [];
    const scopeWPIds     = scopeWPIdsMap.get(pid) ?? null;
    const spi            = computeSPIFromTasks(tasks, today, scopeWPIds);
    const criticalHealth = computeCriticalHealth(tasks, today, scopeWPIds);
    result.set(pid, {
      spi,
      spiStatus:     getSPIStatus(spi),
      criticalHealth,
      lastVisitDate: lastVisitMap.get(pid) ?? null,
      taskCount:     tasks.filter(t => !t.is_archived && (!scopeWPIds || scopeWPIds.includes(t.wp_id))).length,
    });
  }
  return result;
}

/**
 * Gantt WP tasks for a project's report/visit forms, narrowed to its
 * configured scope (unscoped projects see everything). Shared by
 * ContractorReport.jsx and SiteVisitReport.jsx via their respective
 * orchestration hooks — same fetch+filter, single source of truth.
 */
export async function loadScopedGanttTasks(projectId, activeWPIds) {
  const rawTasks = await getProjectGantt(projectId);
  return activeWPIds ? (rawTasks || []).filter(t => activeWPIds.includes(t.id)) : (rawTasks || []);
}
