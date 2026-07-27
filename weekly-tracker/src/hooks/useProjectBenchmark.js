import { useMemo } from 'react';
import { buildProjectBenchmarkCards } from '../core/presentation/projectBenchmarkModel.js';

/**
 * useProjectBenchmark — Project Benchmark UI's only path to Historical Data
 * Foundation / Benchmark Engine (pages/components must never import engines/
 * directly). Pure, synchronous, in-memory computation — no async boundary,
 * no fetch, so this is a plain memoized read, not a loading-state hook.
 * Recomputes only when the target project or the authorized project
 * collection actually changes (e.g. a save updates `projects`), never on
 * every unrelated re-render.
 *
 * @param {object} project - canonical target project
 * @param {object[]} projects - the caller's already-authorized project collection
 * @returns {object[]} 5 benchmark card view models
 */
export function useProjectBenchmark(project, projects) {
  return useMemo(
    () => buildProjectBenchmarkCards(project, projects),
    [project, projects]
  );
}
