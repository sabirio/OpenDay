import { WP_STATUS_SCORES } from '../config/statusScores.js';
import { getDefaultPhaseWeights } from '../config/masterTaskLibrary.js';

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

// Effective % for a single phase given its WP status map — mirrors PhaseStepper.wpProgress.
function phasePct(wp, statuses) {
  const taskMap = statuses?.[wp.id] || {};
  let totalWeight = 0, weightedScore = 0;
  for (const task of wp.tasks) {
    const entry = taskMap[task.name];
    if (!entry) continue;
    const score = WP_STATUS_SCORES[entry.status];
    if (score == null) continue;
    const eff = entry.progress > 0 ? entry.progress / 100 : score;
    totalWeight += task.weight ?? 1;
    weightedScore += (task.weight ?? 1) * eff;
  }
  return totalWeight === 0 ? 0 : Math.round((weightedScore / totalWeight) * 100);
}

/**
 * Classifies each phase as 'done' | 'current' | 'upcoming' and attaches a week-over-week
 * delta if prevMergedStatuses is supplied.
 *
 * @param {Array}  workPackages        — WORK_PACKAGES or GANTT_WORK_PACKAGES config
 * @param {object} mergedStatuses      — cumulative WP statuses at selected date
 * @param {object|null} prevMergedStatuses — cumulative WP statuses at previous report date
 * @returns {Array<{id, name, tasks, groups, pct, status, delta}>}
 */
export function classifyPhases(workPackages, mergedStatuses, prevMergedStatuses = null, scopePhaseIds = null, phaseWeights = null) {
  const inScope = id => !scopePhaseIds || scopePhaseIds.includes(id);
  const weights = phaseWeights ?? getDefaultPhaseWeights();

  const phases = workPackages.map(wp => {
    const pct     = phasePct(wp, mergedStatuses);
    const prevPct = prevMergedStatuses != null ? phasePct(wp, prevMergedStatuses) : null;
    return { ...wp, pct, prevPct };
  });

  // Current = first in-scope phase not yet complete; fallback to last in-scope phase.
  let currentIdx = phases.findIndex(p => inScope(p.id) && p.pct < 100);
  if (currentIdx === -1) {
    const inScopeIndices = phases.map((p, i) => inScope(p.id) ? i : -1).filter(i => i >= 0);
    currentIdx = inScopeIndices[inScopeIndices.length - 1] ?? phases.length - 1;
  }

  return phases.map((p, i) => {
    if (!inScope(p.id)) {
      return {
        id: p.id, name: p.name, tasks: p.tasks, groups: p.groups,
        pct: p.pct,
        status: 'out_of_scope',
        delta: null,
        weight: null,
      };
    }
    let status;
    if (p.pct === 100)         status = 'done';
    else if (i === currentIdx) status = 'current';
    else                       status = 'upcoming';
    return {
      id: p.id, name: p.name, tasks: p.tasks, groups: p.groups,
      pct: p.pct,
      status,
      delta: p.prevPct !== null ? p.pct - p.prevPct : null,
      weight: weights[p.id] ?? null,
    };
  });
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
