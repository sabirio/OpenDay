/**
 * progressEngine.js — Single source of truth for all progress calculations.
 *
 * Three-level API:
 *   calculateActivityProgress(entry)                          → 0-100 for a single task entry
 *   calculatePhaseProgress(phaseId, taskMap, ew?)            → { pct, count } for one WP/phase
 *   calculateProjectProgress(wpStatuses, scopeWPIds?)        → 0-100 overall (Gantt format)
 *   calculateProjectProgressResult(wpCum, legCum, scope?)    → { progress, format, phases }
 *
 * Weighting:
 *   Without scope: tasks weighted by duration_pct; phases contribute equally (simple average).
 *   With scope:    computeEffectiveWeights() normalises weights across only the active WPs;
 *                  inactive phases/WPs are excluded from calculations.
 *
 * Format detection:
 *   'gantt'  — workPackageStatuses: { phaseId → { taskLabel → { progress, status } } }
 *   'legacy' — demolitionStatus / constructionStatuses / testingStatuses / handoverStatuses
 *   'none'   — no usable data
 */

import {
  WORK_PACKAGES as GANTT_TASKS,
  getPhasesInOrder,
  computeEffectiveWeights,
} from '../config/masterTaskLibrary';
import {
  estimateProgressFromStatuses,
  computeWPCumulativeStatuses,
  computeCumulativeStatuses,
} from '../utils/reportUtils';

// Build a lookup: { phaseId → { taskLabel → duration_pct } } — used when no scope is set.
const TASK_WEIGHTS = {};
for (const task of GANTT_TASKS) {
  if (!TASK_WEIGHTS[task.phaseId]) TASK_WEIGHTS[task.phaseId] = {};
  TASK_WEIGHTS[task.phaseId][task.label] = task.duration_pct;
}

// ── Activity level ────────────────────────────────────────────────────────────

/**
 * Extract 0-100 progress from a single Gantt task entry.
 * Prefers numeric `progress` field; falls back to status text.
 */
export function calculateActivityProgress(entry) {
  if (!entry) return 0;
  if (typeof entry.progress === 'number') return entry.progress;
  if (entry.status === 'Completed')   return 100;
  if (entry.status === 'In Progress') return 50;
  return 0;
}

// ── Phase level ───────────────────────────────────────────────────────────────

/**
 * Compute progress for a single Gantt phase/WP.
 *
 * @param {string} phaseId
 * @param {object} taskMap        — { taskLabel → { progress, status } }
 * @param {object|null} effectiveWeights — { wpId → weight } from computeEffectiveWeights().
 *   When provided, only tasks whose WP is active in scope are counted and weights are
 *   taken from this map (already normalised). When null, falls back to TASK_WEIGHTS.
 *
 * Returns { pct: 0-100, count: number }.
 */
export function calculatePhaseProgress(phaseId, taskMap, effectiveWeights = null) {
  const entries = Object.entries(taskMap || {});
  if (entries.length === 0) return { pct: 0, count: 0 };

  let phaseWeights;
  let filteredEntries;

  if (effectiveWeights) {
    // Build { taskLabel → effectiveWeight } for this phase from the scoped weight map.
    phaseWeights = {};
    for (const task of GANTT_TASKS) {
      if (task.phaseId === phaseId && effectiveWeights[task.id] != null) {
        phaseWeights[task.label] = effectiveWeights[task.id];
      }
    }
    // Only include tasks that are active in scope.
    filteredEntries = entries.filter(([label]) => phaseWeights[label] != null);
    if (filteredEntries.length === 0) return { pct: 0, count: 0 };
  } else {
    phaseWeights = TASK_WEIGHTS[phaseId] || {};
    filteredEntries = entries; // no scope filter — include all entries
  }

  let weightedSum = 0;
  let totalWeight = 0;

  const knownEntries   = filteredEntries.filter(([label]) => phaseWeights[label] != null);
  const unknownEntries = effectiveWeights
    ? [] // when scope is active, custom tasks outside scope are excluded
    : filteredEntries.filter(([label]) => phaseWeights[label] == null);

  for (const [label, entry] of knownEntries) {
    const w = phaseWeights[label];
    weightedSum += calculateActivityProgress(entry) * w;
    totalWeight += w;
  }

  if (unknownEntries.length > 0) {
    const fallbackW = knownEntries.length > 0 ? totalWeight / knownEntries.length : 1;
    for (const [, entry] of unknownEntries) {
      weightedSum += calculateActivityProgress(entry) * fallbackW;
      totalWeight += fallbackW;
    }
  }

  return {
    pct:   totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0,
    count: knownEntries.length + unknownEntries.length,
  };
}

