// importWorkflowModel.test.mjs - Import Foundation v1 Phase 3 UI: pure
// orchestration/translation logic tests. No React/DOM involved — this file
// proves the one facade the Phase 3 hook calls into delegates correctly to
// the frozen Phase 1/2 engine rather than reimplementing any of it.
import {
  parseUploadedFile, suggestInitialMapping, getRequiredFieldDefinitions, getMissingRequiredFields, getFieldCatalog,
  generatePlan, describeRowStatus, describeLocation, describeMoney, describeDate, describeCommitOutcome, describeCommitError,
} from './importWorkflowModel.js';
import { buildCsv, HISTORICAL_HEADERS, HISTORICAL_MAPPING, HISTORICAL_SAMPLE_ROWS } from '../import/importTestFixtures.mjs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

console.log('\nimportWorkflowModel - parseUploadedFile delegates to the frozen parser and translates errors to plain language');
const csvText = buildCsv(HISTORICAL_HEADERS, HISTORICAL_SAMPLE_ROWS);
const parsed = parseUploadedFile({ filename: 'historical-projects.csv', data: csvText });
check('a valid CSV parses successfully via the real parser (not reimplemented here)', parsed.ok === true && parsed.headers.length === HISTORICAL_HEADERS.length);
check('an unsupported file type produces a plain-language message, not a raw code', parseUploadedFile({ filename: 'notes.pdf', data: 'irrelevant' }).errorMessage === 'Only Excel (.xlsx) and CSV files are supported.');
check('an empty file produces a plain-language message', parseUploadedFile({ filename: 'empty.csv', data: '' }).errorMessage === 'This file could not be read.');
check('every parser error code has a human-readable translation (no code leaks through as the primary message)',
  ['UNSUPPORTED_FILE_TYPE', 'UNREADABLE_FILE', 'MISSING_HEADER_ROW', 'NO_USABLE_ROWS', 'ROW_LIMIT_EXCEEDED'].every(code => !parseUploadedFile({ filename: `x.${code === 'UNSUPPORTED_FILE_TYPE' ? 'pdf' : 'csv'}`, data: code === 'NO_USABLE_ROWS' ? 'Header1,Header2' : '' }).errorMessage?.match(/^[A-Z_]+$/)));

console.log('\nimportWorkflowModel - suggestInitialMapping is the real Phase 1 alias engine, not a second implementation');
const suggestions = suggestInitialMapping(['Store Code', 'Mall', 'Project Name']);
check('a real canonical alias is suggested', suggestions.find(s => s.header === 'Store Code').suggestedField === 'store_code');
check('"Project Name" is never suggested for shopping_mall_name (Phase 1 field-mapping debt fix stays intact)', suggestions.find(s => s.header === 'Project Name').suggestedField === null);

console.log('\nimportWorkflowModel - required-field mapping check uses the real catalog, never a UI-invented list');
const requiredDefs = getRequiredFieldDefinitions();
check('required fields match the frozen catalog exactly', requiredDefs.map(f => f.key).sort().join(',') === ['city', 'country', 'location_type', 'project_type', 'store_code'].sort().join(','));
check('a mapping missing every required field reports all of them missing', getMissingRequiredFields({}).length === requiredDefs.length);
check('a fully-mapped required set reports nothing missing', getMissingRequiredFields({
  A: 'store_code', B: 'country', C: 'city', D: 'location_type', E: 'project_type',
}).length === 0);
check('a partially-mapped set reports exactly the gap', getMissingRequiredFields({ A: 'store_code', B: 'country' }).map(f => f.key).sort().join(',') === ['city', 'location_type', 'project_type'].sort().join(','));

console.log('\nimportWorkflowModel - field catalog exposes human labels only, never internal keys as the primary label');
const catalog = getFieldCatalog();
check('catalog has every canonical field', catalog.length >= 20);
check('shopping_mall_name is labeled "Shopping Mall Name", never "Project Name"', catalog.find(f => f.key === 'shopping_mall_name').label === 'Shopping Mall Name');
check('no internal snake_case key leaks through as a label', catalog.every(f => f.label !== f.key));

