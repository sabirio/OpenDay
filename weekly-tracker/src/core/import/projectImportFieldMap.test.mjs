// projectImportFieldMap.test.mjs - P0 Import Foundation v1 Phase 1: mapping tests.
// Run: node src/core/import/projectImportFieldMap.test.mjs
import {
  IMPORT_FIELD_CATALOG, FUTURE_CANONICAL_FIELDS, PROJECT_TYPE_VALUES,
  suggestColumnMapping, findMappingConflicts, applyColumnMapping,
  getFieldDefinition, getRequiredFieldKeys,
} from './projectImportFieldMap.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

console.log('\nprojectImportFieldMap - catalog is the single source of field vocabulary');
check('every catalog key is a real, existing projects.* column (audited list)',
  IMPORT_FIELD_CATALOG.every(f => ['store_code', 'shopping_mall_name', 'country', 'city', 'store_size_sqm', 'project_type', 'construction_start_date', 'target_opening_date', 'general_contractor', 'contractor_email'].includes(f.key)));
check('store_code is the only required field', getRequiredFieldKeys().length === 1 && getRequiredFieldKeys()[0] === 'store_code');
check('project type vocabulary matches the existing Projects.jsx filter list', JSON.stringify(PROJECT_TYPE_VALUES) === JSON.stringify(['New Opening', 'Rebuilding']));
check('getFieldDefinition finds a real field', getFieldDefinition('store_size_sqm')?.label === 'Area');
check('getFieldDefinition returns null for an unknown key', getFieldDefinition('actual_cost') === null);
check('Category C fields are catalogued as future-only, not as import destinations', FUTURE_CANONICAL_FIELDS.every(f => !IMPORT_FIELD_CATALOG.some(c => c.key === f.key)));

console.log('\nprojectImportFieldMap - exact canonical headers map (test 8)');
const exactSuggestions = suggestColumnMapping(['Store Code', 'Project Name', 'Country', 'Area']);
check('exact canonical labels map to the right field', exactSuggestions.find(s => s.header === 'Project Name').suggestedField === 'shopping_mall_name');
check('exact label match is case-insensitive and whitespace-tolerant', suggestColumnMapping(['  store code  '])[0].suggestedField === 'store_code');

console.log('\nprojectImportFieldMap - alias suggestions (test 9)');
check('"Sqm" suggests store_size_sqm', suggestColumnMapping(['Sqm'])[0].suggestedField === 'store_size_sqm');
check('"m2" suggests store_size_sqm', suggestColumnMapping(['m2'])[0].suggestedField === 'store_size_sqm');
check('"Store Area" suggests store_size_sqm', suggestColumnMapping(['Store Area'])[0].suggestedField === 'store_size_sqm');
check('"Planned Opening" suggests target_opening_date', suggestColumnMapping(['Planned Opening'])[0].suggestedField === 'target_opening_date');
check('"Opening Target" suggests target_opening_date', suggestColumnMapping(['Opening Target'])[0].suggestedField === 'target_opening_date');
check('"GC" suggests general_contractor', suggestColumnMapping(['GC'])[0].suggestedField === 'general_contractor');

console.log('\nprojectImportFieldMap - ambiguous aliases never auto-select (test 10)');
check('a header matching no alias produces no suggestion, not a guess', suggestColumnMapping(['Random Notes Column'])[0].suggestedField === null);
check('"Market" (a real, different existing field, sales_market) is NOT guessed as country', suggestColumnMapping(['Market'])[0].suggestedField === null);

console.log('\nprojectImportFieldMap - unknown columns remain explicitly unmapped (test 11)');
const unknownSuggestion = suggestColumnMapping(['Notes'])[0];
check('a genuinely unknown column has both suggestedField and unsupported as null', unknownSuggestion.suggestedField === null && unknownSuggestion.unsupported === null);

console.log('\nprojectImportFieldMap - Category C headers are surfaced, not silently ignored');
check('"Actual Cost" is recognized as an unsupported (not-yet-implemented) canonical field', suggestColumnMapping(['Actual Cost'])[0].unsupported?.key === 'actual_cost');
check('"Store Type" is recognized as an unsupported canonical field', suggestColumnMapping(['Store Type'])[0].unsupported?.key === 'store_type');
check('"Actual Opening" is recognized as an unsupported canonical field', suggestColumnMapping(['Actual Opening'])[0].unsupported?.key === 'actual_opening_date');
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
