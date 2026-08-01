// Pure lifecycle/status helpers for the Contractor Schedule Submission ->
// PM Review -> Approved Baseline lifecycle (Simplification Phase 4B.1).
// No Supabase, no React — mirrors, and must stay consistent with, the ONE
// server-side source of truth: public.contractor_schedule_lifecycle_status()
// (049_contractor_schedule_submission_lifecycle.sql). These functions never
// decide anything by themselves; they exist so a future JS caller (a
// Scope-edit orchestration, a presentation hook) can derive the same
// booleans the server already enforces, without scattering
// `status === 'PENDING_REVIEW'` string comparisons across the codebase —
// the RPCs remain the final authority regardless of what these compute.
//
// Numbering formulas (Math.max-based) live in engines/scheduleLifecycleEngine.js
// per this repository's architecture guard — core/ composes engines/, it
// never computes formulas itself.

import { computeNextSubmissionNumber, computeNextBaselineRevisionNumber, computeScheduleCompleteness } from '../../engines/scheduleLifecycleEngine.js';

export const SCHEDULE_LIFECYCLE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
});

/**
 * Mirrors contractor_schedule_lifecycle_status()'s own precedence: APPROVED
 * wins over PENDING_REVIEW (a project can never have both at once by
 * construction, but this ordering matches the SQL function exactly rather
 * than assuming mutual exclusivity here too). No pending, no approved ->
 * DRAFT — covers both "never submitted" and "most recent submission was
 * CHANGES_REQUESTED" identically, same as the SQL function.
 * @param {{ hasApproved?: boolean, hasPendingReview?: boolean }} facts
 * @returns {string} one of SCHEDULE_LIFECYCLE_STATUS
 */
export function deriveLifecycleStatus({ hasApproved = false, hasPendingReview = false } = {}) {
  if (hasApproved) return SCHEDULE_LIFECYCLE_STATUS.APPROVED;
  if (hasPendingReview) return SCHEDULE_LIFECYCLE_STATUS.PENDING_REVIEW;
  return SCHEDULE_LIFECYCLE_STATUS.DRAFT;
}

/** Save Draft is a Draft-stage action only (mirrors migration 050's lock). */
export function canEditDraft(status) {
  return status === SCHEDULE_LIFECYCLE_STATUS.DRAFT;
}

/** Submit requires the project to currently be in Draft (no existing pending/approved submission). */
export function canSubmit(status) {
  return status === SCHEDULE_LIFECYCLE_STATUS.DRAFT;
}

/**
 * Scope edits allowed before any submission or after Request Changes
 * (both collapse to DRAFT); blocked while PENDING_REVIEW or after APPROVED
 * until schedule revisions exist (Phase 4B.1 Section J — no Scope-edit RPC
 * is built in this slice; this is the canonical read any future one must
 * consult).
 */
export function canEditScope(status) {
  return status === SCHEDULE_LIFECYCLE_STATUS.DRAFT;
}

/**
 * Optimistic display only — the persisted number returned by the RPC is
 * always authoritative; this is never used to assign a real number. The
 * actual formula lives in engines/scheduleLifecycleEngine.js.
 * @param {Array<number>} existingSubmissionNumbers
 * @returns {number}
 */
export function deriveNextSubmissionNumber(existingSubmissionNumbers = []) {
  return computeNextSubmissionNumber(existingSubmissionNumbers);
}

/**
 * Optimistic display only — see deriveNextSubmissionNumber above. The
 * actual formula lives in engines/scheduleLifecycleEngine.js.
 * @param {Array<number|null|undefined>} existingBaselineRevisionNumbers
 * @returns {number}
 */
export function deriveNextBaselineRevisionNumber(existingBaselineRevisionNumbers = []) {
  return computeNextBaselineRevisionNumber(existingBaselineRevisionNumbers);
}

/**
 * Display-only completeness facts for the Contractor Submit action
 * (Simplification Phase 4B.2 Section E) — one formula, delegated to
 * engines/scheduleLifecycleEngine.js, never re-derived per page. The
 * submit_contractor_schedule RPC remains the final authority; this exists
 * solely so the UI can show "Scheduled WPs: X / Y" and disable Submit
 * without guessing at the server's own rule.
 * @param {Array<{id: string, earlyStart?: Date|null, earlyFinish?: Date|null}>} tasks
 * @returns {{ scheduledCount: number, totalCount: number, unscheduledWpIds: string[], isComplete: boolean }}
 */
