/**
 * progressEngine.js — Single source of truth for all progress calculations.
 *
 * Three-level API:
 *   calculateActivityProgress(entry)          → 0-100 for a single task entry
 *   calculatePhaseProgress(phaseId, taskMap)  → { pct, count } for one WP/phase
 *   calculateProjectProgress(wpStatuses)      → 0-100 overall (Gantt format)
 *   calculateProjectProgressResult(wpCum, legCum) → { progress, format, phases }
 *
 * Weighting:
 *   Within each phase: tasks are weighted by duration_pct from masterTaskLibrary.
 *   Tasks not defined in the library (custom) fall back to equal weight.
 *   Across phases: simple average — all phases contribute equally.
 *
 * Format detection:
 *   'gantt'  — workPackageStatuses: { phaseId → { taskLabel → { progress, status } } }
 *   'legacy' — demolitionStatus / constructionStatuses / testingStatuses / handoverStatuses
 *   'none'   — no usable data
 */

import { WORK_PACKAGES as GANTT_TASKS, getPhasesInOrder } from '../config/masterTaskLibrary';
import {
  estimateProgressFromStatuses,
  computeWPCumulativeStatuses,
  computeCumulativeStatuses,
} from '../utils/reportUtils';

// Build a lookup map: { phaseId → { taskLabel → duration_pct } }
// duration_pct values within each phase sum to ~1.0 (ready-to-use weights).
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
 * Tasks are weighted by duration_pct from masterTaskLibrary.
 * Custom tasks (not in the library) get equal weight to the average library task.
 * Returns { pct: 0-100, count: number }.
 */
export function calculatePhaseProgress(phaseId, taskMap) {
  const entries = Object.entries(taskMap || {});
  if (entries.length === 0) return { pct: 0, count: 0 };

  const phaseWeights = TASK_WEIGHTS[phaseId] || {};
  let weightedSum = 0;
  let totalWeight = 0;

  // Separate known (have duration_pct) from unknown (custom) tasks
  const knownEntries   = entries.filter(([label]) => phaseWeights[label] != null);
  const unknownEntries = entries.filter(([label]) => phaseWeights[label] == null);

  for (const [label, entry] of knownEntries) {
    const w = phaseWeights[label];
    weightedSum += calculateActivityProgress(entry) * w;
    totalWeight += w;
  }

  // Unknown tasks share equal weight equal to the average known-task weight
  if (unknownEntries.length > 0) {
    const fallbackW = knownEntries.length > 0
      ? totalWeight / knownEntries.length
      : 1;
    for (const [, entry] of unknownEntries) {
      weightedSum += calculateActivityProgress(entry) * fallbackW;
      totalWeight += fallbackW;
    }
  }

  return {
    pct:   totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0,
    count: entries.length,
  };
}

// ── Project level ─────────────────────────────────────────────────────────────

/**
 * Compute overall project progress from Gantt workPackageStatuses.
 * Phase progress is duration_pct-weighted internally; phases contribute equally
 * to the project total (simple average across phases that have data).
 * Returns 0-100.
 */
export function calculateProjectProgress(wpStatuses) {
  const phases = getPhasesInOrder();
  let phaseSum = 0, phaseCount = 0;

  for (const phase of phases) {
    const taskMap = wpStatuses?.[phase.id] || {};
    const { pct, count } = calculatePhaseProgress(phase.id, taskMap);
    if (count === 0) continue;
    phaseSum += pct;
    phaseCount++;
  }

  return phaseCount === 0 ? 0 : Math.round(phaseSum / phaseCount);
}

// ── Full result ───────────────────────────────────────────────────────────────

/**
 * Progress value at a given index in a sorted report array.
 * Drop-in replacement for the reportUtils version — uses weighted Gantt calculation
 * instead of the flat average, so EVM and Monte Carlo get accurate earned-value points.
 *
 * @param {Array}  sortedReports — reports sorted oldest → newest
 * @param {number} index         — inclusive upper bound (0-based)
 * @returns {number} 0-100
 */
export function progressAtIndex(sortedReports, index) {
  const slice  = sortedReports.slice(0, index + 1);
  const wpCum  = computeWPCumulativeStatuses(slice);
  const legCum = computeCumulativeStatuses(slice);
  return calculateProjectProgressResult(wpCum, legCum).progress;
}

/**
 * Format-aware progress breakdown.
 *
 * @param {object|null} wpCumulative   — result of computeWPCumulativeStatuses()
 * @param {object|null} legacyCumulative — result of computeCumulativeStatuses()
 * @returns {{ progress: number, format: 'gantt'|'legacy'|'none', phases: Array }}
 *
 * phases entries: { id, name, pct, count }
 */
export function calculateProjectProgressResult(wpCumulative, legacyCumulative) {
  if (wpCumulative?.workPackageStatuses) {
    const wpStatuses = wpCumulative.workPackageStatuses;
    const phases = getPhasesInOrder()
      .map(phase => {
        const { pct, count } = calculatePhaseProgress(phase.id, wpStatuses[phase.id] || {});
        if (count === 0) return null;
        return { id: phase.id, name: phase.label, pct, count };
      })
      .filter(Boolean);
    return {
      format: 'gantt',
      progress: calculateProjectProgress(wpStatuses),
      phases,
    };
  }

  if (legacyCumulative) {
    return {
      format: 'legacy',
      progress: estimateProgressFromStatuses(legacyCumulative),
      phases: [],
    };
  }

  return { format: 'none', progress: 0, phases: [] };
}
