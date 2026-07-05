import { supabase } from '../lib/supabase';
import { updateGanttDates } from './projectService';
import { getSPIStatus } from '../config/statusColors';
import {
  buildProjectWPs,
  calculateGantt,
  calculateKeyDates,
  calculateForecastOpening,
  GANTT_ENGINE_VERSION,
} from '../engines/ganttEngine';
import { DEPENDENCY_RULES } from '../config/dependencyRules';
import { computePlannedPct, computeSPIFromTasks, computeCriticalHealth } from '../engines/spiEngine';
import { getScopeWPIds } from '../core/projects/scope/getScopeWPIds';
import { WORK_PACKAGES as GANTT_WPS } from '../config/masterTaskLibrary';

// ─── Generate & save ──────────────────────────────────────────────────────────

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
  // 1. Build WPs with durations
  const wps = buildProjectWPs(templateId, projectStart, targetOpeningDate, storeSizeSqm, templateOptions);

  // 2. Run Gantt algorithm
  const ganttResult = calculateGantt(wps, DEPENDENCY_RULES, projectStart);

  // 3. Calculate key dates
  const { constructionCompletionDate, projectedOpeningDate } = calculateKeyDates(ganttResult);

  // 4. Upsert project_gantt_tasks rows
  const rows = ganttResult.map((wp, i) => ({
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

  const { error: upsertErr } = await supabase
    .from('project_gantt_tasks')
    .upsert(rows, { onConflict: 'project_id,wp_id' });
  if (upsertErr) throw upsertErr;

  // 5. Update project with key dates
  await updateGanttDates(projectId, {
    templateType:               templateId,
    ganttGeneratedAt:           new Date().toISOString(),
    ganttEngineVersion:         GANTT_ENGINE_VERSION,
    constructionCompletionDate: constructionCompletionDate?.toISOString().split('T')[0] || null,
    forecastOpeningDate:        projectedOpeningDate?.toISOString().split('T')[0] || null,
  });

  return { ganttResult, constructionCompletionDate, projectedOpeningDate };
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch all Gantt WP tasks for a project (excluding archived).
 * Merges in latest discrepancy data.
 */
export async function getProjectGantt(projectId) {
  const { data: tasks, error } = await supabase
    .from('project_gantt_tasks')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  return (tasks || []).map(fromDBTask);
}

/**
 * Fetch all WP tasks including archived (for scope management).
 */
export async function getProjectGanttFull(projectId) {
  const { data: tasks, error } = await supabase
    .from('project_gantt_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  return (tasks || []).map(fromDBTask);
}

function fromDBTask(row) {
  return {
    id:                  row.wp_id,
    label:               row.wp_label,
    phaseId:             row.phase_id,
    phaseLabel:          row.phase_label,
    duration_days:       row.duration_days,
    isCritical:          row.is_critical,
    isBlocker:           row.is_blocker,
    float_days:          row.float_days,
    actual_progress:     row.actual_progress,
    site_visit_progress: row.site_visit_progress,
    discrepancy_status:  row.discrepancy_status,
    discrepancy_delta:   row.discrepancy_delta,
    status:              row.status,
    actual_start:        row.actual_start,
    actual_end:          row.actual_end,
    is_archived:         row.is_archived,
    sort_order:          row.sort_order,
    // Parse dates from DB strings → Date objects
    earlyStart:          row.planned_start ? new Date(row.planned_start) : null,
    earlyFinish:         row.planned_end   ? new Date(row.planned_end)   : null,
    lateStart:           null, // recalculated on demand
    lateFinish:          null,
    _dbId:               row.id,
  };
}

// ─── Progress update ──────────────────────────────────────────────────────────

/**
 * Update actual_progress and status for a single WP.
 * Called by contractor report submission.
 */
export async function updateWPProgress(projectId, wpId, progressPct, status, today = new Date()) {
  const updates = {
    actual_progress: progressPct,
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'completed') {
    updates.actual_end = today.toISOString().split('T')[0];
  }

  // Set actual_start if first progress
  if (progressPct > 0) {
    const { data: existing } = await supabase
      .from('project_gantt_tasks')
      .select('actual_start, actual_progress')
      .eq('project_id', projectId)
      .eq('wp_id', wpId)
      .single();

    if (existing && !existing.actual_start) {
      updates.actual_start = today.toISOString().split('T')[0];
    }
  }

  const { error } = await supabase
    .from('project_gantt_tasks')
    .update(updates)
    .eq('project_id', projectId)
    .eq('wp_id', wpId);
  if (error) throw error;
}

// ─── Batch progress update (from contractor report submit) ────────────────────

/**
 * @param {string} projectId
 * @param {Array<{ wpId, progress_pct, status }>} wpUpdates
 */
export async function batchUpdateWPProgress(projectId, wpUpdates) {
  const today = new Date().toISOString().split('T')[0];

  for (const { wpId, progress_pct, status } of wpUpdates) {
    await updateWPProgress(projectId, wpId, progress_pct, status, new Date(today));
  }
}

// ─── Regenerate (keep actual progress) ───────────────────────────────────────

/**
 * Regenerate planned dates (e.g. after scope change) while preserving actual_progress.
 */
export async function regenerateGantt(projectId) {
  const { data: project, error: pErr } = await supabase
    .from('projects')
    .select('template_type, construction_start_date, construction_end_date, target_opening_date, store_size_sqm, scope')
    .eq('id', projectId)
    .single();
  if (pErr) throw pErr;

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

  // Rebuild gantt — respect the project's scope (WP selection from scope configurator).
  const scopeWPIds = project.scope?.workPackages;
  const templateId = scopeWPIds?.length > 0
    ? 'custom'
    : project.template_type || 'standard_with_demo';
  const templateOptions = scopeWPIds?.length > 0
    ? { selectedWPIds: scopeWPIds }
    : {};

  const projectEndDate = project.construction_end_date || project.target_opening_date;
  const wps = buildProjectWPs(
    templateId,
    project.construction_start_date,
    projectEndDate,
    project.store_size_sqm || 1000,
    templateOptions
  );
  const ganttResult = calculateGantt(wps, DEPENDENCY_RULES, project.construction_start_date);
  const { constructionCompletionDate } = calculateKeyDates(ganttResult);

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

  const { error } = await supabase
    .from('project_gantt_tasks')
    .upsert(rows, { onConflict: 'project_id,wp_id' });
  if (error) throw error;

  await updateGanttDates(projectId, {
    constructionCompletionDate: constructionCompletionDate?.toISOString().split('T')[0] || null,
    ganttGeneratedAt:           new Date().toISOString(),
    ganttEngineVersion:         GANTT_ENGINE_VERSION,
  });

  return ganttResult;
}

// ─── Forecast update ──────────────────────────────────────────────────────────

export async function updateForecast(projectId) {
  const tasks = await getProjectGantt(projectId);
  if (!tasks.length) return;

  const { forecastOpeningDate } = calculateForecastOpening(tasks, new Date());
  if (!forecastOpeningDate) return;

  await updateGanttDates(projectId, {
    forecastOpeningDate: forecastOpeningDate.toISOString().split('T')[0],
  });

  return forecastOpeningDate;
}

// ─── Scope management ─────────────────────────────────────────────────────────

/**
 * Add a new WP to project scope.
 * Inserts into project_gantt_tasks and recalculates Gantt dates.
 */
export async function addWPToScope(projectId, wpId) {
  const { error } = await supabase
    .from('project_gantt_tasks')
    .update({ is_archived: false })
    .eq('project_id', projectId)
    .eq('wp_id', wpId);
  if (error) throw error;

  await regenerateGantt(projectId);
}

/**
 * Remove a WP from project scope (archive it, don't delete).
 */
export async function removeWPFromScope(projectId, wpId) {
  const { error } = await supabase
    .from('project_gantt_tasks')
    .update({ is_archived: true })
    .eq('project_id', projectId)
    .eq('wp_id', wpId);
  if (error) throw error;
}

// ─── Manual date override (drag resize) ──────────────────────────────────────

export async function updateWPDates(projectId, wpId, { plannedStart, plannedEnd, durationDays }) {
  const { error } = await supabase
    .from('project_gantt_tasks')
    .update({
      planned_start: plannedStart,
      planned_end:   plannedEnd,
      duration_days: durationDays,
      updated_at:    new Date().toISOString(),
    })
    .eq('project_id', projectId)
    .eq('wp_id', wpId);
  if (error) throw error;
}

// ─── Update discrepancy fields on gantt task ──────────────────────────────────

export async function updateGanttDiscrepancy(projectId, wpId, { siteVisitProgress, discrepancyStatus, discrepancyDelta }) {
  const { error } = await supabase
    .from('project_gantt_tasks')
    .update({
      site_visit_progress: siteVisitProgress,
      discrepancy_status:  discrepancyStatus,
      discrepancy_delta:   discrepancyDelta,
      updated_at:          new Date().toISOString(),
    })
    .eq('project_id', projectId)
    .eq('wp_id', wpId);
  if (error) throw error;
}

// ─── Refresh planned_progress column ─────────────────────────────────────────

/**
 * Compute planned_progress for every active task of a project at today's date
 * and persist it to the planned_progress column.
 * Requires: ALTER TABLE project_gantt_tasks ADD COLUMN IF NOT EXISTS planned_progress NUMERIC(5,2) DEFAULT 0
 */
export async function refreshPlannedProgress(projectId) {
  const { data: tasks, error } = await supabase
    .from('project_gantt_tasks')
    .select('id,planned_start,planned_end,is_archived')
    .eq('project_id', projectId);
  if (error) throw error;
  if (!tasks || tasks.length === 0) return;

  const today = new Date();

  const updates = tasks
    .filter(t => !t.is_archived)
    .map(t => {
      const start = new Date(t.planned_start);
      const end   = new Date(t.planned_end);
      let pct;
      if (isNaN(start) || isNaN(end) || end <= start) {
        pct = 100;
      } else if (today <= start) {
        pct = 0;
      } else if (today >= end) {
        pct = 100;
      } else {
        pct = Math.min(100, (today - start) / (end - start) * 100);
      }
      return { id: t.id, planned_progress: Math.round(pct * 100) / 100 };
    });

  for (const u of updates) {
    await supabase
      .from('project_gantt_tasks')
      .update({ planned_progress: u.planned_progress })
      .eq('id', u.id);
  }
}

/**
 * Compute SPI + critical path health for a single project.
 * Returns { spi, spiStatus, criticalHealth, lastVisitDate, taskCount }
 */
export async function getProjectMetrics(projectId) {
  const today = new Date();
  const { data: tasks, error } = await supabase
    .from('project_gantt_tasks')
    .select('wp_id,planned_start,planned_end,actual_progress,is_critical,is_archived')
    .eq('project_id', projectId);
  if (error) throw error;

  const { data: projectRow } = await supabase
    .from('projects')
    .select('scope')
    .eq('id', projectId)
    .single();
  const scopeWPIds = getScopeWPIds(projectRow?.scope ?? null, GANTT_WPS);

  const spi            = computeSPIFromTasks(tasks || [], today, scopeWPIds);
  const criticalHealth = computeCriticalHealth(tasks || [], today, scopeWPIds);

  const { data: visits } = await supabase
    .from('site_visits')
    .select('visit_date')
    .eq('project_id', projectId)
    .order('visit_date', { ascending: false })
    .limit(1);

  return {
    spi,
    spiStatus:     getSPIStatus(spi),
    criticalHealth,
    lastVisitDate: visits?.[0]?.visit_date ?? null,
    taskCount:     (tasks || []).filter(t => !t.is_archived && (!scopeWPIds || scopeWPIds.includes(t.wp_id))).length,
  };
}

/**
 * Batch-fetch SPI + critical path health for a list of project IDs.
 * Returns Map<projectId, { spi, spiStatus, criticalHealth, lastVisitDate, taskCount }>
 */
export async function loadAllGanttMetrics(projectIds) {
  if (!projectIds || projectIds.length === 0) return new Map();
  const today = new Date();

  const { data: allTasks, error: tErr } = await supabase
    .from('project_gantt_tasks')
    .select('project_id,wp_id,planned_start,planned_end,actual_progress,is_critical,is_archived')
    .in('project_id', projectIds);
  if (tErr) throw tErr;

  const { data: allVisits } = await supabase
    .from('site_visits')
    .select('project_id,visit_date')
    .in('project_id', projectIds)
    .order('visit_date', { ascending: false });

  const { data: allProjects } = await supabase
    .from('projects')
    .select('id,scope')
    .in('id', projectIds);

  const lastVisitMap = new Map();
  for (const v of allVisits || []) {
    if (!lastVisitMap.has(v.project_id)) lastVisitMap.set(v.project_id, v.visit_date);
  }

  const scopeWPIdsMap = new Map();
  for (const p of allProjects || []) {
    scopeWPIdsMap.set(p.id, getScopeWPIds(p.scope ?? null, GANTT_WPS));
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
 * Weekly SPI trend for a project (up to weeksBack data points).
 * Each point: { weekLabel, reportDate, spi, overallProgress, plannedAvg }
 */
export async function getProjectTrend(projectId, weeksBack = 8) {
  const [reportsRes, tasksRes] = await Promise.all([
    supabase
      .from('contractor_reports')
      .select('id,report_date,week_number,overall_progress')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .limit(weeksBack),
    supabase
      .from('project_gantt_tasks')
      .select('wp_id,planned_start,planned_end,is_archived')
      .eq('project_id', projectId),
  ]);
  if (reportsRes.error) throw reportsRes.error;

  const reports = (reportsRes.data || []).reverse();
  const tasks   = (tasksRes.data || []).filter(t => !t.is_archived);

  return reports.map(r => {
    const refDate = new Date(r.report_date);
    const planned = tasks.length > 0
      ? tasks.reduce((s, t) => s + computePlannedPct(t.planned_start, t.planned_end, refDate), 0) / tasks.length
      : null;
    const actual = r.overall_progress ?? 0;
    const spi    = planned && planned >= 1 ? Math.round(actual / planned * 100) / 100 : null;
    return {
      weekLabel:       `W${r.week_number}`,
      reportDate:      r.report_date,
      spi,
      overallProgress: actual,
      plannedAvg:      planned !== null ? Math.round(planned) : null,
    };
  });
}
