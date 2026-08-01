// contractorScheduleLifecycle.test.mjs — Simplification Phase 4B.1.
// Pure lifecycle/status/error-normalization tests. No Supabase, no React —
// the SQL half (public.contractor_schedule_lifecycle_status() and the
// submit/request-changes/approve RPCs) is exercised separately via the DB
// certification script.

import {
  SCHEDULE_LIFECYCLE_STATUS,
  deriveLifecycleStatus,
  canEditDraft,
  canSubmit,
  canEditScope,
  deriveNextSubmissionNumber,
  deriveNextBaselineRevisionNumber,
  deriveScheduleCompleteness,
  normalizeScheduleLifecycleError,
  normalizeScheduleSubmissionActionError,
} from './contractorScheduleLifecycle.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\nderiveLifecycleStatus');
{
  check('no pending, no approved -> DRAFT', deriveLifecycleStatus({}) === SCHEDULE_LIFECYCLE_STATUS.DRAFT);
  check('pending only -> PENDING_REVIEW',
    deriveLifecycleStatus({ hasPendingReview: true }) === SCHEDULE_LIFECYCLE_STATUS.PENDING_REVIEW);
  check('approved only -> APPROVED',
    deriveLifecycleStatus({ hasApproved: true }) === SCHEDULE_LIFECYCLE_STATUS.APPROVED);
  check('approved wins over pending (mirrors the SQL function\'s own precedence)',
    deriveLifecycleStatus({ hasApproved: true, hasPendingReview: true }) === SCHEDULE_LIFECYCLE_STATUS.APPROVED);
}

console.log('\ncanEditDraft / canSubmit / canEditScope');
{
  check('DRAFT: editing/submitting/scope-editing all allowed',
    canEditDraft(SCHEDULE_LIFECYCLE_STATUS.DRAFT) &&
    canSubmit(SCHEDULE_LIFECYCLE_STATUS.DRAFT) &&
    canEditScope(SCHEDULE_LIFECYCLE_STATUS.DRAFT));
  check('PENDING_REVIEW: editing/submitting/scope-editing all blocked',
    !canEditDraft(SCHEDULE_LIFECYCLE_STATUS.PENDING_REVIEW) &&
    !canSubmit(SCHEDULE_LIFECYCLE_STATUS.PENDING_REVIEW) &&
    !canEditScope(SCHEDULE_LIFECYCLE_STATUS.PENDING_REVIEW));
  check('APPROVED: editing/submitting/scope-editing all blocked',
    !canEditDraft(SCHEDULE_LIFECYCLE_STATUS.APPROVED) &&
    !canSubmit(SCHEDULE_LIFECYCLE_STATUS.APPROVED) &&
    !canEditScope(SCHEDULE_LIFECYCLE_STATUS.APPROVED));
}

console.log('\nderiveNextSubmissionNumber');
{
  check('empty history -> 1', deriveNextSubmissionNumber([]) === 1);
  check('no argument -> 1', deriveNextSubmissionNumber() === 1);
  check('one prior submission -> 2', deriveNextSubmissionNumber([1]) === 2);
  check('out-of-order history still finds the max', deriveNextSubmissionNumber([1, 3, 2]) === 4);
}

console.log('\nderiveNextBaselineRevisionNumber');
{
  check('empty history -> 1', deriveNextBaselineRevisionNumber([]) === 1);
  check('no argument -> 1', deriveNextBaselineRevisionNumber() === 1);
  check('all-null history (no approvals yet) -> 1', deriveNextBaselineRevisionNumber([null, undefined]) === 1);
  check('one prior approval -> 2', deriveNextBaselineRevisionNumber([1]) === 2);
  check('nulls mixed with a real revision are ignored, not treated as 0',
    deriveNextBaselineRevisionNumber([null, 1, undefined]) === 2);
}

