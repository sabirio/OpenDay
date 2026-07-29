// @ts-check
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

/** @typedef {import('../types').ProgressResult} ProgressResult */

/**
 * @typedef {object} Template
 * @property {Array<{id: string, label?: string, phaseId: string, duration_pct: number}>} [workPackages]
 * @property {Array<{id: string, label?: string, order?: number, progressWeight: number}>} [phases]
 * @property {number} [schemaVersion] present on Master Catalog (schemaVersion 2) templates only; routes resolveProjectProgressWeights() to the v2 formula
 * @property {Record<string, number>} [groupShares] Master Catalog only: precomputed baseline group (zone) shares
 * @property {object} [rawData] Master Catalog only: the raw schemaVersion 2 template.data, for weight-metadata validation
 */

import {
  WORK_PACKAGES as GANTT_TASKS,
  getPhasesInOrder,
} from '../config/masterTaskLibrary.js';
import { resolveProjectProgressWeights } from '../core/projects/weights/resolveProjectProgressWeights.js';
import { constructionRetailV1 } from '../domains/construction/templates/constructionRetailV1.js';
import { WP_STATUS_SCORES } from '../config/statusScores.js';

const PHASE_PROGRESS_WEIGHT = Object.fromEntries(
  constructionRetailV1.phases.map(p => [p.id, p.progressWeight])
);
import {
  estimateProgressFromStatuses,
  computeWPCumulativeStatuses,
  computeCumulativeStatuses,
} from '../utils/reportUtils.js';
import { computeExpectedPct } from '../utils/scheduleUtils.js';
import { computeCalendarSpi } from './spiEngine.js';
import { calculateProgressDelta } from './progressDeltaEngine.js';
import { SCHEDULE_CONFIG } from '../config/scheduleConfig.js';
import { sortReasons } from '../utils/reasonUtils.js';

// Builds { phaseId → { taskLabel → duration_pct } } from any WP array.
/** @param {Array<{id: string, label?: string, phaseId: string, duration_pct: number}>} wps */
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
/** @param {Template|null} [template] */
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
 * Clamp a raw progress value into the valid 0-100 range. Callers pass
 * already-numeric-coerced input — NaN handling is the caller's job (e.g.
 * adaptContractorReportToLegacy.js's toFiniteProgress boundary check).
 * @param {number} value
 * @returns {number}
 */
export function clampProgressPct(value) {
  return Math.min(100, Math.max(0, value));
}

/**
 * Magnitude of a schedule gap (pp) for "Ahead/Behind Xpp"-style display —
 * single source for a Math.abs() ProgressNarrative.jsx and ReportTruthBar.jsx
 * each reimplemented, and this engine's own "Behind" reason text below.
 */
export function formatScheduleGapPp(scheduleGap) {
  return Math.abs(scheduleGap);
}

/**
 * Count how many of a WP group's tasks are Completed / In Progress —
 * LegacyWPSection.jsx's group-header badge ("2/5", warn/done coloring).
 * @param {string[]} taskNames
 * @param {object} pkgStatuses — { [taskName]: { status } }
 */
export function countTasksByStatus(taskNames, pkgStatuses) {
  let completed = 0, inProgress = 0;
  for (const t of taskNames) {
    const status = pkgStatuses?.[t]?.status;
    if (status === 'Completed') completed++;
    else if (status === 'In Progress') inProgress++;
  }
  return { completed, inProgress };
}

/**
 * Extract 0-100 progress from a single Gantt task entry.
 * Prefers numeric `progress` field; falls back to status text.
 * @param {{progress?: number, status?: string}|null|undefined} entry
 * @returns {number}
 */
export function calculateActivityProgress(entry) {
  if (!entry) return 0;
  if (typeof entry.progress === 'number') return entry.progress;
  if (entry.status === 'Completed')   return 100;
  if (entry.status === 'In Progress') return 50;
  return 0;
}

/**
 * Default progress value implied by picking a Gantt-task status button
 * ('not_started'|'in_progress'|'completed'|'delayed'|'blocked' — the
 * project_gantt_tasks vocabulary, distinct from WP_STATUS_SCORES' status
 * strings). completed always implies 100, not_started always implies 0;
 * any other status leaves the existing progress value untouched.
 * Consolidates a rule GanttWPSection.jsx (contractor) and
 * GanttPMTaskRow.jsx (PM site-visit) each independently reimplemented
 * (architecture-conformance pass).
 * @param {string} status
 * @param {number} currentProgress — kept as-is for any non-terminal status
 * @returns {number}
 */
