import { supabase } from '../lib/supabase';

// ─── Generate & save (pure I/O primitives — orchestration lives in
// core/gantt/ganttOrchestrationModel.js) ───────────────────────────────────────

/**
 * Upsert project_gantt_tasks rows built by the core Gantt orchestrator.
 */
export async function upsertGanttTasks(rows) {
  const { error } = await supabase
    .from('project_gantt_tasks')
    .upsert(rows, { onConflict: 'project_id,wp_id' });
  if (error) throw error;
}

/**
 * Mark a set of WP rows archived (fell out of scope on regenerate).
 */
export async function archiveGanttTasks(projectId, wpIds) {
  const { error } = await supabase
    .from('project_gantt_tasks')
    .update({ is_archived: true })
    .eq('project_id', projectId)
    .in('wp_id', wpIds);
  if (error) throw error;
}

/**
 * Fetch the project fields regenerateGantt needs to rebuild the schedule.
 */
export async function fetchProjectForGanttRegeneration(projectId) {
  const { data, error } = await supabase
    .from('projects')
    .select('template_type, construction_start_date, construction_end_date, target_opening_date, store_size_sqm, scope')
    .eq('id', projectId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Raw batch fetch for loadAllGanttMetrics — tasks/visits/projects for a set
 * of project ids, no aggregation (the core orchestrator composes the engine
 * calls over this data).
 */
export async function fetchGanttMetricsRawData(projectIds) {
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
    .select('id,scope,template_type')
    .in('id', projectIds);

  return { allTasks, allVisits, allProjects };
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

/**
 * Weekly SPI trend for a project (up to weeksBack data points).
 * Each point: { weekLabel, reportDate, spi, overallProgress, plannedAvg }
 */
export async function fetchProjectTrendInputs(projectId, weeksBack = 8) {
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
  if (tasksRes.error) throw tasksRes.error;

  return {
    reports: (reportsRes.data || []).reverse(),
    tasks:   tasksRes.data || [],
  };
}
