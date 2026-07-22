import { calculatePhaseAverageProgressWithOverrides } from '../../engines/progressEngine.js';

// Same canonical averaging formula Contractor Report's ganttWPSectionModel.js
// uses (calculatePhaseAverageProgressWithOverrides) — just fed PM-observed
// overrides instead of GC-entered ones. pmWpObservations is keyed by
// observed_progress (Site Visit's field name); the engine expects
// progress_pct (Contractor's field name), so this is a field-name adapter
// only, not a second calculation.
export function buildSiteVisitPhaseSectionModel(tasks, pmWpObservations) {
  const overrides = {};
  for (const task of tasks) {
    const entry = pmWpObservations?.[task.id];
    if (entry && entry.observed_progress != null) {
      overrides[task.id] = { progress_pct: entry.observed_progress };
    }
  }
  const phasePct = calculatePhaseAverageProgressWithOverrides(tasks, overrides);
  return { phasePct, allComplete: phasePct === 100 };
}
