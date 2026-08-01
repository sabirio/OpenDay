import { useEffect, useState } from 'react';
import { loadScheduleCommitmentProjection } from '../core/contractorSchedule/loadScheduleCommitmentProjection.js';
import { buildUnavailableProjection } from '../core/schedule/scheduleCommitmentBatchProjection.js';

const EMPTY_PROJECTION = new Map();

/**
 * Simplification Phase 3D.1 (live approved-commitment projection) — the ONE
 * hook every bulk row consumer (useAllRows, useContractorWorkspace) calls to
 * get real schedule commitment facts for a CONTRACTOR_MANAGED project's
 * Approved Baseline, instead of the conservative "no lifecycle status
 * available" default the engines otherwise fall back to.
 *
 * loadScheduleCommitmentProjection() already converts its own query
 * failures into explicit per-project UNAVAILABLE entries (Projection
 * Completeness Hardening) rather than rejecting — the .catch() below is a
 * residual safety net for anything unexpected upstream of that (e.g. a
 * malformed `projects` argument), and produces the SAME explicit
 * UNAVAILABLE shape rather than a silently-empty Map, so a consumer can
 * never mistake "we don't know" for "confirmed no version" here either.
 *
 * The transient window before the first fetch resolves still returns the
 * empty Map — a missing entry there means "not loaded yet", not "unknown
 * forever"; it self-corrects within one effect cycle and every consumer
 * already treats a missing entry the same conservative way (AUTO_GENERATED
 * unaffected, CONTRACTOR_MANAGED reads as NOT_YET_COMMITTED) until it does.
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
      .catch(() => { if (alive) setProjection(buildUnavailableProjection(projects)); });
    return () => { alive = false; };
  }, [projects]);

  return projection;
}
