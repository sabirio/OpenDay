import assert from 'node:assert/strict';
import { IMPORT_FIELD_CATALOG } from '../../core/import/projectImportFieldMap.js';
import { PROJECT_EXPORT_HEADERS, buildProjectExportRow, buildProjectExportRows } from './projectExportRow.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  OK ${name}`); };

const MALL_PROJECT = {
  storeCode: 'KZ-EXPORT-MALL', country: 'Kazakhstan', city: 'Almaty',
  locationType: 'Mall', shoppingMallName: 'MEGA Alma-Ata', street: null,
  projectType: 'Rebuilding', storeConcept: 'Flagship',
  storeSizeSqm: 1250, salesAreaSqm: 900, backOfHouseAreaSqm: 350,
  constructionStartDate: '2026-08-01', constructionEndDate: '2026-11-15', targetOpeningDate: '2026-11-21',
  actualConstructionStartDate: '2026-01-10', actualConstructionCompletionDate: '2026-11-15', actualOpeningDate: '2026-11-21',
  budget: 500000, actualCost: 525000, currencyCode: 'KZT',
  generalContractor: 'Acme Build', contractorEmail: 'gc@acme.test',
};

ok('headers match IMPORT_FIELD_CATALOG labels exactly, in order', () =>
  assert.deepEqual(PROJECT_EXPORT_HEADERS, IMPORT_FIELD_CATALOG.map(f => f.label)));

ok('Mall row places values under the correct columns', () => {
  const row = buildProjectExportRow(MALL_PROJECT);
  const byHeader = Object.fromEntries(PROJECT_EXPORT_HEADERS.map((h, i) => [h, row[i]]));
  assert.equal(byHeader['Store Code'], 'KZ-EXPORT-MALL');
  assert.equal(byHeader['Location Type'], 'Mall');
  assert.equal(byHeader['Shopping Mall Name'], 'MEGA Alma-Ata');
  assert.equal(byHeader['Street Address'], null);
  assert.equal(byHeader['Total Area'], 1250);
  assert.equal(byHeader['Budget'], 500000);
  assert.equal(byHeader['Actual Cost'], 525000);
  assert.equal(byHeader['Currency'], 'KZT');
  assert.equal(byHeader['Planned Start'], '2026-08-01');
  assert.equal(byHeader['Planned Construction End'], '2026-11-15');
  assert.equal(byHeader['Planned Opening'], '2026-11-21');
});

ok('"Planned Construction End" is the one canonical header for construction_end_date, distinct from forecast fields', () => {
  assert.ok(PROJECT_EXPORT_HEADERS.includes('Planned Construction End'));
  assert.equal(PROJECT_EXPORT_HEADERS.filter(h => /construction end/i.test(h)).length, 1);
  assert.equal(PROJECT_EXPORT_HEADERS.includes('Completion'), false);
  assert.equal(PROJECT_EXPORT_HEADERS.includes('Forecast Completion'), false);
});

ok('Street row has Shopping Mall Name blank, Street Address filled', () => {
  const row = buildProjectExportRow({
    storeCode: 'KZ-EXPORT-STREET', country: 'Kazakhstan', city: 'Astana',
    locationType: 'Street', shoppingMallName: null, street: 'Abay Ave 42',
    projectType: 'New Opening', storeConcept: 'Standard',
  });
  const byHeader = Object.fromEntries(PROJECT_EXPORT_HEADERS.map((h, i) => [h, row[i]]));
  assert.equal(byHeader['Location Type'], 'Street');
  assert.equal(byHeader['Shopping Mall Name'], null);
  assert.equal(byHeader['Street Address'], 'Abay Ave 42');
});

ok('never exports derived LOCATION as a column (no header is literally "Location")', () =>
  assert.equal(PROJECT_EXPORT_HEADERS.includes('Location'), false));

ok('null fields export as blank (null), never a fabricated value', () => {
  const row = buildProjectExportRow({ storeCode: 'X', budget: null, actualCost: null, contractorEmail: null, actualOpeningDate: null });
  const byHeader = Object.fromEntries(PROJECT_EXPORT_HEADERS.map((h, i) => [h, row[i]]));
  assert.equal(byHeader['Budget'], null);
  assert.equal(byHeader['Actual Cost'], null);
  assert.equal(byHeader['Contractor Email'], null);
  assert.equal(byHeader['Actual Opening Date'], null);
});

ok('a real 0 is exported as 0, not blank (unknown ≠ zero)', () => {
  const row = buildProjectExportRow({ storeCode: 'X', salesAreaSqm: 0, backOfHouseAreaSqm: 0 });
  const byHeader = Object.fromEntries(PROJECT_EXPORT_HEADERS.map((h, i) => [h, row[i]]));
  assert.equal(byHeader['Sales Area'], 0);
  assert.equal(byHeader['Back of House Area'], 0);
});

ok('money exports as a bare number, never a formatted "500,000 KZT" string', () => {
  const row = buildProjectExportRow({ storeCode: 'X', budget: 500000, currencyCode: 'KZT' });
  const byHeader = Object.fromEntries(PROJECT_EXPORT_HEADERS.map((h, i) => [h, row[i]]));
  assert.equal(byHeader['Budget'], 500000);
  assert.equal(typeof byHeader['Budget'], 'number');
  assert.equal(byHeader['Currency'], 'KZT');
});

ok('dates export as deterministic YYYY-MM-DD strings, not locale-ambiguous formats', () => {
  const row = buildProjectExportRow({ storeCode: 'X', targetOpeningDate: '2026-08-01' });
  const byHeader = Object.fromEntries(PROJECT_EXPORT_HEADERS.map((h, i) => [h, row[i]]));
  assert.equal(byHeader['Planned Opening'], '2026-08-01');
});

ok('a real JS Date object is also normalized to YYYY-MM-DD', () => {
  const row = buildProjectExportRow({ storeCode: 'X', targetOpeningDate: new Date(Date.UTC(2026, 7, 1)) });
  const byHeader = Object.fromEntries(PROJECT_EXPORT_HEADERS.map((h, i) => [h, row[i]]));
  assert.equal(byHeader['Planned Opening'], '2026-08-01');
});

ok('forecast fields are not part of the row at all (no header for them)', () => {
  const row = buildProjectExportRow({ storeCode: 'X', constructionCompletionDate: '2026-01-01', forecastOpeningDate: '2026-01-05' });
  assert.equal(row.length, PROJECT_EXPORT_HEADERS.length);
  // the row is exactly as long as the catalog — no extra forecast columns snuck in
  assert.equal(PROJECT_EXPORT_HEADERS.some(h => /forecast|completion date$/i.test(h) && !/actual|target/i.test(h)), false);
});

ok('internal ids never leak into a row', () => {
  const row = buildProjectExportRow({ id: 42, companyId: 'co_1', templateId: 7, createdBy: 'u1', storeCode: 'X' });
  assert.equal(row.includes(42), false);
  assert.equal(row.includes('co_1'), false);
  assert.equal(row.includes(7), false);
  assert.equal(row.includes('u1'), false);
});

ok('buildProjectExportRows maps many projects in the same order as input', () => {
  const rows = buildProjectExportRows([{ storeCode: 'A' }, { storeCode: 'B' }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], 'A');
  assert.equal(rows[1][0], 'B');
});

ok('buildProjectExportRows([]) returns an empty array (Blank Template has zero data rows)', () =>
  assert.deepEqual(buildProjectExportRows([]), []));

console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
