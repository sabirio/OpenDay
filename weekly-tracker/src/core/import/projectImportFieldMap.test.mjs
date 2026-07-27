// projectImportFieldMap.test.mjs - P0 Import Foundation v1 Phase 1/2: mapping tests.
// Run: node src/core/import/projectImportFieldMap.test.mjs
import {
  IMPORT_FIELD_CATALOG, FUTURE_CANONICAL_FIELDS, PROJECT_TYPE_VALUES, LOCATION_TYPE_VALUES, ISO_4217_CURRENCY_CODES,
  suggestColumnMapping, findMappingConflicts, applyColumnMapping,
  getFieldDefinition, getRequiredFieldKeys,
} from './projectImportFieldMap.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const CANONICAL_KEYS = [
  'store_code', 'shopping_mall_name', 'country', 'city', 'location_type', 'street',
  'store_size_sqm', 'sales_area_sqm', 'back_of_house_area_sqm', 'project_type', 'store_concept',
  'construction_start_date', 'construction_end_date', 'target_opening_date', 'actual_construction_start_date',
  'actual_construction_completion_date', 'actual_opening_date', 'budget', 'actual_cost', 'currency_code',
  'general_contractor', 'contractor_email',
];

console.log('\nprojectImportFieldMap - catalog is the single source of field vocabulary');
check('every catalog key is a real, existing projects.* column (audited list, post-migration-037)',
  IMPORT_FIELD_CATALOG.every(f => CANONICAL_KEYS.includes(f.key)));
check('every expected canonical field has a catalog entry', CANONICAL_KEYS.every(key => IMPORT_FIELD_CATALOG.some(f => f.key === key)));
check('required identity/business fields match the frozen design (store_code, country, city, location_type, project_type)',
  getRequiredFieldKeys().sort().join(',') === ['city', 'country', 'location_type', 'project_type', 'store_code'].sort().join(','));
check('project type vocabulary matches the existing Projects.jsx filter list', JSON.stringify(PROJECT_TYPE_VALUES) === JSON.stringify(['New Opening', 'Rebuilding']));
check('location type vocabulary is exactly Mall/Street in v1', JSON.stringify(LOCATION_TYPE_VALUES) === JSON.stringify(['Mall', 'Street']));
check('the ISO 4217 allow-list contains common retail-construction currencies', ['USD', 'EUR', 'AED', 'GBP'].every(code => ISO_4217_CURRENCY_CODES.includes(code)));
// Certification finding (Project Exchange v1 cleanup): KZT is a valid stored
// project currency (projects.currency_code is free TEXT, not FK'd to this
// list) but was missing from the curated recognition list, so a real
// Kazakhstan project imported/exported with KZT was flagged as an
// unrecognized-but-well-formed code. Fixed by adding it, not by weakening
// the recognition check itself.
check('KZT is a recognized currency (Project Exchange v1 certification fix)', ISO_4217_CURRENCY_CODES.includes('KZT'));
check('getFieldDefinition finds a real field', getFieldDefinition('store_size_sqm')?.label === 'Total Area');
check('getFieldDefinition returns null for an unknown key', getFieldDefinition('made_up_field') === null);
check('no Category C gaps remain — FUTURE_CANONICAL_FIELDS is empty as of migration 037', FUTURE_CANONICAL_FIELDS.length === 0);

console.log('\nprojectImportFieldMap - Phase 1 field-mapping debt fix (frozen design correction pass §4A)');
check('shopping_mall_name is labeled "Shopping Mall Name", not "Project Name"', getFieldDefinition('shopping_mall_name').label === 'Shopping Mall Name');
check('"Project Name" is no longer a recognized alias for anything (must not silently populate the mall name)', suggestColumnMapping(['Project Name'])[0].suggestedField === null);
check('"Mall Name" still maps to shopping_mall_name (the real alias is preserved)', suggestColumnMapping(['Mall Name'])[0].suggestedField === 'shopping_mall_name');
check('"Shopping Mall Name" (the new canonical label) maps to shopping_mall_name', suggestColumnMapping(['Shopping Mall Name'])[0].suggestedField === 'shopping_mall_name');

console.log('\nprojectImportFieldMap - exact canonical headers map (test 8)');
const exactSuggestions = suggestColumnMapping(['Store Code', 'Mall', 'Country', 'Area']);
check('exact canonical labels/aliases map to the right field', exactSuggestions.find(s => s.header === 'Mall').suggestedField === 'shopping_mall_name');
check('exact label match is case-insensitive and whitespace-tolerant', suggestColumnMapping(['  store code  '])[0].suggestedField === 'store_code');

