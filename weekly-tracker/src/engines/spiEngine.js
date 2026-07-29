// @ts-check
// Pure SPI / schedule-performance calculations.
// Extracted from ganttService.js so they are testable without Supabase.
// ganttService imports these and wires them to DB calls.

/** @typedef {import('../types').CriticalHealth} CriticalHealth */
/**
 * @typedef {object} GanttTask
 * @property {string} [wp_id]
 * @property {boolean} [is_archived]
 * @property {boolean} [is_critical]
 * @property {number|null} [actual_progress]
 * @property {string|Date|null} [planned_start]
 * @property {string|Date|null} [planned_end]
 */

/**
 * Calendar SPI: actualPct / expectedPct (time-based progress ratio).
 *
 * Distinct from Gantt SPI (computeSPIFromTasks), which averages
 * actual_progress / planned_progress across individual task date windows.
 * This function measures how far actual project progress is relative to the
 * linear time expectation (from computeExpectedPct / scheduleUtils).
 *
 * @param {number}      actualPct   — actual project progress (0–100)
 * @param {number|null} expectedPct — planned progress at reference date (0–100)
 * @returns {number|null} SPI rounded to 2dp, or null when expectedPct is unavailable/zero
 */
export function computeCalendarSpi(actualPct, expectedPct) {
  if (expectedPct == null || expectedPct <= 0) return null;
  return Math.round((actualPct / expectedPct) * 100) / 100;
}

/**
 * Fraction (0–100) of a task that is planned to be complete by referenceDate,
 * based on its planned_start → planned_end window.
 *
 * A task with no schedule (planned_start or planned_end missing) has no
 * planned percentage at all — this must stay distinct from 0%/100%. Do not
 * coerce a missing date with `new Date(null)`: that resolves to a *valid*
 * 1970-01-01 epoch Date rather than Invalid Date, which would silently make
 * an unscheduled task look 100%-planned-complete.
 *
 * @param {string|Date|null|undefined} plannedStart
 * @param {string|Date|null|undefined} plannedEnd
 * @param {Date} [referenceDate]
 * @returns {number|null} null when the task has no valid planned schedule
 */
export function computePlannedPct(plannedStart, plannedEnd, referenceDate = new Date()) {
  if (plannedStart == null || plannedEnd == null) return null;
  const start = new Date(/** @type {string|Date} */ (plannedStart));
  const end   = new Date(/** @type {string|Date} */ (plannedEnd));
  const ref   = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 100;
  if (ref <= start) return 0;
  if (ref >= end)   return 100;
  return Math.min(100, (ref.getTime() - start.getTime()) / (end.getTime() - start.getTime()) * 100);
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
 * Unscheduled tasks (no planned_start/planned_end) are excluded from this
 * calculation entirely — they have no plan to compare against, so neither
 * their actual_progress nor a fabricated planned percentage should move the
 * ratio. A project whose active tasks are all unscheduled has no schedule
 * signal yet and returns null, same as an empty task list.
 *
 * @param {GanttTask[]}   tasks         rows from project_gantt_tasks
 * @param {Date}          referenceDate defaults to today
 * @param {string[]|null} scopeWPIds    active WP ids from getScopeWPIds(project.scope, ...);
 *                                      null = no scope filter (all non-archived tasks).
 *                                      is_archived alone is NOT a reliable scope proxy —
 *                                      removing a WP from scope does not archive its row.
 * @returns {number|null}
 */
export function computeSPIFromTasks(tasks, referenceDate = new Date(), scopeWPIds = null) {
  const active = tasks.filter(t => !t.is_archived && (!scopeWPIds || scopeWPIds.includes(/** @type {string} */ (t.wp_id))));
  if (active.length === 0) return null;
  let sumActual = 0, sumPlanned = 0, scheduledCount = 0;
  for (const t of active) {
    const planned = computePlannedPct(t.planned_start, t.planned_end, referenceDate);
    if (planned == null) continue;
    sumActual  += (t.actual_progress ?? 0);
    sumPlanned += planned;
    scheduledCount++;
  }
  if (scheduledCount === 0) return null;
  const avgPlanned = sumPlanned / scheduledCount;
  if (avgPlanned < 1) return null;
  if (sumActual === 0 && avgPlanned >= 80) return null;
  return Math.round((sumActual / sumPlanned) * 100) / 100;
}

/**
 * How many critical-path tasks are behind plan.
 *
 * An unscheduled critical task (no planned_start/planned_end) has no plan to
 * be behind or ahead of, so it is excluded from total/behind/ratio the same
 * way computeSPIFromTasks excludes unscheduled tasks — it is neither
 * "healthy" nor "behind", it is simply not part of the schedule-based signal
 * yet. A critical set that is entirely unscheduled resolves to the same
 * zeroed/healthy shape as "no critical tasks" (existing consumers already
 * treat total === 0 as their own "no data" branch, see GanttSpiTab.jsx).
 *
 * @param {GanttTask[]}   tasks         rows from project_gantt_tasks
 * @param {Date}          referenceDate defaults to today
 * @param {string[]|null} scopeWPIds    active WP ids from getScopeWPIds(project.scope, ...);
 *                                      null = no scope filter. See computeSPIFromTasks note.
 * @returns {CriticalHealth}
 */
export function computeCriticalHealth(tasks, referenceDate = new Date(), scopeWPIds = null) {
  const critical = tasks
    .filter(t => t.is_critical && !t.is_archived && (!scopeWPIds || scopeWPIds.includes(/** @type {string} */ (t.wp_id))))
    .filter(t => computePlannedPct(t.planned_start, t.planned_end, referenceDate) != null);
  if (critical.length === 0) return { total: 0, behind: 0, ratio: 0, label: 'healthy' };
  const behind = critical.filter(t => {
    const planned = /** @type {number} */ (computePlannedPct(t.planned_start, t.planned_end, referenceDate));
    return (t.actual_progress ?? 0) < planned - 5;
  }).length;
  return {
    total: critical.length,
    behind,
    ratio: behind / critical.length,
    label: behind === 0 ? 'healthy' : behind / critical.length <= 0.5 ? 'warning' : 'critical',
  };
}

export function computeProjectTrendPoints(reports = [], tasks = []) {
  const activeTasks = (tasks || []).filter(t => !t.is_archived);

  return (reports || []).map(r => {
    const refDate = new Date(r.report_date ?? r.reportingDate);
    // Unscheduled tasks (computePlannedPct → null) are excluded from the
    // average, not counted as 0 — same rationale as computeSPIFromTasks.
    const scheduledPcts = activeTasks
      .map(t => computePlannedPct(t.planned_start, t.planned_end, refDate))
      .filter(pct => pct != null);
    const planned = scheduledPcts.length > 0
      ? scheduledPcts.reduce((s, pct) => s + pct, 0) / scheduledPcts.length
      : null;
    const actual = r.overall_progress ?? r.overallProgress ?? 0;
    const spi    = planned && planned >= 1 ? Math.round(actual / planned * 100) / 100 : null;
    return {
      weekLabel:       `W${r.week_number ?? r.weekNumber}`,
      reportDate:      r.report_date ?? r.reportingDate,
      spi,
      overallProgress: actual,
      plannedAvg:      planned !== null ? Math.round(planned) : null,
    };
  });
}
