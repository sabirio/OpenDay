import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  PROJECT_BOQ_HEADERS,
  PROJECT_BOQ_ITEMS_SHEET,
  PROJECT_BOQ_METADATA_SHEET,
} from './projectBoqSpreadsheetExchange.js';
import { buildProjectBoqWorkbook, workbookToArrayBuffer } from '../../export/xlsx/buildProjectWorkbook.js';
import { planProjectBoqWorkbookImport } from '../../core/boq/projectBoqSpreadsheetOrchestration.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass += 1; console.log(`  OK ${label}`); }
  else { fail += 1; console.error(`  FAIL ${label}`); }
}

const ids = {
  boq: '71000000-0000-4000-8000-000000000001', ontology: '71000000-0000-4000-8000-000000000002',
  discipline: '71000000-0000-4000-8000-000000000003', workGroup: '71000000-0000-4000-8000-000000000004',
  standardDefinition: '71000000-0000-4000-8000-000000000005', standardLine: '71000000-0000-4000-8000-000000000006',
  customLine: '71000000-0000-4000-8000-000000000007', importedLine: '71000000-0000-4000-8000-000000000008',
};
const context = {
  boq: { id: ids.boq, ontologyVersionId: ids.ontology, title: 'Retail Fit-out BOQ', currencyCode: 'KZT' },
  version: { id: 41, boqId: ids.boq, revisionNumber: 3 },
  ontology: {
    disciplines: [{ id: ids.discipline, code: 'ELEC', label: 'Electrical' }],
    workGroups: [{ id: ids.workGroup, disciplineId: ids.discipline, code: 'ELEC-CABLES', label: 'Cables' }],
  },
  items: [
    {
      lineId: ids.standardLine, workGroupId: ids.workGroup, itemKind: 'STANDARD', standardDefinitionId: ids.standardDefinition,
      description: 'Cable 3x2.5', unit: 'm', quantity: '9007199254740993.123456', consultantQuantity: '9007199254740994.123456', labourRate: '25.25', materialRate: '100',
      lineTotal: '1128156693143512500.00', contractorNote: null, reference: 'E-101', specification: null, sortOrder: 0,
    },
    {
      lineId: ids.customLine, workGroupId: ids.workGroup, itemKind: 'CUSTOM', standardDefinitionId: null,
      description: 'Special fire-rated cable', unit: 'm', quantity: null, consultantQuantity: null, labourRate: null, materialRate: null,
      lineTotal: null, contractorNote: 'Price pending', reference: null, specification: 'FR', sortOrder: 1,
    },
  ],
  createLineId: () => ids.importedLine,
};

function bytesFrom(workbook) {
  return workbookToArrayBuffer(workbook);
}

console.log('\nprojectBoqSpreadsheetExchange - Roadmap C.15');
const workbook = buildProjectBoqWorkbook(context, { blankCustomRows: 2 });
check('workbook has Instructions, BOQ, and technical metadata sheets',
  JSON.stringify(workbook.SheetNames) === JSON.stringify(['Instructions', PROJECT_BOQ_ITEMS_SHEET, PROJECT_BOQ_METADATA_SHEET]));
check('metadata sheet is very hidden', workbook.Workbook.Sheets.find(sheet => sheet.name === PROJECT_BOQ_METADATA_SHEET)?.Hidden === 2);
check('technical identity columns are hidden', workbook.Sheets[PROJECT_BOQ_ITEMS_SHEET]['!cols'].slice(-4).every(column => column.hidden === true));
check('BOQ header is the one versioned exchange contract', JSON.stringify(XLSX.utils.sheet_to_json(
  workbook.Sheets[PROJECT_BOQ_ITEMS_SHEET], { header: 1, defval: null },
)[0]) === JSON.stringify(PROJECT_BOQ_HEADERS));
check('Variance uses consultant quantity as its baseline', workbook.Sheets[PROJECT_BOQ_ITEMS_SHEET].I2.f.includes('G2-H2') && workbook.Sheets[PROJECT_BOQ_ITEMS_SHEET].I2.f.includes('/H2') && workbook.Sheets[PROJECT_BOQ_ITEMS_SHEET].I2.z === '0.00%');
check('Total uses contractor quantity with Labour plus Material', workbook.Sheets[PROJECT_BOQ_ITEMS_SHEET].L2.f.includes('G2*') && workbook.Sheets[PROJECT_BOQ_ITEMS_SHEET].L2.f.includes('J2') && workbook.Sheets[PROJECT_BOQ_ITEMS_SHEET].L2.f.includes('K2'));

