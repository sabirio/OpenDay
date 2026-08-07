import {
  TEMPLATE_SELECT,
  toTemplateRecord,
  isTemplateSchemaContractError,
  TemplateDataContractError,
} from './templateRecordContract.js';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  OK ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
}
function checkThrows(label, action, ErrorClass) {
  try {
    action();
    check(label, false);
  } catch (error) {
    check(label, error instanceof ErrorClass);
  }
}

console.log('\ntemplateRecordContract — DB-boundary normalization, validation, and schema-compatibility classification\n');

// ── TemplateRecord contract (tests 1-7) ────────────────────────────────────

// 1. valid baseline legacy row (no family/company_id columns at all - the
//    raw row simply never has those keys, exactly like a select('*') result
//    from the current production schema).
const baselineRow = {
  id: 'a1b2c3d4-0000-0000-0000-000000000001',
  name: 'Retail Fit-Out (Legacy)',
  data: { phases: [], workPackages: [] },
  is_active: true,
  updated_at: '2026-01-01T00:00:00Z',
  family_id: 'f1000000-0000-0000-0000-000000000001',
  version: 1,
};
const baselineRecord = toTemplateRecord(baselineRow);
check('1. valid baseline legacy row normalizes with family/companyId defaulted to null',
  baselineRecord.id === baselineRow.id
  && baselineRecord.name === baselineRow.name
  && baselineRecord.data === baselineRow.data
  && baselineRecord.isActive === true
  && baselineRecord.family === null
  && baselineRecord.familyId === baselineRow.family_id
  && baselineRecord.companyId === null
  && baselineRecord.version === 1
  && baselineRecord.updatedAt === baselineRow.updated_at);

// 2. valid V2 row (family/company_id physically present).
const v2Row = {
  id: 'a1b2c3d4-0000-0000-0000-000000000002',
  name: 'Retail Fit-Out (Master Catalog)',
  data: { schemaVersion: '2', zones: [] },
  is_active: false,
  updated_at: '2026-07-29T00:00:00Z',
  family_id: 'f2000000-0000-0000-0000-000000000002',
  family: 'retail-fitout-v2',
  company_id: null,
  version: 2,
};
const v2Record = toTemplateRecord(v2Row);
check('2. valid V2 row normalizes with real family/companyId values preserved',
  v2Record.family === 'retail-fitout-v2' && v2Record.familyId === v2Row.family_id
  && v2Record.companyId === null && v2Record.version === 2 && v2Record.isActive === false);

// 3. missing id rejected
checkThrows('3. missing id rejected', () => toTemplateRecord({ ...baselineRow, id: undefined }), TemplateDataContractError);
checkThrows('3b. empty-string id rejected', () => toTemplateRecord({ ...baselineRow, id: '' }), TemplateDataContractError);
checkThrows('3c. non-string id rejected', () => toTemplateRecord({ ...baselineRow, id: 42 }), TemplateDataContractError);

// 4. missing name rejected
checkThrows('4. missing name rejected', () => toTemplateRecord({ ...baselineRow, name: undefined }), TemplateDataContractError);
checkThrows('4b. blank name rejected', () => toTemplateRecord({ ...baselineRow, name: '   ' }), TemplateDataContractError);

// 5. malformed/null/array data rejected
checkThrows('5a. null data rejected', () => toTemplateRecord({ ...baselineRow, data: null }), TemplateDataContractError);
checkThrows('5b. array data rejected', () => toTemplateRecord({ ...baselineRow, data: [] }), TemplateDataContractError);
checkThrows('5c. string data rejected', () => toTemplateRecord({ ...baselineRow, data: 'not-an-object' }), TemplateDataContractError);
checkThrows('5d. missing data rejected', () => toTemplateRecord({ ...baselineRow, data: undefined }), TemplateDataContractError);

