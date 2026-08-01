// scheduleAssessmentAvailability.test.mjs — Simplification Phase 3D.1.

import { deriveAssessmentAvailability, ASSESSMENT_AVAILABILITY } from './scheduleAssessmentAvailability.js';
import { SCHEDULE_COMMITMENT_STATE } from './scheduleCommitmentState.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\nderiveAssessmentAvailability');
{
  check('COMMITTED -> ASSESSABLE',
    deriveAssessmentAvailability(SCHEDULE_COMMITMENT_STATE.COMMITTED) === ASSESSMENT_AVAILABILITY.ASSESSABLE);
  check('NOT_YET_COMMITTED -> NOT_ASSESSABLE',
    deriveAssessmentAvailability(SCHEDULE_COMMITMENT_STATE.NOT_YET_COMMITTED) === ASSESSMENT_AVAILABILITY.NOT_ASSESSABLE);
  check('PROPOSED -> NOT_ASSESSABLE (a PM could still return it via Request Changes)',
    deriveAssessmentAvailability(SCHEDULE_COMMITMENT_STATE.PROPOSED) === ASSESSMENT_AVAILABILITY.NOT_ASSESSABLE);
  check('unrecognized value -> NOT_ASSESSABLE (fail safe, never defaults to assessable)',
    deriveAssessmentAvailability('SOMETHING_UNKNOWN') === ASSESSMENT_AVAILABILITY.NOT_ASSESSABLE);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
