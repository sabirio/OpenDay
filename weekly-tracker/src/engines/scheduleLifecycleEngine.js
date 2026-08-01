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

/**
 * Mirrors submit_contractor_schedule's own completeness rule (Simplification
 * Phase 4B.1: EMPTY_SCOPE / SCHEDULE_INCOMPLETE) — every active (non-
 * archived) work package must have both a Start and a Finish date before
 * Submit is allowed. Display-only: the RPC re-derives and enforces this
 * itself server-side regardless of what this returns (Phase 4B.2 Section E
 * — "use backend/canonical completeness facts; do not invent a second
 * formula in UI" means one formula, living here, not one re-invented per
 * page).
 * @param {Array<{id: string, earlyStart?: Date|null, earlyFinish?: Date|null}>} tasks
 * @returns {{ scheduledCount: number, totalCount: number, unscheduledWpIds: string[], isComplete: boolean }}
 */
export function computeScheduleCompleteness(tasks = []) {
  const totalCount = tasks.length;
  const unscheduledWpIds = tasks.filter((t) => !t.earlyStart || !t.earlyFinish).map((t) => t.id);
  const scheduledCount = totalCount - unscheduledWpIds.length;
  return { scheduledCount, totalCount, unscheduledWpIds, isComplete: totalCount > 0 && unscheduledWpIds.length === 0 };
}

/**
 * Earliest planned_start across an Approved Baseline's immutable
 * project_schedule_version_tasks snapshot (Simplification Phase 3D.1) — the
 * "earliest planned start" half of reportDueStateEngine.js's obligation-start
 * formula (max(approvedAt, earliestCommittedPlannedStart)). ISO date strings
 * (YYYY-MM-DD, as Postgres `date` columns are shaped by Supabase) compare
 * correctly with plain string ordering — no Date parsing needed.
 * @param {Array<{plannedStart: string}>} tasks
 * @returns {string|null}
 */
export function computeEarliestPlannedStart(tasks = []) {
  const starts = tasks.map((t) => t.plannedStart).filter(Boolean);
  if (starts.length === 0) return null;
  return starts.reduce((min, start) => (start < min ? start : min));
}
