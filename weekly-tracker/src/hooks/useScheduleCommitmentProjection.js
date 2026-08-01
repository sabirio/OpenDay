import { useEffect, useState } from 'react';
import { loadScheduleCommitmentProjection } from '../core/contractorSchedule/loadScheduleCommitmentProjection.js';

const EMPTY_PROJECTION = new Map();

/**
 * Simplification Phase 3D.1 (live approved-commitment projection) — the ONE
 * hook every bulk row consumer (useAllRows, useContractorWorkspace) calls to
 * get real schedule commitment facts for a CONTRACTOR_MANAGED project's
 * Approved Baseline, instead of the conservative "no lifecycle status
 * available" default the engines otherwise fall back to.
 *
 * While loading (or on fetch failure), returns the empty Map — every
 * consumer already treats a missing projection entry the same way it
 * treats "no lifecycle status supplied at all": AUTO_GENERATED is
 * unaffected, CONTRACTOR_MANAGED conservatively reads as NOT_YET_COMMITTED
 * (never falsely COMMITTED) until the real facts resolve.
 * @param {Array} projects
 * @returns {Map<string, object>}
 */
export function useScheduleCommitmentProjection(projects) {
  const [projection, setProjection] = useState(EMPTY_PROJECTION);

  useEffect(() => {
    let alive = true;
    if (!projects || projects.length === 0) {
      setProjection(EMPTY_PROJECTION);
      return undefined;
    }
    loadScheduleCommitmentProjection(projects)
      .then((next) => { if (alive) setProjection(next); })
      .catch(() => { if (alive) setProjection(EMPTY_PROJECTION); });
    return () => { alive = false; };
  }, [projects]);

  return projection;
}
