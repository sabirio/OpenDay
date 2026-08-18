import { deriveExecutionScopeFromBoqItems, validateExecutionScope } from './executionScopeModel.js';

let pass = 0, fail = 0;
const check = (label, condition) => { if (condition) { pass++; console.log(`  OK ${label}`); } else { fail++; console.error(`  FAIL ${label}`); } };
const ontology = {
  id: '70000000-0000-4000-8000-000000000001', schemaVersion: 2, version: 1, label: 'Test', status: 'PUBLISHED', isActive: true,
  departments: [{ id: '70000000-0000-4000-8000-000000000010', code: 'D100', label: 'Construction', displayOrder: 1 }],
  disciplines: [{ id: '70000000-0000-4000-8000-000000000002', departmentId: '70000000-0000-4000-8000-000000000010', code: 'E100', label: 'Electrical', displayOrder: 1, scopeSelectable: true, budgetSelectable: true }],
  workGroups: [
    { id: '70000000-0000-4000-8000-000000000003', disciplineId: '70000000-0000-4000-8000-000000000002', code: 'E100.01', label: 'Cables', displayOrder: 1 },
    { id: '70000000-0000-4000-8000-000000000004', disciplineId: '70000000-0000-4000-8000-000000000002', code: 'E100.02', label: 'Boards', displayOrder: 2 },
  ],
  boqItemDefinitions: [], executionClassifications: [],
};
const items = [
  { lineId: '1', itemKind: 'STANDARD', workGroupId: ontology.workGroups[0].id },
  { lineId: '2', itemKind: 'CUSTOM', workGroupId: ontology.workGroups[0].id },
  { lineId: '3', itemKind: 'STANDARD', workGroupId: ontology.workGroups[1].id },
];

console.log('\nboqExecutionScopeMapping - Phase C.14');
const scope = deriveExecutionScopeFromBoqItems(items, ontology, 91);
check('many detailed BOQ lines collapse to distinct Work Groups', scope.workGroupIds.length === 2 && scope.collapsedLineCount === 1);
check('standard and custom lines follow the same Work Group rule', scope.workGroupIds[0] === ontology.workGroups[0].id);
check('output remains ready-to-schedule scope without activities', scope.sourceKind === 'BOQ_REVISION' && !('activities' in scope));
check('source BOQ revision remains traceable', scope.sourceBoqVersionId === 91 && scope.boqLineCount === 3);
check('derived BOQ scope validates against the pinned ontology', validateExecutionScope(scope, ontology).length === 0);
let unknown = null;
try { deriveExecutionScopeFromBoqItems([{ workGroupId: 'missing' }], ontology, 91); } catch (error) { unknown = error; }
check('unknown Work Group is rejected deterministically', unknown?.code === 'UNKNOWN_BOQ_WORK_GROUP');
check('empty BOQ cannot produce Execution Scope', (() => { try { deriveExecutionScopeFromBoqItems([], ontology, 91); return false; } catch (error) { return error.code === 'EMPTY_BOQ_EXECUTION_SCOPE'; } })());

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
