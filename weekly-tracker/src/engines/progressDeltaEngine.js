import { WP_STATUS_SCORES } from '../config/workPackages';

// Effective % for a single task entry — mirrors PhaseStepper.wpProgress logic.
function taskEffectivePct(entry) {
  if (!entry) return 0;
  if (entry.progress > 0) return entry.progress;
  const score = WP_STATUS_SCORES[entry.status] ?? 0;
  return score * 100;
}

/**
 * Returns per-task delta between current and previous cumulative WP status maps.
 *
 * @param {object} currentStatuses  — mergedStatuses for the selected report date
 * @param {object|null} prevStatuses — mergedStatuses for the previous report date; null = first report
 * @returns {object|null} — { [wpId]: { [taskName]: { isNew: bool, delta: number|null } } }
 *                          null when prevStatuses is null (nothing to compare against)
 */
export function calculateWorkPackageDeltas(currentStatuses, prevStatuses) {
  if (!prevStatuses) return null;
  const result = {};
  for (const [wpId, tasks] of Object.entries(currentStatuses || {})) {
    result[wpId] = {};
    for (const taskName of Object.keys(tasks || {})) {
      const prevEntry = prevStatuses?.[wpId]?.[taskName];
      if (!prevEntry) {
        result[wpId][taskName] = { isNew: true, delta: null };
      } else {
        const curPct  = taskEffectivePct(tasks[taskName]);
        const prevPct = taskEffectivePct(prevEntry);
        result[wpId][taskName] = { isNew: false, delta: Math.round(curPct - prevPct) };
      }
    }
  }
  return result;
}

/**
 * Returns a per-phase boolean flag: true if any task in that phase has a positive delta.
 * Used to render the "changed this week" dot on phase tiles without tile-level math.
 *
 * @param {object|null} wpDeltas — output of calculateWorkPackageDeltas
 * @returns {object|null} — { [wpId]: boolean } or null when wpDeltas is null
 */
export function computePhaseChangeFlags(wpDeltas) {
  if (!wpDeltas) return null;
  const flags = {};
  for (const [wpId, tasks] of Object.entries(wpDeltas)) {
    flags[wpId] = Object.values(tasks).some(t => !t.isNew && t.delta > 0);
  }
  return flags;
}

// Returns delta between latest and previous week snapshot for a project
export function calculateProgressDelta(currentProgress, historyRows) {
  if (!historyRows || historyRows.length < 2) return null;
  const sorted = [...historyRows].sort((a, b) =>
    new Date(b.recorded_at) - new Date(a.recorded_at)
  );
  const prev = sorted[1].overall_progress ?? 0;
  const delta = currentProgress - prev;
  return {
    delta: +delta.toFixed(1),
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    label: delta > 0 ? `↑ +${delta.toFixed(1)}%` : delta < 0 ? `↓ ${delta.toFixed(1)}%` : '→ no change',
  };
}
