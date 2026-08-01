// scheduleCommitmentState.test.mjs — Simplification Phase 3D.1.
// Pure mapping tests. No Supabase, no React.

import { deriveScheduleCommitmentState, SCHEDULE_COMMITMENT_STATE } from './scheduleCommitmentState.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\nAUTO_GENERATED -> always COMMITTED');
{
  check('AUTO_GENERATED, no lifecycle status -> COMMITTED',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: 'AUTO_GENERATED' }) === SCHEDULE_COMMITMENT_STATE.COMMITTED);
  check('AUTO_GENERATED, with an (irrelevant) lifecycle status present -> still COMMITTED',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: 'AUTO_GENERATED', contractorScheduleLifecycleStatus: 'DRAFT' }) === SCHEDULE_COMMITMENT_STATE.COMMITTED);
}

console.log('\nCONTRACTOR_MANAGED -> exact required mapping');
{
  check('DRAFT -> NOT_YET_COMMITTED',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'DRAFT' }) === SCHEDULE_COMMITMENT_STATE.NOT_YET_COMMITTED);
  check('PENDING_REVIEW -> PROPOSED',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'PENDING_REVIEW' }) === SCHEDULE_COMMITMENT_STATE.PROPOSED);
  check('CHANGES_REQUESTED -> NOT_YET_COMMITTED',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'CHANGES_REQUESTED' }) === SCHEDULE_COMMITMENT_STATE.NOT_YET_COMMITTED);
  check('APPROVED -> COMMITTED',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'APPROVED' }) === SCHEDULE_COMMITMENT_STATE.COMMITTED);
}

console.log('\nFail-safe: unknown/missing inputs never resolve to COMMITTED for CONTRACTOR_MANAGED');
{
  check('CONTRACTOR_MANAGED, missing lifecycle status -> NOT_YET_COMMITTED (never silently COMMITTED)',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }) === SCHEDULE_COMMITMENT_STATE.NOT_YET_COMMITTED);
  check('CONTRACTOR_MANAGED, unrecognized lifecycle status string -> NOT_YET_COMMITTED',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'SOMETHING_UNKNOWN' }) === SCHEDULE_COMMITMENT_STATE.NOT_YET_COMMITTED);
  check('CONTRACTOR_MANAGED, null lifecycle status -> NOT_YET_COMMITTED',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: null }) === SCHEDULE_COMMITMENT_STATE.NOT_YET_COMMITTED);
}

console.log('\nDefensive defaults');
{
  check('no arguments at all -> COMMITTED (falls through the not-CONTRACTOR_MANAGED branch, matches AUTO_GENERATED default)',
    deriveScheduleCommitmentState() === SCHEDULE_COMMITMENT_STATE.COMMITTED);
  check('null/undefined scheduleOwnershipMode -> COMMITTED (never mistaken for CONTRACTOR_MANAGED)',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: null }) === SCHEDULE_COMMITMENT_STATE.COMMITTED
    && deriveScheduleCommitmentState({ scheduleOwnershipMode: undefined }) === SCHEDULE_COMMITMENT_STATE.COMMITTED);
  check('unrecognized ownership mode string -> COMMITTED (same safe default as AUTO_GENERATED, never NOT_YET_COMMITTED)',
    deriveScheduleCommitmentState({ scheduleOwnershipMode: 'SOMETHING_ELSE' }) === SCHEDULE_COMMITMENT_STATE.COMMITTED);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
