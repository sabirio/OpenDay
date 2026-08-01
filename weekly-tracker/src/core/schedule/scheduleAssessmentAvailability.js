// Canonical assessment-availability vocabulary (Simplification Phase 3D.1) —
// shared by every engine (Opening Readiness, Risk, Project Health) that must
// distinguish "I evaluated this and it is genuinely fine" from "there is
// nothing real to evaluate yet." Both engines return the SAME existing
// result shape they always have — this only adds two optional fields to
// that shape (assessmentAvailability, reasonCode) rather than introducing a
// new parallel return type, so existing consumers reading the pre-existing
// fields are unaffected.
//
// A NOT_ASSESSABLE result must never carry a fabricated numeric
// score/status (0, 'Critical', etc.) — see each engine's own not-assessable
// branch for the exact neutral values it returns.
import { SCHEDULE_COMMITMENT_STATE } from './scheduleCommitmentState.js';

export const ASSESSMENT_AVAILABILITY = Object.freeze({
  ASSESSABLE: 'ASSESSABLE',
  NOT_ASSESSABLE: 'NOT_ASSESSABLE',
});

export const ASSESSMENT_REASON_CODE = Object.freeze({
  AWAITING_SCHEDULE_COMMITMENT: 'AWAITING_SCHEDULE_COMMITMENT',
});

/**
 * A project can only be meaningfully assessed for schedule-derived
 * risk/readiness/health once a real commitment exists (COMMITTED) — a
 * proposal awaiting PM decision (PROPOSED) is still not a commitment: the
 * PM could return it via Request Changes, so nothing about it should be
 * treated as execution reality yet.
 * @param {'NOT_YET_COMMITTED'|'PROPOSED'|'COMMITTED'} commitmentState
 * @returns {'ASSESSABLE'|'NOT_ASSESSABLE'}
 */
export function deriveAssessmentAvailability(commitmentState) {
  return commitmentState === SCHEDULE_COMMITMENT_STATE.COMMITTED
    ? ASSESSMENT_AVAILABILITY.ASSESSABLE
    : ASSESSMENT_AVAILABILITY.NOT_ASSESSABLE;
}
