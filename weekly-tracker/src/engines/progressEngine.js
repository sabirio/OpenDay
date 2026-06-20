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
} from '../config/masterTaskLibrary.js';
import { computeEffectiveWeights } from '../core/projects/index.js';
import { constructionRetailV1 } from '../domains/construction/templates/constructionRetailV1.js';

const PHASE_PROGRESS_WEIGHT = Object.fromEntries(
  constructionRetailV1.phases.map(p => [p.id, p.progressWeight])
);
import {
  estimateProgressFromStatuses,
  computeWPCumulativeStatuses,
  computeCumulativeStatuses,
  DAY_MS,
} from '../utils/reportUtils.js';
import { calculateProgressDelta } from './progressDeltaEngine.js';
import { SCHEDULE_CONFIG } from '../config/scheduleConfig.js';
import { sortReasons } from '../utils/reasonUtils.js';

// Builds { phaseId → { taskLabel → duration_pct } } from any WP array.
function buildTaskWeights(wps) {
  const map = {};
  for (const task of wps) {
    if (!map[task.phaseId]) map[task.phaseId] = {};
    map[task.phaseId][task.label] = task.duration_pct;
  }
  return map;
}

// Lazy-initialized lookup for the static built-in WPs.
// Lazy to avoid Rolldown scope-hoisting TDZ when GANTT_TASKS is accessed before masterTaskLibrary exports resolve.
let _taskWeights = null;
function getTaskWeights() {
  if (!_taskWeights) _taskWeights = buildTaskWeights(GANTT_TASKS);
  return _taskWeights;
}

