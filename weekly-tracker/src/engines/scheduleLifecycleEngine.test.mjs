// scheduleLifecycleEngine.test.mjs — Simplification Phase 3D.1 (live
// approved-commitment projection). Focused on computeEarliestPlannedStart,
// the new formula backing the batch commitment projection's
// earliestCommittedPlannedStart fact.

import { computeEarliestPlannedStart } from './scheduleLifecycleEngine.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\ncomputeEarliestPlannedStart');
{
  check('empty tasks -> null',
    computeEarliestPlannedStart([]) === null);
  check('no arguments -> null',
    computeEarliestPlannedStart() === null);
  check('single task -> its own plannedStart',
    computeEarliestPlannedStart([{ plannedStart: '2027-03-10' }]) === '2027-03-10');
  check('multiple tasks -> the earliest date, regardless of input order',
    computeEarliestPlannedStart([
      { plannedStart: '2027-03-10' },
      { plannedStart: '2027-01-15' },
      { plannedStart: '2027-02-01' },
    ]) === '2027-01-15');
  check('already-sorted-ascending input -> still finds the earliest',
    computeEarliestPlannedStart([
      { plannedStart: '2027-01-01' },
      { plannedStart: '2027-06-01' },
    ]) === '2027-01-01');
  check('tasks with null/missing plannedStart are ignored, not treated as "earliest"',
    computeEarliestPlannedStart([
      { plannedStart: null },
      { plannedStart: '2027-05-01' },
      {},
    ]) === '2027-05-01');
  check('all null/missing plannedStart -> null, not a crash',
    computeEarliestPlannedStart([{ plannedStart: null }, {}]) === null);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
