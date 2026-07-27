// validateProjectImportRow.test.mjs - P0 Import Foundation v1 Phase 1/2: validation tests.
// Run: node src/core/import/validateProjectImportRow.test.mjs
import { validateProjectImportRow } from './validateProjectImportRow.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const validRow = {
  store_code: 'KZ001', shopping_mall_name: 'Mega Center', country: 'Kazakhstan', city: 'Almaty',
  location_type: 'Mall', store_size_sqm: '1250', project_type: 'New Opening', construction_start_date: '2024-01-15',
  target_opening_date: '2024-11-01', general_contractor: 'BuildCo', contractor_email: 'ops@buildco.example',
};

console.log('\nvalidateProjectImportRow - missing store code blocks (test 21)');
const missingCode = validateProjectImportRow({ ...validRow, store_code: '' });
check('a missing store code is invalid', missingCode.valid === false);
check('the error is structured, not just a display string', missingCode.errors[0].field === 'store_code' && missingCode.errors[0].code === 'MISSING_STORE_CODE' && typeof missingCode.errors[0].message === 'string');

console.log('\nvalidateProjectImportRow - required identity fields (frozen design §12/§13)');
check('missing country blocks', validateProjectImportRow({ ...validRow, country: '' }).errors.some(e => e.code === 'MISSING_COUNTRY'));
check('missing city blocks', validateProjectImportRow({ ...validRow, city: '' }).errors.some(e => e.code === 'MISSING_CITY'));
check('missing location_type blocks', validateProjectImportRow({ ...validRow, location_type: '' }).errors.some(e => e.code === 'MISSING_LOCATION_TYPE'));
check('missing project_type blocks (historical import must not guess a work type; live-UI defaulting is a separate code path)', validateProjectImportRow({ ...validRow, project_type: '' }).errors.some(e => e.code === 'MISSING_PROJECT_TYPE'));

console.log('\nvalidateProjectImportRow - invalid area blocks (test 22)');
check('unparseable area is invalid', validateProjectImportRow({ ...validRow, store_size_sqm: 'not a number' }).valid === false);
check('zero total area is invalid (must be > 0)', validateProjectImportRow({ ...validRow, store_size_sqm: '0' }).errors.some(e => e.code === 'INVALID_AREA'));
check('negative total area is invalid', validateProjectImportRow({ ...validRow, store_size_sqm: '-100' }).valid === false);
check('an omitted (optional) area does not block', validateProjectImportRow({ ...validRow, store_size_sqm: '' }).valid === true);

console.log('\nvalidateProjectImportRow - location invariants (frozen design §3/§4)');
check('Mall without a mall name blocks', validateProjectImportRow({ ...validRow, location_type: 'Mall', shopping_mall_name: '' }).errors.some(e => e.code === 'MALL_MISSING_MALL_NAME'));
check('Street with a mall name blocks', validateProjectImportRow({ ...validRow, location_type: 'Street', street: '123 Main St', shopping_mall_name: 'Mega Center' }).errors.some(e => e.code === 'STREET_WITH_MALL_NAME'));
check('Street without a street address blocks', validateProjectImportRow({ ...validRow, location_type: 'Street', shopping_mall_name: '' }).errors.some(e => e.code === 'STREET_MISSING_ADDRESS'));
check('a valid Street row (no mall name, has address) passes', validateProjectImportRow({ ...validRow, location_type: 'Street', shopping_mall_name: '', street: '123 Main St' }).valid === true);
check('an unrecognized location type WARNS, not BLOCKs (no DB enum — frozen design §11)',
  (() => {
    const result = validateProjectImportRow({ ...validRow, location_type: 'Airport' });
    return result.valid === true && result.warnings.some(w => w.code === 'UNKNOWN_LOCATION_TYPE');
  })());

