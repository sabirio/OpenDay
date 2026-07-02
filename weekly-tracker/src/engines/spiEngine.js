// Pure SPI / schedule-performance calculations.
// Extracted from ganttService.js so they are testable without Supabase.
// ganttService imports these and wires them to DB calls.

/**
 * Fraction (0–100) of a task that is planned to be complete by referenceDate,
 * based on its planned_start → planned_end window.
 */
export function computePlannedPct(plannedStart, plannedEnd, referenceDate = new Date()) {
  const start = new Date(plannedStart);
  const end   = new Date(plannedEnd);
  const ref   = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (isNaN(start) || isNaN(end) || end <= start) return 100;
  if (ref <= start) return 0;
  if (ref >= end)   return 100;
  return Math.min(100, (ref - start) / (end - start) * 100);
}

/**
 * Portfolio-level SPI: average(actual_progress) / average(planned_progress).
 *
 * Stale-Gantt guard: when sumActual === 0 AND avgPlanned >= 80, the Gantt
 * table has likely had actual_progress wiped (e.g. by generateAndSaveGantt on
 * a project that already has contractor-submitted progress). In that state
 * SPI = 0 / large = 0.00, which is not a schedule-performance signal — it's a
 * data-absence signal. Return null ("no usable Gantt data") instead, so
 * getSPIStatus() maps it to 'no_schedule' rather than 'critical'.
 *
 * The guard only fires when the entire active task set reports 0 actual_progress
 * AND the schedule is well advanced (≥80% of planned window consumed). It does
 * NOT suppress genuine early-project SPI (avgPlanned < 80 → SPI still returned).
 *
 * @param {object[]} tasks         rows from project_gantt_tasks
 * @param {Date}     referenceDate defaults to today
 * @returns {number|null}
 */
export function computeSPIFromTasks(tasks, referenceDate = new Date()) {
  const active = tasks.filter(t => !t.is_archived);
  if (active.length === 0) return null;
  let sumActual = 0, sumPlanned = 0;
  for (const t of active) {
    sumActual  += (t.actual_progress ?? 0);
    sumPlanned += computePlannedPct(t.planned_start, t.planned_end, referenceDate);
  }
  const avgPlanned = sumPlanned / active.length;
  if (avgPlanned < 1) return null;
  if (sumActual === 0 && avgPlanned >= 80) return null;
  return Math.round((sumActual / sumPlanned) * 100) / 100;
}

/**
 * How many critical-path tasks are behind plan.
 * @returns {{ total, behind, ratio, label }}
 */
export function computeCriticalHealth(tasks, referenceDate = new Date()) {
  const critical = tasks.filter(t => t.is_critical && !t.is_archived);
  if (critical.length === 0) return { total: 0, behind: 0, ratio: 0, label: 'healthy' };
  const behind = critical.filter(t => {
    const planned = computePlannedPct(t.planned_start, t.planned_end, referenceDate);
    return (t.actual_progress ?? 0) < planned - 5;
  }).length;
  return {
    total: critical.length,
    behind,
    ratio: behind / critical.length,
    label: behind === 0 ? 'healthy' : behind / critical.length <= 0.5 ? 'warning' : 'critical',
  };
}
