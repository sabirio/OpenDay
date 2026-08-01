// scheduleSubmissionReadModel.test.mjs — Simplification Phase 4B.2.
// Pure read-model tests. No Supabase, no React.

import {
  sortVersionsBySubmissionDesc,
  findLatestVersion,
  findPendingVersion,
  findApprovedVersion,
  deriveSubmissionDisplayStatus,
} from './scheduleSubmissionReadModel.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const V1 = { id: 1, submissionNumber: 1, status: 'CHANGES_REQUESTED', baselineRevisionNumber: null };
const V2 = { id: 2, submissionNumber: 2, status: 'PENDING_REVIEW', baselineRevisionNumber: null };
const V1_APPROVED = { id: 1, submissionNumber: 1, status: 'APPROVED', baselineRevisionNumber: 1 };

console.log('\nsortVersionsBySubmissionDesc');
{
  check('sorts descending by submissionNumber, does not mutate input',
    (() => {
      const input = [V1, V2];
      const sorted = sortVersionsBySubmissionDesc(input);
      return sorted[0].id === V2.id && sorted[1].id === V1.id && input[0].id === V1.id;
    })());
  check('empty list -> empty list', sortVersionsBySubmissionDesc([]).length === 0);
}

console.log('\nfindLatestVersion');
{
  check('empty -> null', findLatestVersion([]) === null);
  check('no argument -> null', findLatestVersion() === null);
  check('picks the highest submissionNumber regardless of array order',
    findLatestVersion([V1, V2]).id === V2.id && findLatestVersion([V2, V1]).id === V2.id);
}

console.log('\nfindPendingVersion');
{
  check('finds the PENDING_REVIEW row', findPendingVersion([V1, V2])?.id === V2.id);
  check('none pending -> null', findPendingVersion([V1]) === null);
  check('empty -> null', findPendingVersion([]) === null);
}

console.log('\nfindApprovedVersion');
{
  check('finds the APPROVED row', findApprovedVersion([V1_APPROVED, V2])?.id === V1_APPROVED.id);
  check('none approved -> null', findApprovedVersion([V1, V2]) === null);
}

console.log('\nderiveSubmissionDisplayStatus');
{
  check('no versions -> NONE', deriveSubmissionDisplayStatus([]) === 'NONE');
  check('no argument -> NONE', deriveSubmissionDisplayStatus() === 'NONE');
  check('latest is PENDING_REVIEW -> PENDING_REVIEW (not collapsed)',
    deriveSubmissionDisplayStatus([V1, V2]) === 'PENDING_REVIEW');
  check('latest is CHANGES_REQUESTED -> CHANGES_REQUESTED (Section N: never collapsed into a generic Draft state)',
    deriveSubmissionDisplayStatus([V1]) === 'CHANGES_REQUESTED');
  check('latest is APPROVED -> APPROVED',
    deriveSubmissionDisplayStatus([V1_APPROVED]) === 'APPROVED');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