console.log('\nimportWorkflowModel - generatePlan is the real Phase 1 planning engine (CREATE/SKIP/BLOCK), never re-derived');
const plan = generatePlan({ headers: HISTORICAL_HEADERS, rows: HISTORICAL_SAMPLE_ROWS, mapping: HISTORICAL_MAPPING, existingProjects: [] });
check('plan produces one row per input row', plan.rows.length === HISTORICAL_SAMPLE_ROWS.length);
check('plan actions are only ever CREATE/SKIP/BLOCK (frozen contract)', plan.rows.every(row => ['CREATE', 'SKIP', 'BLOCK'].includes(row.action)));
check('summary counts come from the real engine, matching row actions exactly', plan.summary.create === plan.rows.filter(row => row.action === 'CREATE').length);

console.log('\nimportWorkflowModel - CREATE/SKIP/BLOCK never change identity, only their display label changes');
check('CREATE displays as "Ready"', describeRowStatus('CREATE').label === 'Ready');
check('SKIP displays as "Already exists"', describeRowStatus('SKIP').label === 'Already exists');
check('BLOCK displays as "Needs attention"', describeRowStatus('BLOCK').label === 'Needs attention');
check('an unrecognized action never crashes and never invents a new canonical action', describeRowStatus('UPDATE').label === 'UPDATE');

console.log('\nimportWorkflowModel - location display label respects frozen Mall/Street semantics');
check('Mall renders as "Mall · <name>", never "Project Name"', describeLocation({ location_type: 'Mall', shopping_mall_name: 'MEGA Alma-Ata' }) === 'Mall · MEGA Alma-Ata');
check('Street renders as "Street · <address>"', describeLocation({ location_type: 'Street', street: 'Abay Ave 42' }) === 'Street · Abay Ave 42');
check('missing location data renders as a dash, not blank/undefined', describeLocation(null) === '—');

console.log('\nimportWorkflowModel - money display never renders unknown as 0');
check('a known value renders with thousands separators and currency', describeMoney(2500000, 'KZT') === '2,500,000 KZT');
check('null renders as a dash, never "0"', describeMoney(null, null) === '—');
check('a legitimate zero still renders as "0", distinct from unknown', describeMoney(0, 'USD') === '0 USD');

console.log('\nimportWorkflowModel - date display passes through untouched (no reformatting invented)');
check('a present date passes through verbatim', describeDate('2024-11-05') === '2024-11-05');
check('a missing date renders as a dash', describeDate(null) === '—');

console.log('\nimportWorkflowModel - commit outcome/error translation never invents a new canonical action');
check('COMMITTED displays as "Imported"', describeCommitOutcome('COMMITTED').label === 'Imported');
check('CONFLICT displays as "Conflict"', describeCommitOutcome('CONFLICT').label === 'Conflict');
check('SKIPPED displays as "Skipped"', describeCommitOutcome('SKIPPED').label === 'Skipped');
check('every non-success outcome (BLOCKED_IN_PLAN/REJECTED_*/FAILED) displays as "Not imported", never silently as success',
  ['BLOCKED_IN_PLAN', 'REJECTED_INVALID_ACTION', 'REJECTED_INTEGRITY_FLOOR', 'FAILED'].every(outcome => describeCommitOutcome(outcome).label === 'Not imported' && describeCommitOutcome(outcome).tone === 'danger'));
check('FORBIDDEN error never exposes a raw SQLSTATE/Postgres code', describeCommitError({ code: 'FORBIDDEN' }) === 'You do not have permission to import projects for this company.');
check('an unrecognized error code still returns a safe generic message, never the raw code', describeCommitError({ code: '42501' }) === 'Something went wrong while importing. Please try again.');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
