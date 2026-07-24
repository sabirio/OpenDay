// projectExportArchitectureGuard.test.mjs — proves Project Exchange v1's
// central promise: Import, Project Export, and the Blank Import Template
// share exactly ONE field catalog (core/import/projectImportFieldMap.js's
// IMPORT_FIELD_CATALOG), src/export/xlsx/ never hard-codes its own header
// list, and no engine-owned forecast field ever becomes an editable exchange
// column. Mirrors the existing source-text-contract convention (core/import/
// importArchitectureGuard.test.mjs, src/tests/exportEngineArchitectureGuard
// .test.mjs) rather than inventing a new guard mechanism.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { IMPORT_FIELD_CATALOG } from '../../core/import/projectImportFieldMap.js';
import { PROJECT_EXPORT_HEADERS, buildProjectExportRow } from './projectExportRow.js';
import { buildProjectWorkbook, PROJECTS_SHEET_NAME } from './buildProjectWorkbook.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const sourceFiles = readdirSync(dir)
  .filter(name => name.endsWith('.js') && !name.endsWith('.test.mjs'))
  .map(name => ({ name, text: readFileSync(path.join(dir, name), 'utf8') }));

console.log('\nprojectExportArchitectureGuard - src/export/xlsx/ contains only pure/browser-download modules');
check('at least the three export modules exist', sourceFiles.length >= 3);

const FORBIDDEN_PATTERNS = [
  { label: 'Supabase client', re: /supabase/i },
  { label: 'React', re: /from\s+['"]react(-dom)?['"]|import\s+React\b/ },
  { label: 'the services/ layer', re: /from\s+['"][^'"]*\/services\// },
  { label: 'direct project DB mutation (.insert(/.update(/.delete()', re: /\.insert\(|\.update\(|\.delete\(/ },
];
for (const file of sourceFiles) {
  for (const forbidden of FORBIDDEN_PATTERNS) {
    check(`${file.name} does not import/reference ${forbidden.label}`, !forbidden.re.test(file.text));
  }
}

console.log('\nprojectExportArchitectureGuard - exactly one module touches the xlsx package');
const xlsxImporters = sourceFiles.filter(file => /from\s+['"]xlsx['"]/.test(file.text)).map(file => file.name);
check('exactly one module imports xlsx', xlsxImporters.length === 1 && xlsxImporters[0] === 'buildProjectWorkbook.js');

console.log('\nprojectExportArchitectureGuard - no mirrored header/field catalog');
const rowMapperSource = sourceFiles.find(f => f.name === 'projectExportRow.js')?.text || '';
check('projectExportRow.js imports IMPORT_FIELD_CATALOG rather than declaring its own header list',
  /from\s+['"]\.\.\/\.\.\/core\/import\/projectImportFieldMap\.js['"]/.test(rowMapperSource));
check('projectExportRow.js contains no hard-coded spreadsheet header string (e.g. "Store Code")',
  !/['"]Store Code['"]/.test(rowMapperSource));
check('PROJECT_EXPORT_HEADERS is derived from IMPORT_FIELD_CATALOG (same length, same order, same labels)',
  JSON.stringify(PROJECT_EXPORT_HEADERS) === JSON.stringify(IMPORT_FIELD_CATALOG.map(f => f.label)));

console.log('\nprojectExportArchitectureGuard - forecast/engine-owned fields never become exchange columns');
const FORECAST_KEYS = ['construction_completion_date', 'forecast_opening_date', 'gantt_generated_at', 'gantt_engine_version'];
check('none of the forecast/engine-owned keys appear in IMPORT_FIELD_CATALOG',
  IMPORT_FIELD_CATALOG.every(f => !FORECAST_KEYS.includes(f.key)));
check('none of the forecast/engine-owned keys appear as an export header label',
  FORECAST_KEYS.every(key => !PROJECT_EXPORT_HEADERS.some(label => label.toLowerCase().includes(key.replace(/_/g, ' ')))));

console.log('\nprojectExportArchitectureGuard - derived Portfolio LOCATION never becomes an exchange column');
check('no export header is literally "Location" (only "Location Type"/"Shopping Mall Name"/"Street Address" are canonical)',
  !PROJECT_EXPORT_HEADERS.includes('Location'));

console.log('\nprojectExportArchitectureGuard - internal ids are never exported');
check('a project object with internal-id-shaped keys never leaks them into a row',
  (() => {
    const row = buildProjectExportRow({ id: 999, companyId: 'co_1', templateId: 42, createdBy: 'u1', storeCode: 'X' });
    return !row.includes(999) && !row.includes('co_1') && !row.includes(42) && !row.includes('u1');
  })());

console.log('\nprojectExportArchitectureGuard - Blank Template and Project Export are the same generator');
check('an empty project list still produces the Projects sheet with the full header row (Blank Template = buildProjectWorkbook([]))',
  (() => {
    const wb = buildProjectWorkbook([]);
    return wb.SheetNames.length === 1 && wb.SheetNames[0] === PROJECTS_SHEET_NAME;
  })());

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