// Resolve workPackages + phaseWeights + ordered phases from an optional template.
// A null/undefined template falls back to the static built-in values — behavior is byte-identical.
function resolveTemplate(template) {
  const workPackages = template?.workPackages?.length ? template.workPackages : GANTT_TASKS;
  const phaseWeights = template?.phases?.length
    ? Object.fromEntries(template.phases.map(p => [p.id, p.progressWeight]))
    : PHASE_PROGRESS_WEIGHT;
  const phases = template?.phases?.length ? template.phases : getPhasesInOrder();
  return { workPackages, phaseWeights, phases };
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
export function calculatePhaseProgress(phaseId, taskMap, effectiveWeights = null, template = null) {
  const entries = Object.entries(taskMap || {});
  if (entries.length === 0) return { pct: 0, count: 0 };

  const { workPackages } = resolveTemplate(template);
  const taskWeightsMap = template ? buildTaskWeights(workPackages) : getTaskWeights();

  let phaseWeights;
  let filteredEntries;

  if (effectiveWeights) {
    // Build { taskLabel → effectiveWeight } for this phase from the scoped weight map.
    phaseWeights = {};
    for (const task of workPackages) {
      if (task.phaseId === phaseId && effectiveWeights[task.id] != null) {
        phaseWeights[task.label] = effectiveWeights[task.id];
      }
    }
    // Only include tasks that are active in scope.
    filteredEntries = entries.filter(([label]) => phaseWeights[label] != null);
    if (filteredEntries.length === 0) return { pct: 0, count: 0 };
  } else {
    phaseWeights = taskWeightsMap[phaseId] || {};
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
export function calculateProjectProgress(wpStatuses, scopeWPIds = null, phaseWeightOverrides = null, template = null) {
  const { workPackages, phaseWeights, phases: resolvedPhases } = resolveTemplate(template);
  const effectiveWeights = scopeWPIds ? computeEffectiveWeights(workPackages, scopeWPIds, phaseWeights) : null;

  // Determine which phases to visit (all phases if no scope, else only those with active WPs).
  const activePhaseIds = effectiveWeights
    ? new Set(Object.keys(effectiveWeights).map(id => workPackages.find(t => t.id === id)?.phaseId).filter(Boolean))
    : null;

  const phases = resolvedPhases.filter(p => !activePhaseIds || activePhaseIds.has(p.id));

  let weightedSum = 0, weightTotal = 0;
  for (const phase of phases) {
    const taskMap = wpStatuses?.[phase.id] || {};
    const { pct, count } = calculatePhaseProgress(phase.id, taskMap, effectiveWeights, template);
    if (count === 0) continue;
    const w = (phaseWeightOverrides && phaseWeightOverrides[phase.id] != null)
      ? phaseWeightOverrides[phase.id]
      : (phaseWeights[phase.id] || 0);
    weightedSum += pct * w;
    weightTotal += w;
  }

  return weightTotal === 0 ? 0 : Math.round(weightedSum / weightTotal);
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
export function progressAtIndex(sortedReports, index, scopeWPIds = null, template = null) {
  const slice  = sortedReports.slice(0, index + 1);
  const wpCum  = computeWPCumulativeStatuses(slice);
  const legCum = computeCumulativeStatuses(slice);
  // Use report's snapshot weights if saved (prevents retroactive shifts on scope change).
  const snapshotScope = sortedReports[index]?.snapshotWeights
    ? null // snapshotWeights already encode scope; pass null so engine uses them directly
    : scopeWPIds;
  return calculateProjectProgressResult(wpCum, legCum, snapshotScope, template).progress;
}

/**
 * Format-aware progress breakdown.
 *
 * @param {object|null} wpCumulative     — result of computeWPCumulativeStatuses()
 * @param {object|null} legacyCumulative — result of computeCumulativeStatuses()
 * @param {string[]|null} scopeWPIds     — active WP ids; null = full scope
 * @returns {{ progress: number, format: 'gantt'|'legacy'|'none', phases: Array }}
 */
export function calculateProjectProgressResult(wpCumulative, legacyCumulative, scopeWPIds = null, template = null) {
  if (wpCumulative?.workPackageStatuses) {
    const wpStatuses = wpCumulative.workPackageStatuses;
    const { workPackages, phaseWeights, phases: resolvedPhases } = resolveTemplate(template);
    const effectiveWeights = scopeWPIds ? computeEffectiveWeights(workPackages, scopeWPIds, phaseWeights) : null;
    const activePhaseIds = effectiveWeights
      ? new Set(Object.keys(effectiveWeights).map(id => workPackages.find(t => t.id === id)?.phaseId).filter(Boolean))
      : null;

    const phases = resolvedPhases
      .filter(p => !activePhaseIds || activePhaseIds.has(p.id))
      .map(phase => {
        const { pct, count } = calculatePhaseProgress(phase.id, wpStatuses[phase.id] || {}, effectiveWeights, template);
        if (count === 0) return null;
        return { id: phase.id, name: phase.label ?? phase.id, pct, count };
      })
      .filter(Boolean);

    return {
      format:   'gantt',
      progress: calculateProjectProgress(wpStatuses, scopeWPIds, null, template),
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

// ── Schedule comparison ───────────────────────────────────────────────────────

/**
 * Compute all comparison fields for a single project.
 *
 * expectedPct uses linear time interpolation:
 *   elapsed_days / total_days × 100
 * where total = constructionStartDate → constructionEndDate (or targetOpeningDate).
 * This matches the formula used in riskEngine.computeScheduleDeviation and evmEngine.
 *
 * @param {object}      project        — project row (constructionStartDate, constructionEndDate, targetOpeningDate)
 * @param {number}      actualPct      — current overall progress (0-100)
 * @param {Array}       historyRows    — project.progressHistory (last 2 rows from progress_history table)
 * @param {object}      config         — defaults to SCHEDULE_CONFIG
 * @param {Date|null}   referenceDate  — date to evaluate expectedPct against; null = today.
 *                                       Pass a past date to compute a historical comparison.
 * @returns {{ actualPct, expectedPct, scheduleGap, scheduleStatus, deltaVsLastWeek }}
 */
export function calculateProgressComparison(project, actualPct, historyRows, config = SCHEDULE_CONFIG, referenceDate = null) {
  const ref   = referenceDate instanceof Date ? referenceDate : new Date();
  const start = project.constructionStartDate ? new Date(project.constructionStartDate) : null;
  const end   = project.constructionEndDate
    ? new Date(project.constructionEndDate)
    : project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;

  let expectedPct = null;
  if (start && end && end > start) {
    const totalDays   = Math.ceil((end - start) / DAY_MS);
    const elapsedDays = Math.max(0, Math.ceil((ref - start) / DAY_MS));
    expectedPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
  }

  const scheduleGap = expectedPct !== null ? actualPct - expectedPct : null;

  let scheduleStatus = null;
  if (scheduleGap !== null) {
    if      (scheduleGap >=  config.aheadThreshold)  scheduleStatus = 'ahead';
    else if (scheduleGap <= -config.behindThreshold)  scheduleStatus = 'behind';
    else                                              scheduleStatus = 'on_track';
  }

  const delta = calculateProgressDelta(actualPct, historyRows);

  const reasons = [];
  if (scheduleGap !== null) {
    if (scheduleStatus === 'ahead') {
      reasons.push({ type: 'positive', text: `Ahead ${scheduleGap}pp vs plan (actual ${actualPct}%, expected ${expectedPct}%)`, source: 'schedule' });
    } else if (scheduleStatus === 'behind') {
      reasons.push({ type: 'warning', text: `Behind ${Math.abs(scheduleGap)}pp vs plan (actual ${actualPct}%, expected ${expectedPct}%)`, source: 'schedule' });
    } else {
      reasons.push({ type: 'neutral', text: `On track (actual ${actualPct}%, expected ${expectedPct}%)`, source: 'schedule' });
    }
  } else {
    reasons.push({ type: 'neutral', text: 'No schedule baseline — start/end dates not set', source: 'schedule' });
  }
  if (delta !== null) {
    if (delta.delta > 0) {
      reasons.push({ type: 'positive', text: `+${delta.delta}% progress since last week`, source: 'progress' });
    } else if (delta.delta < 0) {
      reasons.push({ type: 'warning', text: `${delta.delta}% progress since last week`, source: 'progress' });
    } else {
      reasons.push({ type: 'neutral', text: 'No change since last week', source: 'progress' });
    }
  }

  const spi = expectedPct != null && expectedPct > 0
    ? +(actualPct / expectedPct).toFixed(2)
    : null;

  return {
    actualPct,
    expectedPct,
    scheduleGap,
    scheduleStatus,
    spi,
    deltaVsLastWeek: delta?.delta ?? null,
    reasons: sortReasons(reasons),
  };
}

/**
 * Transforms project.progressHistory into a date-ordered series for the progress chart.
 * @param {Array} progressHistory — rows from progress_history table
 * @returns {Array<{date: string, pct: number}>} oldest → newest
 */
export function computeProgressSeries(progressHistory) {
  if (!Array.isArray(progressHistory) || progressHistory.length === 0) return [];
  return [...progressHistory]
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
    .map(row => ({
      date: row.recorded_at?.slice(0, 10) ?? '',
      pct:  row.overall_progress ?? 0,
    }));
}