const roundTrip = planProjectBoqWorkbookImport({ filename: 'boq.xlsx', data: bytesFrom(workbook) }, context);
check('unchanged export imports deterministically', roundTrip.ok === true && roundTrip.summary.importedLineCount === 2);
check('Excel double precision does not corrupt an unchanged exact database decimal', roundTrip.payload.items[0].quantity === context.items[0].quantity);
check('Excel double precision does not corrupt unchanged consultant quantity', roundTrip.payload.items[0].consultantQuantity === context.items[0].consultantQuantity);
check('explicitly unpriced row remains unpriced', roundTrip.payload.items[1].labourRate === null && roundTrip.payload.items[1].materialRate === null);
check('blank contractor quantity round-trips without becoming one', roundTrip.payload.items[1].quantity === null);

const edited = XLSX.read(new Uint8Array(bytesFrom(workbook)), { type: 'array' });
const sheet = edited.Sheets[PROJECT_BOQ_ITEMS_SHEET];
sheet.H2.v = 950;
sheet.H2.t = 'n';
sheet.J2.v = 30;
sheet.J2.t = 'n';
sheet.K2.v = 100;
sheet.K2.t = 'n';
sheet.L2 = { t: 'n', v: 999999, f: '1+1' };
sheet.E3.v = 'Updated fire-rated cable';
const newRow = 4;
const values = ['ELEC', 'Electrical', 'ELEC-CABLES', 'Cables', 'Cable 5x12', 'm', 15, 12, -0.2, 80, 120, 999, 'offline', 'E-202', 'LSZH'];
values.forEach((value, index) => { sheet[XLSX.utils.encode_cell({ r: newRow - 1, c: index })] = { t: typeof value === 'number' ? 'n' : 's', v: value }; });
const editedPlan = planProjectBoqWorkbookImport({ filename: 'boq.xlsx', data: bytesFrom(edited) }, context);
check('commercial edits and one new custom row produce a valid next revision', editedPlan.ok === true && editedPlan.summary.addedLineCount === 1);
check('new row inherits the canonical Work Group and is always CUSTOM', editedPlan.payload.items[2].workGroupId === ids.workGroup && editedPlan.payload.items[2].itemKind === 'CUSTOM');
check('consultant quantity imports independently from contractor quantity', editedPlan.payload.items[0].consultantQuantity === '950' && editedPlan.payload.items[2].consultantQuantity === '12');
check('tampered Total is ignored and components remain authoritative', editedPlan.payload.items[0].labourRate === '30' && editedPlan.payload.items[0].materialRate === '100' && !('lineTotal' in editedPlan.payload.items[0]));
check('existing custom description can be edited', editedPlan.payload.items[1].description === 'Updated fire-rated cable');

const identityTamper = XLSX.read(new Uint8Array(bytesFrom(workbook)), { type: 'array' });
identityTamper.Sheets[PROJECT_BOQ_ITEMS_SHEET].Q2.v = ids.standardDefinition;
const tamperedPlan = planProjectBoqWorkbookImport({ filename: 'boq.xlsx', data: bytesFrom(identityTamper) }, context);
check('hidden identity tampering blocks import', tamperedPlan.ok === false && tamperedPlan.issues.some(item => item.code === 'BOQ_IMPORT_LINE_IDENTITY_MISMATCH'));

const missingIdentity = XLSX.read(new Uint8Array(bytesFrom(workbook)), { type: 'array' });
missingIdentity.Sheets[PROJECT_BOQ_ITEMS_SHEET].P2.v = '';
const missingPlan = planProjectBoqWorkbookImport({ filename: 'boq.xlsx', data: bytesFrom(missingIdentity) }, context);
check('lost line identity cannot silently duplicate or delete an existing line', missingPlan.ok === false && missingPlan.issues.some(item => item.code === 'BOQ_IMPORT_EXISTING_LINE_MISSING'));

const metadataTamper = XLSX.read(new Uint8Array(bytesFrom(workbook)), { type: 'array' });
metadataTamper.Sheets[PROJECT_BOQ_METADATA_SHEET].B4.v = '71000000-0000-4000-8000-000000000099';
const metadataPlan = planProjectBoqWorkbookImport({ filename: 'boq.xlsx', data: bytesFrom(metadataTamper) }, context);
check('workbook from another BOQ/version is rejected', metadataPlan.ok === false && metadataPlan.issues.some(item => item.code === 'BOQ_IMPORT_METADATA_MISMATCH'));

const visibleMetadata = XLSX.read(new Uint8Array(bytesFrom(workbook)), { type: 'array' });
visibleMetadata.Workbook.Sheets.find(item => item.name === PROJECT_BOQ_METADATA_SHEET).Hidden = 0;
const visibleMetadataPlan = planProjectBoqWorkbookImport({ filename: 'boq.xlsx', data: bytesFrom(visibleMetadata) }, context);
check('metadata must remain very hidden', visibleMetadataPlan.ok === false && visibleMetadataPlan.issues.some(item => item.code === 'BOQ_IMPORT_METADATA_SHEET_NOT_VERY_HIDDEN'));

assert.equal(fail, 0);
console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
