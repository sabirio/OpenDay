import { buildProjectBoqRevisionPayload, validateProjectBoqRevision } from './projectBoqModel.js';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
};
const base = {
  boqId: '67000000-0000-4000-8000-000000000001', title: 'Project BOQ', currencyCode: 'KZT', expectedLatestRevision: 0,
  items: [{
    lineId: '67000000-0000-4000-8000-000000000002', workGroupId: '20000000-0000-4000-8000-000000000001',
    itemKind: 'STANDARD', standardDefinitionId: '30000000-0000-4000-8000-000000000001',
    description: ' Cable 3x2.5 ', unit: ' m ', quantity: '10.5', labourRate: '25.25', materialRate: '100', sortOrder: 0,
  }],
};

console.log('\nprojectBoqModel - Phase C.11');
check('valid revision has no issues', validateProjectBoqRevision(base).length === 0);
const payload = buildProjectBoqRevisionPayload(base);
check('payload trims text but preserves decimal strings', payload.items[0].description === 'Cable 3x2.5' && payload.items[0].quantity === '10.5');
check('standard row requires definition', validateProjectBoqRevision({ ...base, items: [{ ...base.items[0], standardDefinitionId: null }] }).some(i => i.code === 'STANDARD_DEFINITION_REQUIRED'));
check('custom row forbids standard definition', validateProjectBoqRevision({ ...base, items: [{ ...base.items[0], itemKind: 'CUSTOM' }] }).some(i => i.code === 'CUSTOM_DEFINITION_FORBIDDEN'));
check('duplicate line identity is rejected', validateProjectBoqRevision({ ...base, items: [base.items[0], { ...base.items[0] }] }).some(i => i.code === 'DUPLICATE_BOQ_LINE_ID'));
check('zero quantity is rejected', validateProjectBoqRevision({ ...base, items: [{ ...base.items[0], quantity: '0' }] }).some(i => i.code === 'INVALID_QUANTITY'));
check('blank contractor quantity is allowed', validateProjectBoqRevision({ ...base, items: [{ ...base.items[0], quantity: null }] }).length === 0 && buildProjectBoqRevisionPayload({ ...base, items: [{ ...base.items[0], quantity: null }] }).items[0].quantity === null);
check('consultant quantity is optional and may be zero', validateProjectBoqRevision({ ...base, items: [{ ...base.items[0], consultantQuantity: '0' }] }).length === 0);
check('negative consultant quantity is rejected', validateProjectBoqRevision({ ...base, items: [{ ...base.items[0], consultantQuantity: '-1' }] }).some(i => i.code === 'INVALID_CONSULTANT_QUANTITY'));
check('negative Labour is rejected', validateProjectBoqRevision({ ...base, items: [{ ...base.items[0], labourRate: '-1' }] }).some(i => i.code === 'INVALID_LABOUR_RATE'));
check('unpriced working row is allowed', validateProjectBoqRevision({ ...base, items: [{ ...base.items[0], labourRate: null, materialRate: null }] }).length === 0);
check('invalid currency is rejected', validateProjectBoqRevision({ ...base, currencyCode: 'kzt' }).some(i => i.code === 'INVALID_CURRENCY_CODE'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