console.log('\nvalidateProjectImportRow - sales/BOH area rules (frozen design §7)');
check('negative sales area blocks', validateProjectImportRow({ ...validRow, sales_area_sqm: '-1' }).errors.some(e => e.code === 'INVALID_AREA'));
check('negative BOH area blocks', validateProjectImportRow({ ...validRow, back_of_house_area_sqm: '-1' }).errors.some(e => e.code === 'INVALID_AREA'));
check('zero sales area is allowed (a tiny kiosk may legitimately have no dedicated sales floor split)', validateProjectImportRow({ ...validRow, sales_area_sqm: '0' }).valid === true);
check('sales area exceeding total area blocks', validateProjectImportRow({ ...validRow, store_size_sqm: '1000', sales_area_sqm: '1200' }).errors.some(e => e.code === 'SALES_AREA_EXCEEDS_TOTAL'));
check('sales+BOH within tolerance of total produces no warning', validateProjectImportRow({ ...validRow, store_size_sqm: '1250', sales_area_sqm: '900', back_of_house_area_sqm: '350' }).warnings.length === 0);
check('sales+BOH materially different from total WARNS, does not block or silently correct', (() => {
  const result = validateProjectImportRow({ ...validRow, store_size_sqm: '1250', sales_area_sqm: '900', back_of_house_area_sqm: '100' });
  return result.valid === true && result.warnings.some(w => w.code === 'AREA_SUM_MISMATCH') && result.normalizedRow.store_size_sqm === 1250;
})());

console.log('\nvalidateProjectImportRow - dates');
check('an ambiguous date blocks with AMBIGUOUS_DATE', validateProjectImportRow({ ...validRow, construction_start_date: '03/04/2025' }).errors.some(e => e.code === 'AMBIGUOUS_DATE'));
check('a malformed date blocks with INVALID_DATE', validateProjectImportRow({ ...validRow, target_opening_date: 'sometime next year' }).errors.some(e => e.code === 'INVALID_DATE'));
check('opening before start is a WARNING, not a blocking error (planned dates only)',
  (() => {
    const result = validateProjectImportRow({ ...validRow, construction_start_date: '2024-06-01', target_opening_date: '2024-01-01' });
    return result.valid === true && result.warnings.some(w => w.code === 'OPENING_BEFORE_START');
  })());

// Project Exchange v1 completion patch — Planned Construction End's
// invalid-chronology proof (task §15): construction_end_date before
// construction_start_date is a WARNING at the same severity as the sibling
// planned-date check above (target_opening_date), never a BLOCK — planned
// dates are estimates subject to revision; only ACTUAL/observed dates are
// hard business impossibilities (see the actual-date rules below).
check('construction end before construction start is a WARNING, not a blocking error, and the row still resolves valid/CREATE-eligible',
  (() => {
    const result = validateProjectImportRow({ ...validRow, construction_start_date: '2026-11-15', construction_end_date: '2026-08-01' });
    return result.valid === true && result.warnings.some(w => w.code === 'PLANNED_END_BEFORE_START' && w.field === 'construction_end_date');
  })());
check('construction end on/after construction start produces no warning', (() => {
  const result = validateProjectImportRow({ ...validRow, construction_start_date: '2026-08-01', construction_end_date: '2026-11-15' });
  return !result.warnings.some(w => w.code === 'PLANNED_END_BEFORE_START');
})());
check('a malformed construction_end_date blocks with INVALID_DATE (same treatment as every other date field)',
  validateProjectImportRow({ ...validRow, construction_end_date: 'sometime next year' }).errors.some(e => e.code === 'INVALID_DATE' && e.field === 'construction_end_date'));
check('an omitted construction_end_date never blocks', validateProjectImportRow({ ...validRow, construction_end_date: '' }).valid === true);

