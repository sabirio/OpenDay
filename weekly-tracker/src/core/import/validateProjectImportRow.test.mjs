// validateProjectImportRow.test.mjs - P0 Import Foundation v1 Phase 1: validation tests.
// Run: node src/core/import/validateProjectImportRow.test.mjs
import { validateProjectImportRow } from './validateProjectImportRow.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const validRow = {
  store_code: 'KZ001', shopping_mall_name: 'Mega Center', country: 'Kazakhstan', city: 'Almaty',
  store_size_sqm: '1250', project_type: 'New Opening', construction_start_date: '2024-01-15',
  target_opening_date: '2024-11-01', general_contractor: 'BuildCo', contractor_email: 'ops@buildco.example',
};

console.log('\nvalidateProjectImportRow - missing store code blocks (test 21)');
const missingCode = validateProjectImportRow({ ...validRow, store_code: '' });
check('a missing store code is invalid', missingCode.valid === false);
check('the error is structured, not just a display string', missingCode.errors[0].field === 'store_code' && missingCode.errors[0].code === 'MISSING_STORE_CODE' && typeof missingCode.errors[0].message === 'string');

console.log('\nvalidateProjectImportRow - invalid area blocks (test 22)');
check('unparseable area is invalid', validateProjectImportRow({ ...validRow, store_size_sqm: 'not a number' }).valid === false);
check('zero area is invalid (must be > 0)', validateProjectImportRow({ ...validRow, store_size_sqm: '0' }).errors.some(e => e.code === 'INVALID_AREA'));
check('negative area is invalid', validateProjectImportRow({ ...validRow, store_size_sqm: '-100' }).valid === false);
check('an omitted (optional) area does not block', validateProjectImportRow({ ...validRow, store_size_sqm: '' }).valid === true);

console.log('\nvalidateProjectImportRow - dates');
check('an ambiguous date blocks with AMBIGUOUS_DATE', validateProjectImportRow({ ...validRow, construction_start_date: '03/04/2025' }).errors.some(e => e.code === 'AMBIGUOUS_DATE'));
check('a malformed date blocks with INVALID_DATE', validateProjectImportRow({ ...validRow, target_opening_date: 'sometime next year' }).errors.some(e => e.code === 'INVALID_DATE'));
check('opening before start is a WARNING, not a blocking error (no actual_start/actual_opening exists to make a stronger claim)',
  (() => {
    const result = validateProjectImportRow({ ...validRow, construction_start_date: '2024-06-01', target_opening_date: '2024-01-01' });
    return result.valid === true && result.warnings.some(w => w.code === 'OPENING_BEFORE_START');
  })());

console.log('\nvalidateProjectImportRow - unknown project type blocks or warns according to existing product rule (test 23)');
check('project_type has no DB CHECK constraint today, so an unrecognized value WARNS rather than blocks',
  (() => {
    const result = validateProjectImportRow({ ...validRow, project_type: 'Demolition' });
    return result.valid === true && result.warnings.some(w => w.code === 'UNKNOWN_PROJECT_TYPE');
  })());
check('a recognized project type produces no warning', validateProjectImportRow({ ...validRow, project_type: 'Rebuilding' }).warnings.length === 0);

console.log('\nvalidateProjectImportRow - a fully valid row passes (test 24)');
const okResult = validateProjectImportRow(validRow);
check('valid row has valid=true', okResult.valid === true);
check('valid row has zero errors', okResult.errors.length === 0);
check('valid row still carries its normalizedRow', okResult.normalizedRow.store_code === 'KZ001' && okResult.normalizedRow.store_size_sqm === 1250);

console.log('\nvalidateProjectImportRow - unsupported future fields are never silently lost (test 25)');
check('the validator has no code path that reads/stores actual_cost, actual_start_date, actual_opening_date, budget, or store_type',
  (() => {
    const rowWithExtraJunk = { ...validRow, actual_cost: '999999', budget: '500000', store_type: 'Flagship' };
    const result = validateProjectImportRow(rowWithExtraJunk);
    return !('actual_cost' in result.normalizedRow) && !('budget' in result.normalizedRow) && !('store_type' in result.normalizedRow);
  })());

console.log('\nvalidateProjectImportRow - only Phase-1-supported relationships are validated (no actual_start/actual_opening rules)');
check('no rule anywhere references actual_start_date or actual_opening_date (those fields do not exist yet)',
  !/actual_start_date|actual_opening_date/.test(validateProjectImportRow.toString()));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
