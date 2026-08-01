// openingStatusLabel.js — Simplification Phase 3D.1, Section 11.
//
// Presentation-only label for the Opening Readiness status shown on
// Dashboard/ProjectCard/StatusMatrix. Never recalculates a score — it only
// decides which WORDS describe a status the engines already computed.
//
// For a CONTRACTOR_MANAGED project before its schedule is Approved,
// openingReadinessEngine.js's own status is the neutral technical
// 'Not Assessable' (see scheduleAssessmentAvailability.js) — that's correct
// for engines, but too generic for a PM glancing at a status column. This
// adapter replaces it with commitment-stage-specific copy. Once APPROVED
// (or for any AUTO_GENERATED project, which is always COMMITTED), the
// existing Ready/At Risk/Critical/etc. vocabulary passes through unchanged.
//
// Projection Completeness Hardening: when the live batch projection could
// not be confirmed (scheduleProjectionAvailability === 'UNAVAILABLE'),
// contractorScheduleLifecycleStatus is null — without this explicit check,
// that null would fall through to the DRAFT label below, confidently
// presenting "Awaiting Contractor Schedule" for a project whose real
// lifecycle status is genuinely unknown (the fetch failed), not confirmed
// DRAFT. UNAVAILABLE is checked before any lifecycle-status branch, and
// wins regardless of scheduleOwnershipMode.
import { SCHEDULE_OWNERSHIP_MODE } from '../schedule/scheduleOwnershipMode.js';

const CONTRACTOR_MANAGED_STATUS_LABEL = Object.freeze({
  DRAFT: 'Awaiting Contractor Schedule',
  PENDING_REVIEW: 'Awaiting PM Review',
  CHANGES_REQUESTED: 'Schedule Changes Required',
});

export const SCHEDULE_STATUS_UNAVAILABLE_LABEL = 'Schedule status unavailable';

/**
 * @param {object} facts
 * @param {string|null} [facts.scheduleOwnershipMode]
 * @param {string|null} [facts.contractorScheduleLifecycleStatus] — DISPLAY-level
 *   submission status (DRAFT/PENDING_REVIEW/CHANGES_REQUESTED/APPROVED, with
 *   'NONE' passed as 'DRAFT' — same vocabulary as
 *   scheduleCommitmentState.js's deriveScheduleCommitmentState()). Omitted/
 *   unrecognized falls back to the DRAFT label — the same conservative
 *   default deriveScheduleCommitmentState() itself uses.
 * @param {string|null} [facts.scheduleProjectionAvailability] — 'AVAILABLE'|'UNAVAILABLE'|null
 *   from the live batch projection (scheduleCommitmentBatchProjection.js).
 *   'UNAVAILABLE' always wins: never infer a lifecycle label from data that
 *   could not be confirmed.
 * @param {string} facts.readinessStatus — computeOpeningReadiness().status
 * @returns {string}
 */
export function deriveOpeningStatusLabel({ scheduleOwnershipMode = null, contractorScheduleLifecycleStatus = null, scheduleProjectionAvailability = null, readinessStatus }) {
  if (scheduleProjectionAvailability === 'UNAVAILABLE') return SCHEDULE_STATUS_UNAVAILABLE_LABEL;
  if (scheduleOwnershipMode !== SCHEDULE_OWNERSHIP_MODE.CONTRACTOR_MANAGED) return readinessStatus;
  if (contractorScheduleLifecycleStatus === 'APPROVED') return readinessStatus;
  return CONTRACTOR_MANAGED_STATUS_LABEL[contractorScheduleLifecycleStatus] ?? CONTRACTOR_MANAGED_STATUS_LABEL.DRAFT;
}
