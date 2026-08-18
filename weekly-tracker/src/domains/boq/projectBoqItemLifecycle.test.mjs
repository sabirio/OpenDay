import { createCustomProjectBoqItem, createStandardProjectBoqItem, validateProjectBoqItemIdentityTransitions } from './projectBoqItemLifecycle.js';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
};
const lineId = '69000000-0000-4000-8000-000000000001';
const workGroupId = '69000000-0000-4000-8000-000000000002';
const definitionId = '69000000-0000-4000-8000-000000000003';

console.log('\nprojectBoqItemLifecycle - Phase C.13');
const standard = createStandardProjectBoqItem({ lineId, definition: { id: definitionId, workGroupId, label: 'Cable 3x2.5', defaultUnit: 'm' }, quantity: '10', sortOrder: 0 });
check('standard item inherits canonical identity and metadata', standard.itemKind === 'STANDARD' && standard.description === 'Cable 3x2.5' && standard.unit === 'm');
check('standard item starts unpriced when rates are absent', standard.labourRate === null && standard.materialRate === null);
const custom = createCustomProjectBoqItem({ lineId, workGroupId, description: ' Special fire-rated cable ', unit: ' m ', quantity: '2', labourRate: '5', materialRate: '10', sortOrder: 1 });
check('custom item remains flexible inside one Work Group', custom.itemKind === 'CUSTOM' && custom.description === 'Special fire-rated cable' && custom.unit === 'm' && custom.standardDefinitionId === null);
check('commercial edits preserve standard identity', validateProjectBoqItemIdentityTransitions([standard], [{ ...standard, quantity: '20', labourRate: '5' }]).length === 0);
check('commercial and descriptive edits preserve custom identity', validateProjectBoqItemIdentityTransitions([custom], [{ ...custom, description: 'Updated custom detail', unit: 'lot', quantity: '3' }]).length === 0);
check('reusing a line id cannot change STANDARD to CUSTOM', validateProjectBoqItemIdentityTransitions([standard], [{ ...custom }]).some(issue => issue.code === 'BOQ_LINE_IDENTITY_IMMUTABLE'));
check('reusing a line id cannot move a line to another Work Group', validateProjectBoqItemIdentityTransitions([custom], [{ ...custom, workGroupId: definitionId }]).some(issue => issue.code === 'BOQ_LINE_IDENTITY_IMMUTABLE'));
check('standard canonical metadata cannot drift between revisions', validateProjectBoqItemIdentityTransitions([standard], [{ ...standard, description: 'Renamed' }]).some(issue => issue.code === 'STANDARD_BOQ_METADATA_IMMUTABLE'));

let invalidCustom = null;
try { createCustomProjectBoqItem({ lineId, workGroupId, description: ' ', unit: 'm' }); } catch (error) { invalidCustom = error; }
check('custom item requires its own description', invalidCustom?.code === 'DESCRIPTION_REQUIRED');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
