// Cascade Engine — propagates WP delays through the dependency graph.
// Pure functions; does NOT duplicate topological sort from ganttEngine.
// Works on tasks already fetched from DB (with earlyStart / earlyFinish / isCritical).
import { DEPENDENCY_RULES } from '../config/dependencyRules';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildSuccessorMap(dependencyRules, wpIds) {
  const idSet = new Set(wpIds);
  const map   = new Map();
  for (const rule of dependencyRules) {
    if (!idSet.has(rule.from) || !idSet.has(rule.to)) continue;
    if (!map.has(rule.from)) map.set(rule.from, []);
    map.get(rule.from).push({ to: rule.to, lag: rule.lag_days || 0 });
  }
  return map;
}

// Terminal WP ids — the last tasks before project handover
const TERMINAL_WP_IDS = ['handover.keys', 'handover.transfer', 'handover.inspection'];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Simulate delay propagation from one WP through all downstream dependencies.
 *
 * Takes ganttTasks as loaded from DB (earlyStart/earlyFinish already Date objects
 * as returned by getProjectGantt / getProjectGanttFull).
 *
 * @param {object[]} ganttTasks      — WP tasks from DB
 * @param {string}   delayedWpId    — ID of the WP that is delayed
 * @param {number}   delayDays      — number of days it slips
 * @param {object[]} [dependencyRules] — defaults to DEPENDENCY_RULES
 * @returns Cascade impact report
 */
export function computeCascadeImpact(ganttTasks, delayedWpId, delayDays, dependencyRules = DEPENDENCY_RULES) {
  const empty = {
    triggeredBy:          null,
    affectedWPs:          [],
    totalProjectDelay:    0,
    newForecastOpeningDate: null,
    criticalPathBreached: false,
    cascadeDepth:         0,
    message:              '',
  };

  if (!ganttTasks?.length || !delayedWpId || !delayDays || delayDays <= 0) return empty;

  const taskMap      = new Map(ganttTasks.map(wp => [wp.id, wp]));
  const delayedTask  = taskMap.get(delayedWpId);
  if (!delayedTask) return empty;

  const wpIds        = ganttTasks.map(wp => wp.id);
  const successors   = buildSuccessorMap(dependencyRules, wpIds);

  // BFS — propagate the delay forward through the graph
  const accumulated = new Map(); // wpId → max additional delay seen
  const depthMap    = new Map(); // wpId → cascade depth
  const queue       = [{ wpId: delayedWpId, delay: delayDays, depth: 0 }];
  accumulated.set(delayedWpId, delayDays);
  depthMap.set(delayedWpId, 0);

  let maxDepth             = 0;
  let criticalPathBreached = Boolean(delayedTask.isCritical);

  while (queue.length > 0) {
    const { wpId, delay, depth } = queue.shift();

    for (const { to } of (successors.get(wpId) || [])) {
      const toTask = taskMap.get(to);
      if (!toTask) continue;

      const prev = accumulated.get(to) || 0;
      if (delay > prev) {
        accumulated.set(to, delay);
        depthMap.set(to, depth + 1);
        if (depth + 1 > maxDepth) maxDepth = depth + 1;
        if (toTask.isCritical) criticalPathBreached = true;
        queue.push({ wpId: to, delay, depth: depth + 1 });
      }
    }
  }

  // Remove the trigger task from "affected" list (it's the source, not a downstream victim)
  accumulated.delete(delayedWpId);
  depthMap.delete(delayedWpId);

  // Build affectedWPs
  const affectedWPs = [];
  for (const [wpId, additionalDelay] of accumulated.entries()) {
    const task = taskMap.get(wpId);
    if (!task?.earlyFinish) continue;
    const originalEnd = task.earlyFinish instanceof Date ? task.earlyFinish : new Date(task.earlyFinish);
    affectedWPs.push({
      wpId,
      label:           task.label,
      phaseLabel:      task.phaseLabel,
      originalEnd,
      newEnd:          new Date(originalEnd.getTime() + additionalDelay * 86400000),
      additionalDelay,
      isCritical:      Boolean(task.isCritical),
    });
  }
  affectedWPs.sort((a, b) => a.originalEnd - b.originalEnd);

  // Total project delay: look at terminal tasks first, then max on critical path
  let totalProjectDelay = 0;
  for (const tid of TERMINAL_WP_IDS) {
    if (accumulated.has(tid)) totalProjectDelay = Math.max(totalProjectDelay, accumulated.get(tid));
  }
  if (totalProjectDelay === 0) {
    const critAffected = affectedWPs.filter(w => w.isCritical);
    if (critAffected.length > 0) {
      totalProjectDelay = Math.max(...critAffected.map(w => w.additionalDelay));
    } else if (delayedTask.isCritical) {
      totalProjectDelay = delayDays;
    }
  }

  // Forecast opening date (last task's earlyFinish + delay)
  let newForecastOpeningDate = null;
  const lastTask = [...ganttTasks]
    .filter(wp => wp.earlyFinish)
    .sort((a, b) => new Date(b.earlyFinish) - new Date(a.earlyFinish))[0];
  if (lastTask) {
    const base = lastTask.earlyFinish instanceof Date ? lastTask.earlyFinish : new Date(lastTask.earlyFinish);
    newForecastOpeningDate = new Date(base.getTime() + totalProjectDelay * 86400000);
  }

  // Human-readable cascade message
  let message = `${delayedTask.label} delayed ${delayDays}d`;
  const critChain = affectedWPs.filter(w => w.isCritical).slice(0, 3);
  if (critChain.length > 0) {
    message += ' → ' + critChain.map(w => `${w.label} (+${w.additionalDelay}d)`).join(' → ');
  }
  if (totalProjectDelay > 0) message += ` → opening delay ${totalProjectDelay} days`;

  return {
    triggeredBy:          { wpId: delayedWpId, label: delayedTask.label, delayDays },
    affectedWPs,
    totalProjectDelay,
    newForecastOpeningDate,
    criticalPathBreached,
    cascadeDepth:         maxDepth,
    message,
  };
}

