// openingStatusLabel.test.mjs — Simplification Phase 3D.1, Section 11/14.

import { deriveOpeningStatusLabel } from './openingStatusLabel.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\nAUTO_GENERATED — always passes readinessStatus through unchanged');
{
  check('AUTO_GENERATED + any lifecycle status -> readinessStatus unchanged',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'AUTO_GENERATED', contractorScheduleLifecycleStatus: 'DRAFT', readinessStatus: 'Critical' }) === 'Critical');
  check('missing scheduleOwnershipMode -> treated as non-CONTRACTOR_MANAGED, passthrough',
    deriveOpeningStatusLabel({ readinessStatus: 'Ready' }) === 'Ready');
}

console.log('\nCONTRACTOR_MANAGED — exact required label mapping (Section 11)');
{
  check('DRAFT -> "Awaiting Contractor Schedule"',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'DRAFT', readinessStatus: 'Not Assessable' }) === 'Awaiting Contractor Schedule');
  check('PENDING_REVIEW -> "Awaiting PM Review"',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'PENDING_REVIEW', readinessStatus: 'Not Assessable' }) === 'Awaiting PM Review');
  check('CHANGES_REQUESTED -> "Schedule Changes Required"',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'CHANGES_REQUESTED', readinessStatus: 'Not Assessable' }) === 'Schedule Changes Required');
  check('APPROVED -> existing Ready/At Risk/Critical vocabulary passes through',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'APPROVED', readinessStatus: 'At Risk' }) === 'At Risk');
}

console.log('\nCONTRACTOR_MANAGED — fail-safe default (never recalculates a score, never assumes committed)');
{
  check('missing contractorScheduleLifecycleStatus -> falls back to the DRAFT label',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', readinessStatus: 'Not Assessable' }) === 'Awaiting Contractor Schedule');
  check('unrecognized contractorScheduleLifecycleStatus -> falls back to the DRAFT label',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'SOMETHING_UNKNOWN', readinessStatus: 'Not Assessable' }) === 'Awaiting Contractor Schedule');
}

console.log('\nProjection Completeness Hardening — UNAVAILABLE always wins, never inferred as a lifecycle label');
{
  check('CONTRACTOR_MANAGED, no lifecycle status, UNAVAILABLE -> "Schedule status unavailable", NOT the DRAFT fallback',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: null, scheduleProjectionAvailability: 'UNAVAILABLE', readinessStatus: 'Not Assessable' }) === 'Schedule status unavailable');
  check('CONTRACTOR_MANAGED, a stale/unrelated lifecycle status happens to be present, UNAVAILABLE still wins',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'APPROVED', scheduleProjectionAvailability: 'UNAVAILABLE', readinessStatus: 'Ready' }) === 'Schedule status unavailable');
  check('AUTO_GENERATED + UNAVAILABLE -> still "Schedule status unavailable" (never silently passes through Ready/Critical either)',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'AUTO_GENERATED', scheduleProjectionAvailability: 'UNAVAILABLE', readinessStatus: 'Critical' }) === 'Schedule status unavailable');
  check('scheduleProjectionAvailability AVAILABLE (or omitted) does not change existing behavior',
    deriveOpeningStatusLabel({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', contractorScheduleLifecycleStatus: 'DRAFT', scheduleProjectionAvailability: 'AVAILABLE', readinessStatus: 'Not Assessable' }) === 'Awaiting Contractor Schedule');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
