import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const service = readFileSync(new URL('../services/scheduleSubmissionService.js', import.meta.url), 'utf8');
const orchestration = readFileSync(new URL('../core/contractorSchedule/scheduleSubmissionOrchestration.js', import.meta.url), 'utf8');
const snapshotView = readFileSync(new URL('../components/schedule/SubmissionSnapshotView.jsx', import.meta.url), 'utf8');

console.log('\nganttBaselineScopeSnapshotUi - Phase B.9');
check('version model exposes the pinned Execution Scope',
  /executionScopeVersionId: row\.execution_scope_version_id/.test(service));
check('task model exposes Activity UUID and immutable title',
  /scheduleActivityId: row\.schedule_activity_id/.test(service)
  && /activityTitle: row\.activity_title/.test(service)
  && /activityPhaseId: row\.activity_phase_id/.test(service)
  && /activityPhaseLabel: row\.activity_phase_label/.test(service));
check('snapshot loader reads immutable Activity to Work Group mappings',
  /loadScheduleVersionActivityWorkGroups/.test(service)
  && /project_schedule_version_activity_work_groups/.test(service));
check('canonical snapshot title wins over the moving Draft label',
  /label: task\.activityTitle \|\| live\?\.label \|\| task\.id/.test(orchestration)
  && /phaseId: task\.activityPhaseId \|\| live\?\.phaseId \|\| null/.test(orchestration)
  && /phaseLabel: task\.activityPhaseLabel \|\| live\?\.phaseLabel \|\| null/.test(orchestration));
check('snapshot rows expose stable Activity and Work Group identities',
  /scheduleActivityId: task\.scheduleActivityId \|\| null/.test(orchestration)
  && /workGroupIds: task\.scheduleActivityId/.test(orchestration));
check('submission view identifies canonical Activities and pinned Scope',
  /Scheduled \{version\.executionScopeVersionId \? 'Activities' : 'WPs'\}/.test(snapshotView)
  && /Execution Scope snapshot/.test(snapshotView));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
