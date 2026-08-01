// reportDueStateEngine.js — Simplification Phase 3D.1, Section 8.
//
// Canonical weekly-report obligation state. Mirrors the existing
// deriveDueState() precedent in engines/snagReadModelEngine.js (a 4-state
// due-model driven off a reference date), applied to the report-cadence
// question instead of a stored due date.
//
// Canonical principle (Phase 3D.1 Section B): NO COMMITMENT YET ≠
// COMMITMENT MISSED. A CONTRACTOR_MANAGED project has no reporting
// obligation at all until its schedule is COMMITTED (Approved Baseline) —
// isMissingReport()'s unconditional "!latestReport -> true" is correct only
// once that obligation actually exists.
//
// AUTO_GENERATED projects preserve the pre-3D.1 isMissingReport() behavior
// byte-for-byte via an explicit legacy branch — no grace period is added to
// any existing project.
import { daysSince } from '../utils/reportUtils.js';
import { SCHEDULE_OWNERSHIP_MODE } from '../core/schedule/scheduleOwnershipMode.js';
import { SCHEDULE_COMMITMENT_STATE } from '../core/schedule/scheduleCommitmentState.js';

export const REPORT_DUE_STATE = Object.freeze({
  NOT_YET_DUE: 'NOT_YET_DUE',
  DUE: 'DUE',
  OVERDUE: 'OVERDUE',
  RECEIVED: 'RECEIVED',
});

const REPORT_CADENCE_DAYS = 7;

function latestReportDate(latestReport) {
  return latestReport?.reportingDate || latestReport?.submittedAt || null;
}

// AUTO_GENERATED legacy branch — must stay identical to
// utils/reportUtils.js::isMissingReport(), just re-expressed as a 4-state
// result instead of a boolean. No "day zero" grace period: a report-free
// project is OVERDUE the instant it's evaluated, exactly as before.
function deriveLegacyReportDueState(latestReport, referenceDate) {
  if (!latestReport) return REPORT_DUE_STATE.OVERDUE;
  const days = daysSince(latestReportDate(latestReport), referenceDate);
  return days > REPORT_CADENCE_DAYS ? REPORT_DUE_STATE.OVERDUE : REPORT_DUE_STATE.RECEIVED;
}

/**
 * Pure. No UI wording, no database calls.
 * @param {object} facts
 * @param {string} facts.scheduleOwnershipMode
 * @param {string} facts.commitmentState - SCHEDULE_COMMITMENT_STATE value
 * @param {string|Date|null} [facts.commitmentEstablishedAt] - Approved Baseline reviewed_at
 * @param {string|Date|null} [facts.firstCommittedPlannedStart] - earliest planned_start in that baseline
 * @param {object|null} [facts.latestReport] - has reportingDate or submittedAt
 * @param {string|Date} [facts.referenceDate]
 * @returns {'NOT_YET_DUE'|'DUE'|'OVERDUE'|'RECEIVED'}
 */
export function deriveReportDueState({
  scheduleOwnershipMode,
  commitmentState,
  commitmentEstablishedAt = null,
  firstCommittedPlannedStart = null,
  latestReport = null,
  referenceDate = new Date(),
} = {}) {
  if (scheduleOwnershipMode !== SCHEDULE_OWNERSHIP_MODE.CONTRACTOR_MANAGED) {
    return deriveLegacyReportDueState(latestReport, referenceDate);
  }

  if (commitmentState !== SCHEDULE_COMMITMENT_STATE.COMMITTED) {
    return REPORT_DUE_STATE.NOT_YET_DUE;
  }

  // Obligation start = max(baseline approval, earliest committed planned
  // start) — a late PM approval never backdates the obligation to the
  // plan's own start date, and a future planned start never creates an
  // obligation before committed execution actually begins.
  const obligationCandidates = [commitmentEstablishedAt, firstCommittedPlannedStart]
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  if (obligationCandidates.length === 0) {
    // A COMMITTED state should always carry both timestamps in practice.
    // Fail safe rather than fabricate an obligation start of "now."
    return REPORT_DUE_STATE.NOT_YET_DUE;
  }
  const obligationStart = Math.max(...obligationCandidates);
  const refTime = new Date(referenceDate).getTime();
  if (refTime < obligationStart) return REPORT_DUE_STATE.NOT_YET_DUE;

  if (!latestReport) {
    const elapsed = daysSince(new Date(obligationStart).toISOString(), referenceDate);
    return elapsed > REPORT_CADENCE_DAYS ? REPORT_DUE_STATE.OVERDUE : REPORT_DUE_STATE.DUE;
  }

  const daysSinceLatest = daysSince(latestReportDate(latestReport), referenceDate);
  return daysSinceLatest > REPORT_CADENCE_DAYS ? REPORT_DUE_STATE.OVERDUE : REPORT_DUE_STATE.RECEIVED;
}