export function getDefaultProgressForGanttStatus(status, currentProgress) {
  if (status === 'completed')   return 100;
  if (status === 'not_started') return 0;
  return currentProgress;
}

/**
 * Effective 0-100 progress for one legacy (workPackages.js vocabulary) WP
 * task entry: an explicit numeric progress > 0 always wins; otherwise falls
 * back to the status's canonical WP_STATUS_SCORES score. This is
 * config/workPackages.js's computePackageProgress() "effective progress"
 * rule (`entry.progress > 0 ? entry.progress / 100 : score`), at single-task
 * granularity — used by buildContractorReportSubmission.js's legacy
 * (non-Gantt) WP-row synthesis, so contractor_report_wps.progress_pct
 * reflects the same status the contractor picked even though the legacy
 * task-row UI never sets a numeric progress value itself (unlike
 * calculateActivityProgress(), which is deliberately not reused here since
 * it treats an explicit 0 as "reported zero progress", not "unset").
 * @param {string} status
 * @param {number} [explicitProgress]
 * @returns {number}
 */
export function resolveLegacyTaskEffectiveProgressPct(status, explicitProgress) {
  if (explicitProgress > 0) return clampProgressPct(explicitProgress);
  return clampProgressPct((WP_STATUS_SCORES[status] ?? 0) * 100);
}

/**
 * Classifies a WP task status into a display tier, using the same score
 * cutoffs PhaseStepper.jsx/PhaseTimeline.jsx/sharedUtils.js independently
 * reimplemented (score>=1 done, >=0.5 good, >=0.3 warn, else muted) —
 * single source of truth so UI only maps tier -> color/glyph.
 * @param {string} status
 * @returns {'done'|'good'|'warn'|'muted'}
 */
export function getWPStatusTier(status) {
  const score = WP_STATUS_SCORES[status] ?? 0;
  if (score >= 1)   return 'done';
  if (score >= 0.5) return 'good';
  if (score >= 0.3) return 'warn';
  return 'muted';
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
 * @param {string} phaseId
 * @param {Record<string, {progress?: number, status?: string}>} taskMap
 * @param {Record<string, number>|null} [effectiveWeights]
 * @param {Template|null} [template]
 * @returns {{pct: number, count: number}}
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

/**
 * Weighted progress for one WP's own task list, using each task's own
 * `weight` field — distinct from calculatePhaseProgress(), which weights by
 * duration_pct/scope-derived effectiveWeights instead. This is the shape
 * PhaseStepper.jsx's per-phase progress cards need: legacy config/workPackages.js
 * WPs carry real per-task weights (e.g. 40/30/20/10), while masterTaskLibrary's
 * Gantt-format WPs give every task weight 1 (a plain average of that WP's tasks).
 * Tasks with no report entry, or a status with no defined score (e.g.
 * 'Not Applicable'), are excluded from both the numerator and denominator.
 *
 * @param {{id: string, tasks: Array<{name: string, weight?: number}>}} wp
 * @param {Record<string, Record<string, {status?: string, progress?: number}>>|null} mergedStatuses — { wp.id → { taskName → entry } }
 * @returns {number} 0-100
 */
export function calculateWPTaskWeightedProgress(wp, mergedStatuses) {
  const taskMap = mergedStatuses?.[wp.id] || {};
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
 * Plain (unweighted) average of `actual_progress` across a list of Gantt
 * tasks — used for GanttChart.jsx's collapsed phase-band summary bar (fill
 * width + "{phase} — {avg}%" label). Distinct from calculatePhaseProgress():
 * that operates on a { taskLabel → entry } status map with weighting;
 * this operates directly on laid-out Gantt task rows that already carry a
 * numeric `actual_progress` field, with no weighting at all.
 *
 * @param {Array<{actual_progress?: number|null}>} tasks — non-empty; callers
 *   already guard the empty case before calling (division by 0 would be NaN)
 * @returns {number} 0-100
 */
export function calculateGanttPhaseAverageProgress(tasks) {
  if (!tasks.length) return 0;
  return Math.round(tasks.reduce((s, t) => s + (t.actual_progress ?? 0), 0) / tasks.length);
}

/**
 * Plain (unweighted) average progress across a phase's Gantt tasks, preferring
 * an in-flight edit (`progressOverrides[t.id].progress_pct`, e.g. a contractor
 * dragging a slider before saving) over the task's last-saved `actual_progress`.
 * Used by GanttWPSection.jsx's collapsible phase header ("{phase} — {pct}%").
 * Distinct from calculateGanttPhaseAverageProgress(), which has no override
 * layer — this is specifically for a form still being edited.
 *
 * @param {Array<{id: string, actual_progress?: number|null}>} tasks
 * @param {Record<string, {progress_pct?: number}>} progressOverrides — { taskId → in-progress edit }
 * @returns {number} 0-100
 */
export function calculatePhaseAverageProgressWithOverrides(tasks, progressOverrides) {
  if (tasks.length === 0) return 0;
  return Math.round(
    tasks.reduce((sum, t) => {
      const e = progressOverrides[t.id];
      return sum + (e?.progress_pct ?? t.actual_progress ?? 0);
    }, 0) / tasks.length
  );
}

// ── Project level ─────────────────────────────────────────────────────────────

/**
 * Compute overall project progress from Gantt workPackageStatuses.
 *
 * @param {Record<string, Record<string, {progress?: number, status?: string}>>} wpStatuses  — { phaseId → { taskLabel → entry } }
 * @param {string[]|null} [scopeWPIds] - active WP id list; null = full scope
 * @param {Record<string, number>|null} [phaseWeightOverrides]
 * @param {Template|null} [template]
 * @returns {number} 0-100
 */
export function calculateProjectProgress(wpStatuses, scopeWPIds = null, phaseWeightOverrides = null, template = null) {
  const { workPackages, phaseWeights, phases: resolvedPhases } = resolveTemplate(template);
  const resolved = scopeWPIds ? resolveProjectProgressWeights({ template, workPackages, scopeWPIds, phaseWeights }) : null;
  const effectiveWeights = resolved?.effectiveWeights ?? null;
  // schemaVersion 2 derives phase weights fresh alongside effectiveWeights
  // (a category's contribution depends on exactly which WPs are selected);
  // schemaVersion 1 (resolved.phaseWeights === null) keeps the template's
  // own static phaseWeights untouched — byte-identical to before this change.
  const effectivePhaseWeights = resolved?.phaseWeights ?? phaseWeights;

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
      : (effectivePhaseWeights[phase.id] || 0);
    weightedSum += pct * w;
    weightTotal += w;
  }

  return weightTotal === 0 ? 0 : Math.round(weightedSum / weightTotal);
}

