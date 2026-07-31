// Pure numbering formulas for the Contractor Schedule Submission lifecycle
// (Simplification Phase 4B.1). Mirrors, and must stay consistent with, the
// server-side authoritative numbering in
// 049_contractor_schedule_submission_lifecycle.sql's submit_contractor_schedule
// and approve_schedule_submission RPCs — these are for optimistic
// client-side display only, never authoritative (the persisted number the
// RPC returns always wins).

/**
 * Mirrors submit_contractor_schedule's own numbering:
 * COALESCE(max(submission_number), 0) + 1.
 * @param {Array<number>} existingSubmissionNumbers
 * @returns {number}
 */
export function computeNextSubmissionNumber(existingSubmissionNumbers = []) {
  if (existingSubmissionNumbers.length === 0) return 1;
  return Math.max(...existingSubmissionNumbers) + 1;
}

/**
 * Mirrors approve_schedule_submission's own numbering:
 * COALESCE(max(baseline_revision_number), 0) + 1, ignoring null/undefined
 * entries the same way COALESCE(max(...), 0) does (a column that is null
 * for every PENDING_REVIEW/CHANGES_REQUESTED row).
 * @param {Array<number|null|undefined>} existingBaselineRevisionNumbers
 * @returns {number}
 */
export function computeNextBaselineRevisionNumber(existingBaselineRevisionNumbers = []) {
  const assigned = existingBaselineRevisionNumbers.filter((n) => n != null);
  if (assigned.length === 0) return 1;
  return Math.max(...assigned) + 1;
}