console.log('\nprojectImportFieldMap - alias suggestions (test 9)');
check('"Sqm" suggests store_size_sqm', suggestColumnMapping(['Sqm'])[0].suggestedField === 'store_size_sqm');
check('"m2" suggests store_size_sqm', suggestColumnMapping(['m2'])[0].suggestedField === 'store_size_sqm');
check('"Store Area" suggests store_size_sqm', suggestColumnMapping(['Store Area'])[0].suggestedField === 'store_size_sqm');
check('"Planned Opening" suggests target_opening_date', suggestColumnMapping(['Planned Opening'])[0].suggestedField === 'target_opening_date');
check('"Opening Target" suggests target_opening_date', suggestColumnMapping(['Opening Target'])[0].suggestedField === 'target_opening_date');
// Project Exchange v1 completion patch: Planned Construction End round-trip.
check('"Planned Construction End" (the generated canonical header) suggests construction_end_date', suggestColumnMapping(['Planned Construction End'])[0].suggestedField === 'construction_end_date');
check('"Construction End" suggests construction_end_date', suggestColumnMapping(['Construction End'])[0].suggestedField === 'construction_end_date');
check('"Planned End" suggests construction_end_date', suggestColumnMapping(['Planned End'])[0].suggestedField === 'construction_end_date');
check('construction_end_date is never confused with the engine-owned forecast field ("Forecast Completion" remains unmapped)', suggestColumnMapping(['Forecast Completion'])[0].suggestedField === null);
check('"GC" suggests general_contractor', suggestColumnMapping(['GC'])[0].suggestedField === 'general_contractor');
check('"Location Type" suggests location_type', suggestColumnMapping(['Location Type'])[0].suggestedField === 'location_type');
check('"Street Address" suggests street', suggestColumnMapping(['Street Address'])[0].suggestedField === 'street');
check('"Sales Area" suggests sales_area_sqm', suggestColumnMapping(['Sales Area'])[0].suggestedField === 'sales_area_sqm');
check('"BOH" suggests back_of_house_area_sqm', suggestColumnMapping(['BOH'])[0].suggestedField === 'back_of_house_area_sqm');
check('"Store Concept" suggests store_concept', suggestColumnMapping(['Store Concept'])[0].suggestedField === 'store_concept');
check('"Actual Construction Start" suggests actual_construction_start_date', suggestColumnMapping(['Actual Construction Start'])[0].suggestedField === 'actual_construction_start_date');
check('"Actual Completion" suggests actual_construction_completion_date', suggestColumnMapping(['Actual Completion'])[0].suggestedField === 'actual_construction_completion_date');
check('"Actual Opening" suggests actual_opening_date', suggestColumnMapping(['Actual Opening'])[0].suggestedField === 'actual_opening_date');
check('"Budget" suggests budget', suggestColumnMapping(['Budget'])[0].suggestedField === 'budget');
check('"Actual Cost" suggests actual_cost', suggestColumnMapping(['Actual Cost'])[0].suggestedField === 'actual_cost');
check('"Currency" suggests currency_code', suggestColumnMapping(['Currency'])[0].suggestedField === 'currency_code');

console.log('\nprojectImportFieldMap - ambiguous aliases never auto-select (test 10)');
check('a header matching no alias produces no suggestion, not a guess', suggestColumnMapping(['Random Notes Column'])[0].suggestedField === null);
check('"Market" (a real, different existing field, sales_market) is NOT guessed as country', suggestColumnMapping(['Market'])[0].suggestedField === null);

console.log('\nprojectImportFieldMap - unknown columns remain explicitly unmapped (test 11)');
const unknownSuggestion = suggestColumnMapping(['Notes'])[0];
check('a genuinely unknown column has both suggestedField and unsupported as null', unknownSuggestion.suggestedField === null && unknownSuggestion.unsupported === null);

console.log('\nprojectImportFieldMap - no Category C headers remain unsupported (all resolved by migration 037)');
check('a header that used to be a Category C gap now maps to a real field instead of being reported unsupported', suggestColumnMapping(['Actual Cost'])[0].unsupported === null && suggestColumnMapping(['Actual Cost'])[0].suggestedField === 'actual_cost');
check('with FUTURE_CANONICAL_FIELDS empty, no header can ever be reported unsupported', suggestColumnMapping(['Anything At All'])[0].unsupported === null);
check('a header both suggested AND coincidentally future-like never reports both (suggestedField wins, unsupported is null)',
  suggestColumnMapping(['Area'])[0].suggestedField === 'store_size_sqm' && suggestColumnMapping(['Area'])[0].unsupported === null);

console.log('\nprojectImportFieldMap - one source column cannot map to multiple fields (test 12) / duplicate canonical targets detected (test 13)');
check('a single header never suggests two different canonical fields (suggestColumnMapping returns one field per header)',
  suggestColumnMapping(['Sqm']).length === 1 && typeof suggestColumnMapping(['Sqm'])[0].suggestedField === 'string' || suggestColumnMapping(['Sqm'])[0].suggestedField === 'store_size_sqm');
check('no conflicts reported for an unambiguous mapping', findMappingConflicts({ 'Store Code': 'store_code', Sqm: 'store_size_sqm' }).length === 0);
check('two headers assigned to the same canonical field are reported as a conflict', (() => {
  const conflicts = findMappingConflicts({ Sqm: 'store_size_sqm', Area: 'store_size_sqm' });
  return conflicts.length === 1 && conflicts[0].canonicalField === 'store_size_sqm' && conflicts[0].headers.sort().join(',') === 'Area,Sqm';
})());
check('an empty/null mapping produces no conflicts', findMappingConflicts({}).length === 0 && findMappingConflicts(null).length === 0);

console.log('\nprojectImportFieldMap - applying a mapping to one positional row is pure data shuffling');
const applied = applyColumnMapping(['Store Code', 'Sqm', 'Notes'], ['KZ001', '1200', 'irrelevant'], { 'Store Code': 'store_code', Sqm: 'store_size_sqm' });
check('mapped fields are extracted by canonical key', applied.store_code === 'KZ001' && applied.store_size_sqm === '1200');
check('unmapped columns are dropped, not silently carried through under an arbitrary key', Object.keys(applied).length === 2);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
