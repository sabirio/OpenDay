import {
  deriveExecutionScopeFromBoqItems,
  deriveExecutionScopeFromDisciplines,
  validateExecutionScope,
} from './executionScopeModel.js';
import { RETAIL_FITOUT_WORK_ONTOLOGY_V1 } from './retailFitoutOntologyV1.js';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const ontology = RETAIL_FITOUT_WORK_ONTOLOGY_V1;
const electrical = ontology.disciplines.find(item => item.code === 'E100');
const construction = ontology.disciplines.find(item => item.code === 'C100');

console.log('\nexecutionScopeModel - PM Disciplines to canonical Work Groups');
const selectable = ontology.disciplines.filter(item => item.scopeSelectable);
const all = deriveExecutionScopeFromDisciplines(selectable.map(item => item.id), ontology);
check('all execution-selectable Disciplines resolve to their 131 Work Groups',
  all.selectedDisciplineIds.length === 11 && all.workGroupIds.length === 131);
check('output carries no Gantt planning fields',
  !('activities' in all) && !('plannedStart' in all) && !('dependencies' in all));

const electricalOnly = deriveExecutionScopeFromDisciplines([electrical.id], ontology);
check('Electrical resolves to its fifteen canonical Work Groups',
  electricalOnly.workGroups.length === 15
  && electricalOnly.workGroups.every(item => item.disciplineId === electrical.id));
check('output order follows ontology order, not PM input order',
  deriveExecutionScopeFromDisciplines([electrical.id, construction.id], ontology)
    .selectedDisciplineIds.join(',') === [construction.id, electrical.id].join(','));
check('valid snapshot passes validation', validateExecutionScope(electricalOnly, ontology).length === 0);

for (const [label, ids, code] of [
  ['empty selection is rejected', [], 'INVALID_EXECUTION_SCOPE_DISCIPLINES'],
  ['duplicate Discipline is rejected', [electrical.id, electrical.id], 'DUPLICATE_EXECUTION_SCOPE_DISCIPLINE'],
  ['unknown Discipline is rejected', ['00000000-0000-4000-8000-000000000000'], 'UNKNOWN_EXECUTION_SCOPE_DISCIPLINE'],
]) {
  try {
    deriveExecutionScopeFromDisciplines(ids, ontology);
    check(label, false);
  } catch (error) {
    check(label, error.code === code);
  }
}

check('persisted Work Group drift is detected',
  validateExecutionScope({ ...electricalOnly, workGroupIds: electricalOnly.workGroupIds.slice(1) }, ontology)
    .some(issue => issue.code === 'EXECUTION_SCOPE_WORK_GROUP_SET_MISMATCH'));

const awarded = {
  ...deriveExecutionScopeFromBoqItems([{ workGroupId: electricalOnly.workGroupIds[0] }], ontology, 7),
  sourceKind: 'AWARDED_BOQ', sourceBoqVersionId: null, sourceAwardId: 'award-1',
};
check('Awarded BOQ scope validates as a canonical Work Group subset', validateExecutionScope(awarded, ontology).length === 0);
check('Awarded BOQ scope requires a source award identity', validateExecutionScope({ ...awarded, sourceAwardId: null }, ontology).some(issue => issue.code === 'INVALID_SOURCE_AWARD_ID'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
