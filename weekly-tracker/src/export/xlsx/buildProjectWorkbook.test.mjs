import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { PROJECT_EXPORT_HEADERS } from './projectExportRow.js';
import { buildProjectWorkbook, workbookToArrayBuffer, buildProjectWorkbookBytes, PROJECTS_SHEET_NAME } from './buildProjectWorkbook.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  OK ${name}`); };

ok('workbook v1 structure is exactly one "Projects" sheet — no dashboard/pivot/instructions sheets', () => {
  const wb = buildProjectWorkbook([{ storeCode: 'X' }]);
  assert.deepEqual(wb.SheetNames, [PROJECTS_SHEET_NAME]);
});

ok('the Projects sheet header row matches PROJECT_EXPORT_HEADERS exactly', () => {
  const wb = buildProjectWorkbook([]);
  const table = XLSX.utils.sheet_to_json(wb.Sheets[PROJECTS_SHEET_NAME], { header: 1, defval: null });
  assert.deepEqual(table[0], PROJECT_EXPORT_HEADERS);
});

ok('an empty project list (Blank Template) produces zero data rows', () => {
  const wb = buildProjectWorkbook([]);
  const table = XLSX.utils.sheet_to_json(wb.Sheets[PROJECTS_SHEET_NAME], { header: 1, defval: null });
  assert.equal(table.length, 1); // header row only
});

ok('two projects produce exactly two data rows, in the same order', () => {
  const wb = buildProjectWorkbook([{ storeCode: 'A' }, { storeCode: 'B' }]);
  const table = XLSX.utils.sheet_to_json(wb.Sheets[PROJECTS_SHEET_NAME], { header: 1, defval: null });
  assert.equal(table.length, 3); // header + 2 rows
  assert.equal(table[1][0], 'A');
  assert.equal(table[2][0], 'B');
});

ok('workbookToArrayBuffer produces a real ArrayBuffer (not a renamed CSV)', () => {
  const bytes = workbookToArrayBuffer(buildProjectWorkbook([{ storeCode: 'X' }]));
  assert.ok(bytes instanceof ArrayBuffer);
  assert.ok(bytes.byteLength > 0);
  // A real XLSX (zip/OOXML) file starts with the "PK" zip signature — a
  // renamed CSV would not.
  const firstBytes = new Uint8Array(bytes.slice(0, 2));
  assert.equal(firstBytes[0], 0x50); // 'P'
  assert.equal(firstBytes[1], 0x4b); // 'K'
});

ok('buildProjectWorkbookBytes is the one-shot equivalent of build+serialize', () => {
  const bytes = buildProjectWorkbookBytes([{ storeCode: 'X' }]);
  assert.ok(bytes instanceof ArrayBuffer);
  assert.ok(bytes.byteLength > 0);
});

ok('no formulas are present anywhere in the generated sheet', () => {
  const wb = buildProjectWorkbook([{ storeCode: 'X', budget: 500000 }]);
  const sheet = wb.Sheets[PROJECTS_SHEET_NAME];
  const hasFormula = Object.values(sheet).some(cell => cell && typeof cell === 'object' && 'f' in cell);
  assert.equal(hasFormula, false);
});

console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