// 6. invalid is_active rejected
checkThrows('6a. string is_active rejected', () => toTemplateRecord({ ...baselineRow, is_active: 'true' }), TemplateDataContractError);
checkThrows('6b. null is_active rejected', () => toTemplateRecord({ ...baselineRow, is_active: null }), TemplateDataContractError);
checkThrows('6c. missing is_active rejected', () => toTemplateRecord({ ...baselineRow, is_active: undefined }), TemplateDataContractError);

// 7. unknown columns excluded
const rowWithUnknownColumns = { ...baselineRow, some_future_column: 'unexpected', another_leak: { nested: true } };
const normalizedWithUnknowns = toTemplateRecord(rowWithUnknownColumns);
check('7. unknown raw DB columns never escape the boundary',
  !Object.hasOwn(normalizedWithUnknowns, 'some_future_column')
  && !Object.hasOwn(normalizedWithUnknowns, 'another_leak')
  && Object.keys(normalizedWithUnknowns).sort().join(',') === 'companyId,data,family,familyId,id,isActive,name,updatedAt,version');

check('malformed row throws, never silently returns null', (() => {
  try { toTemplateRecord(null); return false; } catch (e) { return e instanceof TemplateDataContractError; }
})());
check('malformed row is never converted to a filterable falsy value via filter(Boolean) semantics', (() => {
  try { toTemplateRecord(undefined); return false; } catch { return true; }
})());

check('TEMPLATE_SELECT is the wildcard contract', TEMPLATE_SELECT === '*');

// ── Schema contract classifier (tests 8-13) ────────────────────────────────

// 8. 42703 templates.family → compatibility error
check('8. 42703 templates.family classified as compatibility error',
  isTemplateSchemaContractError({ code: '42703', message: 'column templates.family does not exist' }));
check('8b. schema-qualified, quoted variant also classified',
  isTemplateSchemaContractError({ code: '42703', message: 'column "public.templates.family" does not exist' }));

// 9. 42703 templates.company_id → compatibility error
check('9. 42703 templates.company_id classified as compatibility error',
  isTemplateSchemaContractError({ code: '42703', message: 'column templates.company_id does not exist' }));

// 10. unrelated 42703 → not compatibility
check('10a. 42703 on a different table is NOT classified as compatibility',
  !isTemplateSchemaContractError({ code: '42703', message: 'column projects.family does not exist' }));
check('10b. 42703 on a different templates column is NOT classified as compatibility',
  !isTemplateSchemaContractError({ code: '42703', message: 'column templates.unexpected_column does not exist' }));
check('10c. 42703 with no message is NOT classified as compatibility (fails closed)',
  !isTemplateSchemaContractError({ code: '42703' }));
check('10d. loose substring match is deliberately rejected - "family" appearing incidentally in an unrelated message must not match',
  !isTemplateSchemaContractError({ code: '42703', message: 'column templates.family_notes does not exist' }));

// 11. permission/RLS error → not compatibility
check('11. permission/RLS error (42501) is NOT classified as compatibility',
  !isTemplateSchemaContractError({ code: '42501', message: 'permission denied for table templates' }));
check('11b. PostgREST JWT/auth error is NOT classified as compatibility',
  !isTemplateSchemaContractError({ status: 401, code: 'PGRST301', message: 'JWT expired' }));

// 12. network error → not compatibility
check('12. a raw network TypeError is NOT classified as compatibility',
  !isTemplateSchemaContractError(new TypeError('Failed to fetch')));
check('12b. an AbortError/timeout is NOT classified as compatibility',
  !isTemplateSchemaContractError(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })));

// 13. missing table → not compatibility
check('13. "relation does not exist" (42P01, a missing TABLE, not column) is NOT classified as compatibility',
  !isTemplateSchemaContractError({ code: '42P01', message: 'relation "templates" does not exist' }));
check('13b. undefined/null error is NOT classified as compatibility (fails closed)',
  !isTemplateSchemaContractError(undefined) && !isTemplateSchemaContractError(null));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
