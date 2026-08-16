import { buildPmBaselineApprovalSummary } from './pmBaselineApprovalModel.js';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
};

console.log('\npmBaselineApprovalModel - Phase B.10');
const canonicalVersion = { status: 'PENDING_REVIEW', executionScopeVersionId: 71 };
const canonicalTasks = [
  { scheduleActivityId: 'a1', workGroupIds: ['w1', 'w2'] },
  { scheduleActivityId: 'a2', workGroupIds: ['w2', 'w3'] },
];
const complete = { isComplete: true };

const canonical = buildPmBaselineApprovalSummary(canonicalVersion, canonicalTasks, complete);
check('complete canonical snapshot is ready', canonical.ready === true);
check('counts Activities and distinct Work Groups', canonical.activityCount === 2 && canonical.workGroupCount === 3);
check('exposes pinned Execution Scope', canonical.executionScopeVersionId === 71);
check('Activity without Work Groups blocks approval', buildPmBaselineApprovalSummary(canonicalVersion, [{ scheduleActivityId: 'a1', workGroupIds: [] }], complete).ready === false);
check('missing immutable dates blocks approval', buildPmBaselineApprovalSummary(canonicalVersion, canonicalTasks, { isComplete: false }).ready === false);
check('legacy pending snapshot remains compatible', buildPmBaselineApprovalSummary({ status: 'PENDING_REVIEW', executionScopeVersionId: null }, [{}], complete).ready === true);
check('decided version cannot be approved again', buildPmBaselineApprovalSummary({ ...canonicalVersion, status: 'APPROVED' }, canonicalTasks, complete).ready === false);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