console.log('\nvalidateProjectImportRow - actual date rules (frozen design §6/§7; never reuses forecast-owned columns)');
check('actual completion before actual start blocks', validateProjectImportRow({ ...validRow, actual_construction_start_date: '2024-06-01', actual_construction_completion_date: '2024-01-01' }).errors.some(e => e.code === 'ACTUAL_COMPLETION_BEFORE_START'));
check('actual opening before actual construction start blocks', validateProjectImportRow({ ...validRow, actual_construction_start_date: '2024-06-01', actual_opening_date: '2024-01-01' }).errors.some(e => e.code === 'ACTUAL_OPENING_BEFORE_START'));
check('actual opening before actual construction completion WARNS, not blocks (real stores may open with punch-list items outstanding)', (() => {
  const result = validateProjectImportRow({ ...validRow, actual_construction_completion_date: '2024-10-15', actual_opening_date: '2024-10-01' });
  return result.valid === true && result.warnings.some(w => w.code === 'OPENING_BEFORE_CONSTRUCTION_COMPLETION');
})());
check('a fully consistent actual-date chain produces no errors or warnings on those fields', (() => {
  const result = validateProjectImportRow({ ...validRow, actual_construction_start_date: '2024-01-20', actual_construction_completion_date: '2024-10-01', actual_opening_date: '2024-11-05' });
  return result.valid === true && !result.warnings.some(w => w.field?.startsWith('actual_'));
})());

console.log('\nvalidateProjectImportRow - financial rules (frozen design §8)');
check('negative budget blocks', validateProjectImportRow({ ...validRow, budget: '-1', currency_code: 'USD' }).errors.some(e => e.code === 'INVALID_MONEY'));
check('negative actual cost blocks', validateProjectImportRow({ ...validRow, actual_cost: '-1', currency_code: 'USD' }).errors.some(e => e.code === 'INVALID_MONEY'));
check('budget without currency blocks', validateProjectImportRow({ ...validRow, budget: '500000' }).errors.some(e => e.code === 'MONEY_WITHOUT_CURRENCY'));
check('actual cost without currency blocks', validateProjectImportRow({ ...validRow, actual_cost: '500000' }).errors.some(e => e.code === 'MONEY_WITHOUT_CURRENCY'));
check('currency alone with no monetary values is allowed (frozen design: "currency alone -> ALLOW")', validateProjectImportRow({ ...validRow, currency_code: 'USD' }).valid === true);
check('budget + actual cost + currency together is fully valid', validateProjectImportRow({ ...validRow, budget: '500000', actual_cost: '520000', currency_code: 'USD' }).valid === true);
check('a malformed currency code (not 3 letters) blocks with INVALID_CURRENCY_FORMAT', validateProjectImportRow({ ...validRow, budget: '1', currency_code: 'Dollars' }).errors.some(e => e.code === 'INVALID_CURRENCY_FORMAT'));
check('a well-formed but non-allow-listed currency code WARNS, does not block (a 3-letter regex alone never proves a real currency)', (() => {
  const result = validateProjectImportRow({ ...validRow, budget: '1', currency_code: 'XYZ' });
  return result.valid === true && result.warnings.some(w => w.code === 'UNRECOGNIZED_CURRENCY');
})());
check('unknown monetary values stay NULL, never manufactured as 0', validateProjectImportRow(validRow).normalizedRow.budget === null && validateProjectImportRow(validRow).normalizedRow.actual_cost === null);

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

console.log('\nvalidateProjectImportRow - store_concept and optional historical facts are never required (frozen design §12/§13)');
check('missing store_concept never blocks', validateProjectImportRow({ ...validRow, store_concept: '' }).valid === true);
check('missing sales/BOH area never blocks', validateProjectImportRow({ ...validRow, sales_area_sqm: '', back_of_house_area_sqm: '' }).valid === true);
check('missing actual dates never block', validateProjectImportRow({ ...validRow, actual_construction_start_date: '', actual_construction_completion_date: '', actual_opening_date: '' }).valid === true);
check('missing financial values never block', validateProjectImportRow({ ...validRow, budget: '', actual_cost: '', currency_code: '' }).valid === true);
check('missing contractor email never blocks', validateProjectImportRow({ ...validRow, contractor_email: '' }).valid === true);
check('an arbitrary, non-empty historical store_concept is preserved verbatim, never fabricated into a different value', validateProjectImportRow({ ...validRow, store_concept: 'Legacy Format 3' }).normalizedRow.store_concept === 'Legacy Format 3');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