// ── Project level ─────────────────────────────────────────────────────────────

/**
 * Compute overall project progress from Gantt workPackageStatuses.
 *
 * @param {object} wpStatuses  — { phaseId → { taskLabel → entry } }
 * @param {string[]|null} scopeWPIds — active WP id list; null = full scope
 * Returns 0-100.
 */
export function calculateProjectProgress(wpStatuses, scopeWPIds = null) {
  const effectiveWeights = scopeWPIds ? computeEffectiveWeights(scopeWPIds) : null;

  // Determine which phases to visit (all phases if no scope, else only those with active WPs).
  const activePhaseIds = effectiveWeights
    ? new Set(Object.keys(effectiveWeights).map(id => GANTT_TASKS.find(t => t.id === id)?.phaseId).filter(Boolean))
    : null;

  const phases = getPhasesInOrder().filter(p => !activePhaseIds || activePhaseIds.has(p.id));

  let phaseSum = 0, phaseCount = 0;
  for (const phase of phases) {
    const taskMap = wpStatuses?.[phase.id] || {};
    const { pct, count } = calculatePhaseProgress(phase.id, taskMap, effectiveWeights);
    if (count === 0) continue;
    phaseSum += pct;
    phaseCount++;
  }

  return phaseCount === 0 ? 0 : Math.round(phaseSum / phaseCount);
}

// ── Full result ───────────────────────────────────────────────────────────────

/**
 * Progress value at a given index in a sorted report array.
 *
 * @param {Array}  sortedReports — reports sorted oldest → newest
 * @param {number} index         — inclusive upper bound (0-based)
 * @param {string[]|null} scopeWPIds — active WP ids; null = full scope
 * @returns {number} 0-100
 */
export function progressAtIndex(sortedReports, index, scopeWPIds = null) {
  const slice  = sortedReports.slice(0, index + 1);
  const wpCum  = computeWPCumulativeStatuses(slice);
  const legCum = computeCumulativeStatuses(slice);
  // Use report's snapshot weights if saved (prevents retroactive shifts on scope change).
  const snapshotScope = sortedReports[index]?.snapshotWeights
    ? null // snapshotWeights already encode scope; pass null so engine uses them directly
    : scopeWPIds;
  return calculateProjectProgressResult(wpCum, legCum, snapshotScope).progress;
}

/**
 * Format-aware progress breakdown.
 *
 * @param {object|null} wpCumulative     — result of computeWPCumulativeStatuses()
 * @param {object|null} legacyCumulative — result of computeCumulativeStatuses()
 * @param {string[]|null} scopeWPIds     — active WP ids; null = full scope
 * @returns {{ progress: number, format: 'gantt'|'legacy'|'none', phases: Array }}
 */
export function calculateProjectProgressResult(wpCumulative, legacyCumulative, scopeWPIds = null) {
  if (wpCumulative?.workPackageStatuses) {
    const wpStatuses = wpCumulative.workPackageStatuses;
    const effectiveWeights = scopeWPIds ? computeEffectiveWeights(scopeWPIds) : null;
    const activePhaseIds = effectiveWeights
      ? new Set(Object.keys(effectiveWeights).map(id => GANTT_TASKS.find(t => t.id === id)?.phaseId).filter(Boolean))
      : null;

    const phases = getPhasesInOrder()
      .filter(p => !activePhaseIds || activePhaseIds.has(p.id))
      .map(phase => {
        const { pct, count } = calculatePhaseProgress(phase.id, wpStatuses[phase.id] || {}, effectiveWeights);
        if (count === 0) return null;
        return { id: phase.id, name: phase.label, pct, count };
      })
      .filter(Boolean);

    return {
      format:   'gantt',
      progress: calculateProjectProgress(wpStatuses, scopeWPIds),
      phases,
    };
  }

  if (legacyCumulative) {
    return {
      format:   'legacy',
      progress: estimateProgressFromStatuses(legacyCumulative),
      phases:   [],
    };
  }

  return { format: 'none', progress: 0, phases: [] };
}
