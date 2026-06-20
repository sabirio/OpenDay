import { computeEffectiveWeights } from '../weights/computeEffectiveWeights.js';
import { explainProgress } from './explainProgress.js';

// Same contract as progressEngine.calculateActivityProgress:
// numeric progress wins; status text fallback Completed=100 / In Progress=50 / else 0.
function resolveActivityProgress(entry) {
  if (!entry) return 0;
  if (typeof entry.progress === 'number') return entry.progress;
  if (entry.status === 'Completed')   return 100;
  if (entry.status === 'In Progress') return 50;
  return 0;
}

/**
 * Convert raw workPackageStatuses (keyed by label) to { wpId: 0-100 }.
 * Requires template.workPackages to carry a `label` field for the mapping.
 * WPs without a matching label entry in wpStatuses are simply absent from the result.
 *
 * @param {{ [phaseId]: { [label]: { progress, status } } }} wpStatuses
 * @param {{ workPackages: Array<{ id, phaseId, label }> }} template
 * @returns {{ [wpId]: number }}
 */
export function taskProgressFromStatuses(wpStatuses, template) {
  const wps = template?.workPackages ?? [];
  const result = {};
  for (const wp of wps) {
    const phaseMap = wpStatuses?.[wp.phaseId];
    if (!phaseMap) continue;
    const label = wp.label ?? wp.id;
    const entry = phaseMap[label];
    if (entry !== undefined) {
      result[wp.id] = resolveActivityProgress(entry);
    }
  }
  return result;
}

/**
 * Reconstruct attribution from a stored progress_history row.
 * Uses snapshot.effective_weights (frozen at save time) — version-proof.
 *
 * @param {object} historyRow   — progress_history row with .snapshot and .overall_progress
 * @param {object} taskProgress — { wpId: 0-100 }, typically from taskProgressFromStatuses()
 * @param {object} template     — { phases, workPackages } for WP metadata / byPhase ordering
 */
export function explainFromSnapshot(historyRow, taskProgress, template) {
  const effectiveWeights = historyRow?.snapshot?.effective_weights ?? {};
  const officialTotal    = historyRow?.overall_progress ?? null;
  const workPackages     = template?.workPackages ?? [];
  const phases           = template?.phases ?? [];
  return explainProgress({ effectiveWeights, taskProgress, workPackages, phases, officialTotal });
}

/**
 * Reconstruct attribution for the current (live) state of a project.
 * Derives effectiveWeights from scratch via computeEffectiveWeights — the same
 * source of truth as progressEngine — so results are always consistent.
 *
 * @param {object}        template      — { phases:[{id,progressWeight}], workPackages:[{id,phaseId,...}] }
 * @param {string[]|null} scopeWPIds    — active WP id list; null = full scope
 * @param {object}        taskProgress  — { wpId: 0-100 }
 * @param {number|null}   officialTotal — authoritative % from progressEngine (optional drift check)
 */
export function explainLive(template, scopeWPIds, taskProgress, officialTotal = null) {
  const workPackages = template?.workPackages ?? [];
  const phases       = template?.phases ?? [];
  const phaseWeights = Object.fromEntries(phases.map(p => [p.id, p.progressWeight ?? 0]));
  const effectiveWeights = computeEffectiveWeights(workPackages, scopeWPIds, phaseWeights);
  return explainProgress({ effectiveWeights, taskProgress, workPackages, phases, officialTotal });
}