/**
 * Scan all gantt tasks and return those that appear behind schedule.
 *
 * A task is considered delayed when:
 *   • it has started (earlyStart ≤ today)
 *   • it is not yet completed
 *   • actual_progress is more than 20 percentage points below expected progress
 *
 * @param {object[]} ganttTasks — WP tasks from DB
 * @returns Array of { wpId, label, estimatedDelayDays, progressGap } sorted by severity
 */
export function detectCurrentDelays(ganttTasks) {
  if (!ganttTasks?.length) return [];

  const today   = new Date();
  const delays  = [];

  for (const wp of ganttTasks) {
    if (!wp.earlyStart || !wp.earlyFinish) continue;
    if ((wp.actual_progress || 0) >= 100)  continue;
    if (wp.status === 'completed')          continue;

    const start = wp.earlyStart instanceof Date ? wp.earlyStart : new Date(wp.earlyStart);
    if (start > today) continue; // hasn't started yet

    const finish       = wp.earlyFinish instanceof Date ? wp.earlyFinish : new Date(wp.earlyFinish);
    const taskDuration = Math.max(1, Math.ceil((finish - start) / 86400000));
    const elapsedDays  = Math.min(taskDuration, Math.ceil((today - start) / 86400000));
    const expectedPct  = Math.min(100, Math.round((elapsedDays / taskDuration) * 100));
    const actualPct    = wp.actual_progress || 0;
    const progressGap  = expectedPct - actualPct;

    if (progressGap > 20) {
      const estimatedDelayDays = Math.round((progressGap / 100) * taskDuration);
      delays.push({ wpId: wp.id, label: wp.label, estimatedDelayDays, progressGap });
    }
  }

  return delays.sort((a, b) => b.estimatedDelayDays - a.estimatedDelayDays);
}