console.log('\nnormalizeScheduleLifecycleError');
{
  check('null/undefined message -> UNKNOWN with a generic message',
    normalizeScheduleLifecycleError(null).code === 'UNKNOWN' &&
    normalizeScheduleLifecycleError(undefined).code === 'UNKNOWN');
  check('unrecognized message -> UNKNOWN, raw text preserved',
    (() => {
      const r = normalizeScheduleLifecycleError('some other Postgres error');
      return r.code === 'UNKNOWN' && r.message === 'some other Postgres error';
    })());
  check('SCHEDULE_PENDING_REVIEW: message parsed into code + rest',
    (() => {
      const r = normalizeScheduleLifecycleError('SCHEDULE_PENDING_REVIEW: a schedule submission is already pending review');
      return r.code === 'SCHEDULE_PENDING_REVIEW' && r.message === 'a schedule submission is already pending review';
    })());
  check('BASELINE_ALREADY_APPROVED recognized',
    normalizeScheduleLifecycleError('BASELINE_ALREADY_APPROVED: an approved baseline already exists for this project').code
      === 'BASELINE_ALREADY_APPROVED');
  check('SUBMISSION_NOT_PENDING recognized',
    normalizeScheduleLifecycleError('SUBMISSION_NOT_PENDING: this submission is not awaiting review').code
      === 'SUBMISSION_NOT_PENDING');
  check('COMMENT_REQUIRED recognized',
    normalizeScheduleLifecycleError('COMMENT_REQUIRED: a comment is required to request changes').code === 'COMMENT_REQUIRED');
  check('SCHEDULE_INCOMPLETE recognized',
    normalizeScheduleLifecycleError('SCHEDULE_INCOMPLETE: 3 of 10 active work packages are missing Start/Finish').code
      === 'SCHEDULE_INCOMPLETE');
  check('EMPTY_SCOPE recognized',
    normalizeScheduleLifecycleError('EMPTY_SCOPE: no active Scope work packages exist for this project').code === 'EMPTY_SCOPE');
  check('code with no trailing message falls back to the code itself as the message',
    (() => {
      const r = normalizeScheduleLifecycleError('SCHEDULE_PENDING_REVIEW');
      return r.code === 'SCHEDULE_PENDING_REVIEW' && r.message === 'SCHEDULE_PENDING_REVIEW';
    })());
}

console.log('\nderiveScheduleCompleteness');
{
  check('empty task list -> not complete, zero counts',
    (() => {
      const r = deriveScheduleCompleteness([]);
      return r.scheduledCount === 0 && r.totalCount === 0 && r.unscheduledWpIds.length === 0 && r.isComplete === false;
    })());
  check('no argument -> same as empty list', deriveScheduleCompleteness().totalCount === 0);
  check('all scheduled -> isComplete true',
    deriveScheduleCompleteness([
      { id: 'a', earlyStart: new Date('2027-01-01'), earlyFinish: new Date('2027-01-02') },
      { id: 'b', earlyStart: new Date('2027-01-03'), earlyFinish: new Date('2027-01-04') },
    ]).isComplete === true);
  check('one unscheduled (missing earlyFinish) -> isComplete false, correct scheduledCount/unscheduledWpIds',
    (() => {
      const r = deriveScheduleCompleteness([
        { id: 'a', earlyStart: new Date('2027-01-01'), earlyFinish: new Date('2027-01-02') },
        { id: 'b', earlyStart: new Date('2027-01-03'), earlyFinish: null },
      ]);
      return r.isComplete === false && r.scheduledCount === 1 && r.totalCount === 2 && r.unscheduledWpIds.length === 1 && r.unscheduledWpIds[0] === 'b';
    })());
  check('missing earlyStart also counts as unscheduled',
    deriveScheduleCompleteness([{ id: 'a', earlyStart: null, earlyFinish: new Date('2027-01-02') }]).unscheduledWpIds.length === 1);
}

console.log('\nnormalizeScheduleSubmissionActionError');
{
  check('SCHEDULE_PENDING_REVIEW -> friendly message + shouldReload true',
    (() => {
      const r = normalizeScheduleSubmissionActionError({ message: 'SCHEDULE_PENDING_REVIEW: a schedule submission is already pending review' });
      return r.code === 'SCHEDULE_PENDING_REVIEW' && r.shouldReload === true
        && r.message === 'This schedule is already pending PM review. Reloading the current status.';
    })());
  check('BASELINE_ALREADY_APPROVED -> shouldReload true',
    normalizeScheduleSubmissionActionError({ message: 'BASELINE_ALREADY_APPROVED: an approved baseline already exists for this project' }).shouldReload === true);
  check('SUBMISSION_NOT_PENDING -> shouldReload true',
    normalizeScheduleSubmissionActionError({ message: 'SUBMISSION_NOT_PENDING: this submission is not awaiting review' }).shouldReload === true);
  check('COMMENT_REQUIRED -> shouldReload false (a validation error, not a race)',
    normalizeScheduleSubmissionActionError({ message: 'COMMENT_REQUIRED: a comment is required to request changes' }).shouldReload === false);
  check('SCHEDULE_INCOMPLETE -> friendly, non-raw message',
    normalizeScheduleSubmissionActionError({ message: 'SCHEDULE_INCOMPLETE: 2 of 3 active work packages are missing Start/Finish' }).message
      === 'Not every active work package has a Start and Finish date yet.');
  check('unknown code -> falls back to the raw (already-parsed) message, shouldReload false',
    (() => {
      const r = normalizeScheduleSubmissionActionError({ message: 'some other Postgres error' });
      return r.code === 'UNKNOWN' && r.shouldReload === false;
    })());
  check('null error -> UNKNOWN, never throws',
    normalizeScheduleSubmissionActionError(null).code === 'UNKNOWN');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
