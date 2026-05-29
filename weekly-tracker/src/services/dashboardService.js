import { supabase } from '../lib/supabase';
import { getSPIStatus } from '../config/statusColors';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Compute what percentage of a task's planned timeline has elapsed.
 * Returns 0–100. Never returns null.
 */
function computePlannedPct(plannedStart, plannedEnd, referenceDate = new Date()) {
  const start = new Date(plannedStart);
  const end   = new Date(plannedEnd);
  const ref   = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

  if (isNaN(start) || isNaN(end) || end <= start) return 100;
  if (ref <= start) return 0;
  if (ref >= end)   return 100;

  return Math.min(100, (ref - start) / (end - start) * 100);
}

/** Compute SPI from a set of gantt task rows (already fetched). */
function computeSPIFromTasks(tasks, referenceDate = new Date()) {
  const active = tasks.filter(t => !t.is_archived);
  if (active.length === 0) return null;

  let sumActual  = 0;
  let sumPlanned = 0;
  for (const t of active) {
    sumActual  += (t.actual_progress ?? 0);
    sumPlanned += computePlannedPct(t.planned_start, t.planned_end, referenceDate);
  }

  const avgPlanned = sumPlanned / active.length;
  if (avgPlanned < 1) return null; // nothing planned yet — SPI undefined
  return Math.round((sumActual / sumPlanned) * 100) / 100;
}

/** Critical path health: { total, behind, ratio } */
function computeCriticalHealth(tasks, referenceDate = new Date()) {
  const critical = tasks.filter(t => t.is_critical && !t.is_archived);
  if (critical.length === 0) return { total: 0, behind: 0, ratio: 0 };

  const behind = critical.filter(t => {
    const planned = computePlannedPct(t.planned_start, t.planned_end, referenceDate);
    return (t.actual_progress ?? 0) < planned - 5; // 5 pp tolerance
  }).length;

  return {
    total:  critical.length,
    behind,
    ratio:  behind / critical.length,
    label:  behind === 0 ? 'healthy' : behind / critical.length <= 0.5 ? 'warning' : 'critical',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

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

  const spi             = computeSPIFromTasks(tasks || [], today);
  const criticalHealth  = computeCriticalHealth(tasks || [], today);

  const { data: visits } = await supabase
    .from('site_visits')
    .select('visit_date')
    .eq('project_id', projectId)
    .order('visit_date', { ascending: false })
    .limit(1);

  return {
    spi,
    spiStatus:      getSPIStatus(spi),
    criticalHealth,
    lastVisitDate:  visits?.[0]?.visit_date ?? null,
    taskCount:      (tasks || []).filter(t => !t.is_archived).length,
  };
}

/**
 * Batch-fetch gantt metrics for a list of project IDs in two queries.
 * Returns Map<projectId, metrics>
 */
export async function loadAllGanttMetrics(projectIds) {
  if (!projectIds || projectIds.length === 0) return new Map();

  const today = new Date();

  // Fetch all tasks for all projects in one query
  const { data: allTasks, error: tErr } = await supabase
    .from('project_gantt_tasks')
    .select('project_id,wp_id,planned_start,planned_end,actual_progress,is_critical,is_archived')
    .in('project_id', projectIds);
  if (tErr) throw tErr;

  // Fetch latest site visit per project (one row per project)
  const { data: allVisits } = await supabase
    .from('site_visits')
    .select('project_id,visit_date')
    .in('project_id', projectIds)
    .order('visit_date', { ascending: false });

  // Index last visit per project
  const lastVisitMap = new Map();
  for (const v of allVisits || []) {
    if (!lastVisitMap.has(v.project_id)) {
      lastVisitMap.set(v.project_id, v.visit_date);
    }
  }

  // Group tasks by project
  const tasksByProject = new Map();
  for (const t of allTasks || []) {
    if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, []);
    tasksByProject.get(t.project_id).push(t);
  }

  const result = new Map();
  for (const pid of projectIds) {
    const tasks          = tasksByProject.get(pid) || [];
    const spi            = computeSPIFromTasks(tasks, today);
    const criticalHealth = computeCriticalHealth(tasks, today);
    result.set(pid, {
      spi,
      spiStatus:     getSPIStatus(spi),
      criticalHealth,
      lastVisitDate: lastVisitMap.get(pid) ?? null,
      taskCount:     tasks.filter(t => !t.is_archived).length,
    });
  }
  return result;
}