/**
 * Raw, unweighted average of a single report's per-WP progress percentages —
 * NOT the canonical phase-weighted project progress (calculateProjectProgress).
 * This becomes contractor_reports.overall_progress (P1.4): the "what the
 * contractor just submitted" signal, distinct from progress_history's
 * cumulative, phase-weighted number. Falls back to the caller-supplied
 * cumulative progress for legacy-format reports with no per-WP array at all.
 *
 * @param {Array<{progress_pct: number}>} wpProgressArray
 * @param {number} fallback — used when wpProgressArray is empty
 * @returns {number}
 */
export function calculateRawWPAverageProgress(wpProgressArray, fallback = 0) {
  if (!wpProgressArray.length) return fallback;
  return Math.round(
    wpProgressArray.reduce((sum, wp) => sum + wp.progress_pct, 0) / wpProgressArray.length
  );
}

// ── Full result ───────────────────────────────────────────────────────────────

/**
 * Progress value at a given index in a sorted report array.
 *
 * @param {Array<Record<string, any>>}  sortedReports — reports sorted oldest → newest
 * @param {number} index         — inclusive upper bound (0-based)
 * @param {string[]|null} [scopeWPIds] - active WP ids; null = full scope
 * @param {Template|null} [template]
 * @param {Record<string, number>|null} [phaseWeightOverrides]
 * @returns {number} 0-100
 */
export function progressAtIndex(sortedReports, index, scopeWPIds = null, template = null, phaseWeightOverrides = null) {
  const slice  = sortedReports.slice(0, index + 1);
  const wpCum  = computeWPCumulativeStatuses(slice);
  const legCum = computeCumulativeStatuses(slice);
  // Use report's snapshot weights if saved (prevents retroactive shifts on scope change).
  const snapshotScope = sortedReports[index]?.snapshotWeights
    ? null // snapshotWeights already encode scope; pass null so engine uses them directly
    : scopeWPIds;
  return calculateProjectProgressResult(wpCum, legCum, snapshotScope, template, phaseWeightOverrides).progress;
}

