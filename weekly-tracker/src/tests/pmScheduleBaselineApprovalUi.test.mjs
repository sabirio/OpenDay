import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
};
const page = readFileSync(new URL('../pages/PMScheduleReview.jsx', import.meta.url), 'utf8');
const summaryHook = readFileSync(new URL('../hooks/usePmBaselineApprovalSummary.js', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/scheduleCommitmentBatchService.js', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../core/contractorSchedule/loadScheduleCommitmentProjection.js', import.meta.url), 'utf8');

console.log('\npmScheduleBaselineApprovalUi - Phase B.10');
check('PM view derives a canonical approval summary through its hook facade',
  /usePmBaselineApprovalSummary/.test(page) && /buildPmBaselineApprovalSummary/.test(summaryHook));
check('approval is disabled when immutable snapshot verification fails', /snapshotError/.test(page) && /!approvalSummary\.ready/.test(page));
check('confirmation names Scope, Activities and Work Groups', /Execution Scope #/.test(page) && /Activities/.test(page) && /Work Groups/.test(page));
check('bulk reporting reads the official baseline registry', /project_schedule_baselines/.test(service) && /loadScheduleBaselinesForProjects/.test(service));
check('commitment loader supplies official baselines to the pure projection', /loadBaselines/.test(loader) && /buildScheduleCommitmentProjection\(allProjects, versions, versionTasks, baselines\)/.test(loader));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
