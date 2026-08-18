import * as XLSX from 'xlsx';
import { buildProjectBudgetWorkbook } from '../../export/xlsx/buildProjectWorkbook.js';
import { planProjectBudgetWorkbookImport } from '../../core/budget/budgetSpreadsheetOrchestration.js';

let passed = 0, failed = 0;
const check = (label, condition) => { if (condition) { passed += 1; console.log(`  PASS ${label}`); } else { failed += 1; console.error(`  FAIL ${label}`); } };
const contribution = (id, code, amount, revision = 0) => ({ departmentCode: 'CON', departmentLabel: 'Construction', disciplineId: `discipline-${id}`, disciplineCode: 'C100', disciplineLabel: 'Construction', workGroupId: `work-${id}`, workGroupCode: code, workGroupLabel: `Work ${id}`, amount, note: '', status: amount == null ? 'NOT_STARTED' : 'IN_PROGRESS', revision });
const context = { projectId: '900100', workspace: { projectCode: 'AA0011', cycle: { budgetCycleId: 'cycle-1', currencyCode: 'KZT' }, roundControl: { currentRoundNumber: 2, state: 'DRAFT' }, contributions: [contribution('1', 'C100.01', null), contribution('2', 'C100.02', '1500.00', 3)] } };
const workbook = buildProjectBudgetWorkbook(context);
const bytes = () => XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

check('budget workbook has visible instructions and Budget sheets plus very-hidden metadata', workbook.SheetNames.join(',') === 'Instructions,Budget,_OpenDay' && workbook.Workbook.Sheets[2].Hidden === 2);
const unchanged = planProjectBudgetWorkbookImport({ filename: 'AA0011-Budget-R2.xlsx', data: bytes() }, context);
check('fresh exported workbook round-trips without changes', unchanged.ok && unchanged.summary.changedCount === 0 && unchanged.summary.includedCount === 1);

workbook.Sheets.Budget.G2 = { t: 'n', v: 2750.5 };
workbook.Sheets.Budget.I2 = { t: 's', v: 'Imported estimate' };
const edited = planProjectBudgetWorkbookImport({ filename: 'AA0011-Budget-R2.xlsx', data: bytes() }, context);
check('edited Amount and Note become a validated in-progress change', edited.ok && edited.changes.length === 1 && edited.changes[0].amount === '2750.5' && edited.changes[0].status === 'IN_PROGRESS' && edited.changes[0].note === 'Imported estimate');

workbook.Sheets.Budget.L2 = { t: 'n', v: 99 };
const stale = planProjectBudgetWorkbookImport({ filename: 'AA0011-Budget-R2.xlsx', data: bytes() }, context);
check('stale contribution revision blocks import', !stale.ok && stale.issues.some(item => item.code === 'BUDGET_IMPORT_STALE_REVISION'));
check('issued rounds block import', !planProjectBudgetWorkbookImport({ filename: 'AA0011-Budget-R2.xlsx', data: bytes() }, { ...context, workspace: { ...context.workspace, roundControl: { ...context.workspace.roundControl, state: 'ISSUED' } } }).ok);
const anotherProject = { ...context, projectId: '900001', workspace: { ...context.workspace, projectCode: 'CERT-A1', cycle: { ...context.workspace.cycle, budgetCycleId: 'cycle-2' } } };
const foreign = planProjectBudgetWorkbookImport({ filename: 'AA0011-Budget-R2.xlsx', data: bytes() }, anotherProject);
check('a workbook from another project stops at clear metadata errors without stale-row noise', !foreign.ok && foreign.issues.some(item => item.code === 'BUDGET_IMPORT_DIFFERENT_PROJECT') && !foreign.issues.some(item => item.code === 'BUDGET_IMPORT_STALE_REVISION'));

console.log(`\nBudget Excel exchange: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