/**
 * Format-aware progress breakdown.
 *
 * @param {{workPackageStatuses?: Record<string, any>}|null} wpCumulative     — result of computeWPCumulativeStatuses()
 * @param {Record<string, any>|null} legacyCumulative — result of computeCumulativeStatuses()
 * @param {string[]|null} [scopeWPIds]     - active WP ids; null = full scope
 * @param {Template|null} [template]
 * @param {Record<string, number>|null} [phaseWeightOverrides]
 * @returns {ProgressResult}
 */
export function calculateProjectProgressResult(wpCumulative, legacyCumulative, scopeWPIds = null, template = null, phaseWeightOverrides = null) {
  if (wpCumulative?.workPackageStatuses) {
    const wpStatuses = wpCumulative.workPackageStatuses;
    const { workPackages, phaseWeights, phases: resolvedPhases } = resolveTemplate(template);
    const resolved = scopeWPIds ? resolveProjectProgressWeights({ template, workPackages, scopeWPIds, phaseWeights }) : null;
    const effectiveWeights = resolved?.effectiveWeights ?? null;
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
      progress: calculateProjectProgress(wpStatuses, scopeWPIds, phaseWeightOverrides, template),
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
 * @param {Record<string, any>} project        — project row (constructionStartDate, constructionEndDate, targetOpeningDate)
 * @param {number}      actualPct      — current overall progress (0-100)
 * @param {Array<Record<string, any>>} historyRows    — project.progressHistory (last 2 rows from progress_history table)
 * @param {typeof SCHEDULE_CONFIG}      [config]         - defaults to SCHEDULE_CONFIG
 * @param {Date|null}   [referenceDate]  - date to evaluate expectedPct against; null = today.
 *                                       Pass a past date to compute a historical comparison.
 * @returns {{ actualPct: number, expectedPct: number|null, scheduleGap: number|null, scheduleStatus: string|null, spi: number|null, deltaVsLastWeek: number|null, reasons: Array<Record<string, any>> }}
 */
export function calculateProgressComparison(project, actualPct, historyRows, config = SCHEDULE_CONFIG, referenceDate = null) {
  const ref = referenceDate instanceof Date ? referenceDate : new Date();

  const expectedPct = computeExpectedPct(project, ref);

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

  const spi = computeCalendarSpi(actualPct, expectedPct);

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
 * Compute current-week and previous-week progress comparisons from stored history.
 *
 * Graceful degradation: fewer than 2 history rows → prevProgressComparison = null
 * (commandEngine falls back to non-worsening 'warning', no crash).
 *
 * @param {Record<string, any>} project         — project row (dates needed by calculateProgressComparison)
 * @param {number}    currentProgress — live overall progress (0-100)
 * @param {Array<Record<string, any>>}     [progressHistory] - rows from progress_history table (any order)
 * @param {typeof SCHEDULE_CONFIG}    [config]          - defaults to SCHEDULE_CONFIG
 * @param {Date|null} [now]             - reference date; null = today
 * @returns {{ progressComparison: ReturnType<typeof calculateProgressComparison>, prevProgressComparison: ReturnType<typeof calculateProgressComparison>|null }}
 */
export function buildWeekOverWeekComparison(project, currentProgress, progressHistory = [], config = SCHEDULE_CONFIG, now = null) {
  const history = [...(progressHistory ?? [])]
    .filter(r => r && r.recorded_at)
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()); // oldest → newest

  const progressComparison = calculateProgressComparison(project, currentProgress, history.slice(-2), config, now);

  const prevRow = history.length >= 2 ? history[history.length - 2] : null;
  const prevProgressComparison = prevRow
    ? calculateProgressComparison(project, prevRow.overall_progress, history.slice(-3, -1), config, new Date(prevRow.recorded_at))
    : null;

  return { progressComparison, prevProgressComparison };
}

/**
 * Transforms project.progressHistory into a date-ordered series for the progress chart.
 * @param {Array<{recorded_at?: string, overall_progress?: number}>} progressHistory — rows from progress_history table
 * @returns {Array<{date: string, pct: number}>} oldest → newest
 */
export function computeProgressSeries(progressHistory) {
  if (!Array.isArray(progressHistory) || progressHistory.length === 0) return [];
  return [...progressHistory]
    .sort((a, b) => new Date(a.recorded_at ?? 0).getTime() - new Date(b.recorded_at ?? 0).getTime())
    .map(row => ({
      date: row.recorded_at?.slice(0, 10) ?? '',
      pct:  row.overall_progress ?? 0,
    }));
}