export function deriveScheduleCompleteness(tasks = []) {
  return computeScheduleCompleteness(tasks);
}

// Every deterministic, product-meaningful error code the schedule-lifecycle
// RPCs (submit_contractor_schedule, request_schedule_changes,
// approve_schedule_submission, save_contractor_schedule_draft) can raise,
// in the exact `CODE: message` shape each RAISE EXCEPTION uses.
const KNOWN_SCHEDULE_LIFECYCLE_ERROR_CODES = [
  'SCHEDULE_PENDING_REVIEW',
  'BASELINE_ALREADY_APPROVED',
  'SCHEDULE_NOT_CONTRACTOR_MANAGED',
  'EMPTY_SCOPE',
  'SCHEDULE_INCOMPLETE',
  'INVALID_SCHEDULE_DATES',
  'SUBMISSION_NOT_PENDING',
  'COMMENT_REQUIRED',
  'DUPLICATE_WORK_PACKAGE',
  'WORK_PACKAGE_OUT_OF_SCOPE',
  'EMPTY_BATCH',
];

/**
 * Normalizes a raw Postgres RAISE EXCEPTION message (e.g. thrown as
 * error.message by supabase-js) into a stable { code, message } shape a UI
 * can branch on, instead of string-matching the raw text everywhere a
 * schedule-lifecycle RPC might fail.
 * @param {string|null|undefined} rawMessage
 * @returns {{ code: string, message: string }}
 */
export function normalizeScheduleLifecycleError(rawMessage) {
  if (!rawMessage) return { code: 'UNKNOWN', message: 'An unexpected error occurred.' };
  const found = KNOWN_SCHEDULE_LIFECYCLE_ERROR_CODES.find((code) => rawMessage.startsWith(code));
  if (!found) return { code: 'UNKNOWN', message: rawMessage };
  const rest = rawMessage.slice(found.length).replace(/^:\s*/, '');
  return { code: found, message: rest || found };
}

// Codes that mean "the lifecycle moved on while this action was in flight" —
// another actor (a concurrent Submit, PM decision, or approval) already
// changed the state this action assumed. A canonical reload is the correct
// response, never a generic retry or a silent success (Phase 4B.2 Section
// F/S — "lifecycle race errors cause a canonical reload").
const LIFECYCLE_RACE_CODES = new Set(['SCHEDULE_PENDING_REVIEW', 'BASELINE_ALREADY_APPROVED', 'SUBMISSION_NOT_PENDING']);

// One friendly, product-meaningful sentence per known code — never the raw
// Postgres message (Phase 4B.2 Section F/S: "Do not show raw PostgreSQL
// errors"). Codes not listed here fall back to the RAISE EXCEPTION's own
// message text, which is already written to be a complete sentence.
const FRIENDLY_MESSAGE_BY_CODE = {
  SCHEDULE_PENDING_REVIEW: 'This schedule is already pending PM review. Reloading the current status.',
  BASELINE_ALREADY_APPROVED: 'This schedule already has an approved baseline. Reloading the current status.',
  SUBMISSION_NOT_PENDING: 'This submission was already decided by another reviewer. Reloading the current status.',
  SCHEDULE_INCOMPLETE: 'Not every active work package has a Start and Finish date yet.',
  EMPTY_SCOPE: 'This project has no active work packages to schedule.',
  COMMENT_REQUIRED: 'A comment is required to request changes.',
};

/**
 * Normalizes a Submit/Request-Changes/Approve RPC failure into a stable,
 * UI-ready shape: a friendly message (never raw Postgres text) plus a
 * shouldReload flag for lifecycle-race codes, so a page can uniformly
 * "reload canonical state" instead of guessing per call site.
 * @param {{message?: string}|null|undefined} error
 * @returns {{ code: string, message: string, shouldReload: boolean }}
 */
export function normalizeScheduleSubmissionActionError(error) {
  const { code, message } = normalizeScheduleLifecycleError(error?.message);
  return {
    code,
    message: FRIENDLY_MESSAGE_BY_CODE[code] || message,
    shouldReload: LIFECYCLE_RACE_CODES.has(code),
  };
}
