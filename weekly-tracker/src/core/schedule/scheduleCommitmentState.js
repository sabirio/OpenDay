// Canonical schedule commitment state (Simplification Phase 3D.1) — the ONE
// mapping from schedule ownership mode + contractor schedule lifecycle
// status to "has a real, execution-relevant schedule commitment actually
// been made for this project yet." Every engine that would otherwise
// fabricate risk/readiness/report-obligation signals from the mere absence
// of Contractor Reports or scheduled Gantt dates must consult this — never
// re-derive its own ownership-mode/lifecycle check.
//
// Canonical principle this exists to protect (Phase 3D.1 audit, Section B):
//   NO COMMITMENT YET ≠ COMMITMENT MISSED.
// An AUTO_GENERATED project always has a plan the instant it's created, so
// it is always COMMITTED. A CONTRACTOR_MANAGED project has no real
// commitment until its Contractor's submitted schedule has been PM-approved
// — before that, the project is either still being drafted (NOT_YET_COMMITTED)
// or awaiting a PM decision on a real, immutable, but not-yet-accepted
// proposal (PROPOSED). CHANGES_REQUESTED collapses back to
// NOT_YET_COMMITTED because the Draft (and Scope) are editable again at
// that point — same as before any submission ever happened — even though
// the two are presented differently to the user (see the presentation
// adapter, which is a separate, later-layer concern from this file).
import { SCHEDULE_OWNERSHIP_MODE } from './scheduleOwnershipMode.js';

export const SCHEDULE_COMMITMENT_STATE = Object.freeze({
  NOT_YET_COMMITTED: 'NOT_YET_COMMITTED',
  PROPOSED: 'PROPOSED',
  COMMITTED: 'COMMITTED',
});

// Input vocabulary for contractorScheduleLifecycleStatus: the DISPLAY-level
// submission status (DRAFT/PENDING_REVIEW/CHANGES_REQUESTED/APPROVED —
// scheduleSubmissionReadModel.js's deriveSubmissionDisplayStatus() output,
// with 'NONE' i.e. "never submitted" passed in as 'DRAFT'), NOT the
// collapsed 3-value SQL contractor_schedule_lifecycle_status() capability
// status — that function deliberately collapses "never submitted" and
// "CHANGES_REQUESTED" into the same DRAFT capability value, which is
// correct for edit-permission purposes but insufficient here, since this
// mapping must distinguish them for callers that care (even though both
// currently resolve to the same commitment state below).
const CONTRACTOR_MANAGED_LIFECYCLE_TO_COMMITMENT = Object.freeze({
  DRAFT: SCHEDULE_COMMITMENT_STATE.NOT_YET_COMMITTED,
  CHANGES_REQUESTED: SCHEDULE_COMMITMENT_STATE.NOT_YET_COMMITTED,
  PENDING_REVIEW: SCHEDULE_COMMITMENT_STATE.PROPOSED,
  APPROVED: SCHEDULE_COMMITMENT_STATE.COMMITTED,
});

/**
 * Pure. No UI wording, no date calculations, no database calls.
 * @param {{ scheduleOwnershipMode: string, contractorScheduleLifecycleStatus?: string }} facts
 * @returns {'NOT_YET_COMMITTED'|'PROPOSED'|'COMMITTED'}
 */
export function deriveScheduleCommitmentState({ scheduleOwnershipMode, contractorScheduleLifecycleStatus } = {}) {
  if (scheduleOwnershipMode !== SCHEDULE_OWNERSHIP_MODE.CONTRACTOR_MANAGED) {
    // AUTO_GENERATED — and, defensively, any other/missing value, since the
    // DB column is CHECK-constrained to exactly these two modes and every
    // read path already defaults a null column to AUTO_GENERATED
    // (projectService.js's fromDB()) — is always COMMITTED. This is the
    // one branch that guarantees zero behavior change for every existing
    // project (Phase 3D.1 Section H).
    return SCHEDULE_COMMITMENT_STATE.COMMITTED;
  }

  const mapped = CONTRACTOR_MANAGED_LIFECYCLE_TO_COMMITMENT[contractorScheduleLifecycleStatus];
  // Fail safe: an unrecognized/missing contractor lifecycle status for a
  // CONTRACTOR_MANAGED project must never be silently treated as
  // COMMITTED — that would be exactly the kind of fabricated-confidence
  // bug this phase exists to remove.
  return mapped ?? SCHEDULE_COMMITMENT_STATE.NOT_YET_COMMITTED;
}
