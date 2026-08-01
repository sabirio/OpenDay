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
import { SCHEDULE_OWNERSHIP_MODE } from '../schedule/scheduleOwnershipMode.js';

const CONTRACTOR_MANAGED_STATUS_LABEL = Object.freeze({
  DRAFT: 'Awaiting Contractor Schedule',
  PENDING_REVIEW: 'Awaiting PM Review',
  CHANGES_REQUESTED: 'Schedule Changes Required',
});

/**
 * @param {object} facts
 * @param {string|null} [facts.scheduleOwnershipMode]
 * @param {string|null} [facts.contractorScheduleLifecycleStatus] — DISPLAY-level
 *   submission status (DRAFT/PENDING_REVIEW/CHANGES_REQUESTED/APPROVED, with
 *   'NONE' passed as 'DRAFT' — same vocabulary as
 *   scheduleCommitmentState.js's deriveScheduleCommitmentState()). Omitted/
 *   unrecognized falls back to the DRAFT label — the same conservative
 *   default deriveScheduleCommitmentState() itself uses.
 * @param {string} facts.readinessStatus — computeOpeningReadiness().status
 * @returns {string}
 */
export function deriveOpeningStatusLabel({ scheduleOwnershipMode = null, contractorScheduleLifecycleStatus = null, readinessStatus }) {
  if (scheduleOwnershipMode !== SCHEDULE_OWNERSHIP_MODE.CONTRACTOR_MANAGED) return readinessStatus;
  if (contractorScheduleLifecycleStatus === 'APPROVED') return readinessStatus;
  return CONTRACTOR_MANAGED_STATUS_LABEL[contractorScheduleLifecycleStatus] ?? CONTRACTOR_MANAGED_STATUS_LABEL.DRAFT;
}
