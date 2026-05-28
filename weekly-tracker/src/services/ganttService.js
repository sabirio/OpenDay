import { supabase } from '../lib/supabase';
import {
  buildProjectWPs,
  calculateGantt,
  checkFeasibility,
  calculateKeyDates,
  calculateForecastOpening,
} from '../engines/ganttEngine';
import { DEPENDENCY_RULES } from '../config/dependencyRules';

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
  const { error: projErr } = await supabase
    .from('projects')
    .update({
      template_type:                 templateId,
      gantt_generated_at:            new Date().toISOString(),
      construction_completion_date:  constructionCompletionDate?.toISOString().split('T')[0] || null,
      forecast_opening_date:         projectedOpeningDate?.toISOString().split('T')[0] || null,
    })
    .eq('id', projectId);
  if (projErr) throw projErr;

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
    .select('template_type, construction_start_date, target_opening_date, store_size_sqm')
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

  // Rebuild gantt
  const wps = buildProjectWPs(
    project.template_type || 'standard_with_demo',
    project.construction_start_date,
    project.target_opening_date,
    project.store_size_sqm || 1000
  );
  const ganttResult = calculateGantt(wps, DEPENDENCY_RULES, project.construction_start_date);
  const { constructionCompletionDate, projectedOpeningDate } = calculateKeyDates(ganttResult);

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

  await supabase.from('projects').update({
    construction_completion_date: constructionCompletionDate?.toISOString().split('T')[0] || null,
    gantt_generated_at:           new Date().toISOString(),
  }).eq('id', projectId);

  return ganttResult;
}

// ─── Forecast update ──────────────────────────────────────────────────────────

export async function updateForecast(projectId) {
  const tasks = await getProjectGantt(projectId);
  if (!tasks.length) return;

  const { forecastOpeningDate } = calculateForecastOpening(tasks, new Date());
  if (!forecastOpeningDate) return;

  const { error } = await supabase
    .from('projects')
    .update({ forecast_opening_date: forecastOpeningDate.toISOString().split('T')[0] })
    .eq('id', projectId);
  if (error) throw error;

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