/**
 * Get portfolio-level summary KPIs based on SPI.
 * Returns { total, onSchedule, atRisk, critical, noSchedule, avgSPI }
 */
export async function getPortfolioSummary(projectIds) {
  const metricsMap = await loadAllGanttMetrics(projectIds);

  let onSchedule = 0, atRisk = 0, critical = 0, noSchedule = 0;
  let spiSum = 0, spiCount = 0;

  for (const m of metricsMap.values()) {
    switch (m.spiStatus) {
      case 'on_schedule': onSchedule++; break;
      case 'at_risk':     atRisk++;     break;
      case 'critical':    critical++;   break;
      default:            noSchedule++;
    }
    if (m.spi !== null) { spiSum += m.spi; spiCount++; }
  }

  return {
    total:      projectIds.length,
    onSchedule,
    atRisk,
    critical,
    noSchedule,
    avgSPI: spiCount > 0 ? Math.round(spiSum / spiCount * 100) / 100 : null,
  };
}

/**
 * Get weekly SPI trend for a project (up to weeksBack data points).
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
  const reports = (reportsRes.data || []).reverse(); // oldest first for chart
  const tasks   = (tasksRes.data || []).filter(t => !t.is_archived);

  return reports.map(r => {
    const refDate  = new Date(r.report_date);
    const planned  = tasks.length > 0
      ? tasks.reduce((s, t) => s + computePlannedPct(t.planned_start, t.planned_end, refDate), 0) / tasks.length
      : null;
    const actual   = r.overall_progress ?? 0;
    const spi      = planned && planned >= 1 ? Math.round(actual / planned * 100) / 100 : null;

    return {
      weekLabel:       `W${r.week_number}`,
      reportDate:      r.report_date,
      spi,
      overallProgress: actual,
      plannedAvg:      planned !== null ? Math.round(planned) : null,
    };
  });
}

/**
 * Get recent discrepancy records for a project from site_visit_discrepancies,
 * enriched with the site visit date.
 * Returns Array<{ wpId, delta, status, visitDate, contractorPct, sitePct }>
 */
export async function getDiscrepancyHistory(projectId, limit = 20) {
  // Fetch recent site visits for the project
  const { data: visits, error: vErr } = await supabase
    .from('site_visits')
    .select('id,visit_date')
    .eq('project_id', projectId)
    .order('visit_date', { ascending: false })
    .limit(limit);
  if (vErr) throw vErr;
  if (!visits || visits.length === 0) return [];

  const visitIds  = visits.map(v => v.id);
  const visitDate = Object.fromEntries(visits.map(v => [v.id, v.visit_date]));

  const { data: discs, error: dErr } = await supabase
    .from('site_visit_discrepancies')
    .select('*')
    .in('site_visit_id', visitIds)
    .order('site_visit_id', { ascending: false });
  if (dErr) throw dErr;

  return (discs || []).map(d => ({
    wpId:            d.wp_id,
    delta:           d.delta,
    status:          d.status,
    visitDate:       visitDate[d.site_visit_id] ?? null,
    contractorPct:   d.contractor_progress,
    sitePct:         d.site_visit_progress,
    siteVisitId:     d.site_visit_id,
  }));
}

/**
 * Get contractor reliability score for a given list of project IDs.
 * Score = 1 - (critical_discrepancies / total_discrepancies), per project.
 * Returns Map<projectId, { score, critical, warning, ok, total }>
 */
export async function getContractorReliability(projectIds) {
  if (!projectIds || projectIds.length === 0) return new Map();

  const { data: discs, error } = await supabase
    .from('site_visit_discrepancies')
    .select('project_id,status')
    .in('project_id', projectIds);
  if (error) throw error;

  const byProject = new Map();
  for (const d of discs || []) {
    if (!byProject.has(d.project_id)) byProject.set(d.project_id, { ok: 0, warning: 0, critical: 0 });
    const bucket = byProject.get(d.project_id);
    if      (d.status === 'critical') bucket.critical++;
    else if (d.status === 'warning')  bucket.warning++;
    else                              bucket.ok++;
  }

  const result = new Map();
  for (const pid of projectIds) {
    const b     = byProject.get(pid) || { ok: 0, warning: 0, critical: 0 };
    const total = b.ok + b.warning + b.critical;
    result.set(pid, {
      ...b,
      total,
      score: total > 0 ? Math.round((1 - b.critical / total) * 100) : null,
    });
  }
  return result;
}
