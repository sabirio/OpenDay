import {
  buildDefaultScheduleActivities,
  buildScheduleSetupSavePayload,
  validateScheduleSetupActivities,
} from './contractorScheduleSetupModel.js';
import { deriveExecutionScopeFromDisciplines } from './executionScopeModel.js';
import { RETAIL_FITOUT_WORK_ONTOLOGY_V1 } from './retailFitoutOntologyV1.js';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}
const ontology = RETAIL_FITOUT_WORK_ONTOLOGY_V1;
const electrical = ontology.disciplines.find(item => item.code === 'E100');
const scope = { id: 9, ...deriveExecutionScopeFromDisciplines([electrical.id], ontology) };
let next = 1;
const createId = () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;

console.log('\ncontractorScheduleSetupModel - Work Groups to contractor-owned activities');
const defaults = buildDefaultScheduleActivities(scope, createId);
check('default setup creates one activity per Work Group', defaults.length === 15);
check('default setup covers the complete Execution Scope', validateScheduleSetupActivities(defaults, scope).length === 0);

const split = [
  { activityId: createId(), title: 'Cable first fix', workGroupIds: [scope.workGroupIds[0]] },
  { activityId: createId(), title: 'Cable second fix', workGroupIds: [scope.workGroupIds[0]] },
  ...defaults.slice(1),
];
check('one Work Group may be split into multiple activities', validateScheduleSetupActivities(split, scope).length === 0);

const merged = [
  { activityId: createId(), title: 'Electrical infrastructure', workGroupIds: scope.workGroupIds.slice(0, 2) },
  ...defaults.slice(2),
];
check('one activity may combine multiple Work Groups', validateScheduleSetupActivities(merged, scope).length === 0);
check('payload trims titles and assigns deterministic order',
  buildScheduleSetupSavePayload([{ ...merged[0], title: '  Infrastructure  ' }, ...merged.slice(1)], scope)[0].title === 'Infrastructure'
  && buildScheduleSetupSavePayload(merged, scope).at(-1).sortOrder === merged.length - 1);
check('missing Work Group coverage is rejected',
  validateScheduleSetupActivities(defaults.slice(1), scope).some(issue => issue.code === 'UNCOVERED_EXECUTION_SCOPE_WORK_GROUP'));
check('out-of-scope Work Group is rejected',
  validateScheduleSetupActivities([{ ...defaults[0], workGroupIds: ['00000000-0000-4000-8000-999999999999'] }, ...defaults.slice(1)], scope)
    .some(issue => issue.code === 'WORK_GROUP_OUT_OF_EXECUTION_SCOPE'));
check('duplicate activity identity is rejected',
  validateScheduleSetupActivities([defaults[0], { ...defaults[1], activityId: defaults[0].activityId }, ...defaults.slice(2)], scope)
    .some(issue => issue.code === 'DUPLICATE_SCHEDULE_ACTIVITY_ID'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
