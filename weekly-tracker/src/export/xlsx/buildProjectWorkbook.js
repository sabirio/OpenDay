/**
 * buildProjectWorkbook — the ONLY module in src/export/xlsx/ that touches
 * file bytes / the `xlsx` package (mirrors core/import/parseImportFile.js's
 * "one module touches xlsx" rule for the read side). Builds a real XLSX
 * workbook — one "Projects" sheet, header row + data rows, no formulas, no
 * charts, no hidden sheets (Project Exchange v1 is intentionally a plain
 * data workbook).
 *
 * Both Project Export (real project rows) and the Blank Import Template
 * (zero rows) call this exact function — passing `[]` for the template is
 * the only difference between the two, never a second generator.
 */
import * as XLSX from 'xlsx';
import { PROJECT_EXPORT_HEADERS, buildProjectExportRows } from './projectExportRow.js';
import {
  PROJECT_BOQ_INSTRUCTIONS_SHEET,
  PROJECT_BOQ_ITEMS_SHEET,
  PROJECT_BOQ_METADATA_SHEET,
  PROJECT_BOQ_TECHNICAL_HEADERS,
  buildProjectBoqSpreadsheetModel,
} from '../../domains/boq/projectBoqSpreadsheetExchange.js';
import {
  PROJECT_BUDGET_INSTRUCTIONS_SHEET,
  PROJECT_BUDGET_ITEMS_SHEET,
  PROJECT_BUDGET_METADATA_SHEET,
  PROJECT_BUDGET_TECHNICAL_HEADERS,
  buildProjectBudgetSpreadsheetModel,
} from '../../domains/budget/budgetSpreadsheetExchange.js';

export const PROJECTS_SHEET_NAME = 'Projects';

/**
 * @param {Array<object>} [projects] - canonical project objects (camelCase, projectService.fromDB shape)
 * @returns {import('xlsx').WorkBook}
 */
export function buildProjectWorkbook(projects = []) {
  const sheetData = [PROJECT_EXPORT_HEADERS, ...buildProjectExportRows(projects)];
  const sheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, PROJECTS_SHEET_NAME);
  return workbook;
}

/** Serializes a workbook (built above, or any XLSX workbook) to raw XLSX bytes. */
export function workbookToArrayBuffer(workbook) {
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

/** One-shot convenience: canonical projects -> raw XLSX bytes. */
export function buildProjectWorkbookBytes(projects = []) {
  return workbookToArrayBuffer(buildProjectWorkbook(projects));
}

export function buildProjectBoqWorkbook(input, options = {}) {
  const model = buildProjectBoqSpreadsheetModel(input, options);
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet(model.instructions);
  const boq = XLSX.utils.aoa_to_sheet([model.headers, ...model.rows]);
  const metadata = XLSX.utils.aoa_to_sheet(model.metadata);

  const varianceColumn = 'I';
  const totalColumn = 'L';
  for (let index = 0; index < model.rows.length; index += 1) {
    const excelRow = index + 2;
    const cachedTotal = model.rows[index][11];
    boq[`${varianceColumn}${excelRow}`] = { t: 's', v: '', f: `IF(OR(G${excelRow}="",H${excelRow}="",H${excelRow}=0),"",(G${excelRow}-H${excelRow})/H${excelRow})`, z: '0.00%' };
    boq[`${totalColumn}${excelRow}`] = cachedTotal == null
      ? { t: 's', v: '', f: `IF(OR(G${excelRow}="",AND(J${excelRow}="",K${excelRow}="")),"",G${excelRow}*(IF(J${excelRow}="",0,J${excelRow})+IF(K${excelRow}="",0,K${excelRow})))` }
      : { t: 'n', v: cachedTotal, f: `IF(OR(G${excelRow}="",AND(J${excelRow}="",K${excelRow}="")),"",G${excelRow}*(IF(J${excelRow}="",0,J${excelRow})+IF(K${excelRow}="",0,K${excelRow})))` };
  }
  boq['!autofilter'] = { ref: `A1:O${model.rows.length + 1}` };
  boq['!freeze'] = { xSplit: 4, ySplit: 1, topLeftCell: 'E2', activePane: 'bottomRight', state: 'frozen' };
  boq['!cols'] = [
    { wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 28 }, { wch: 38 }, { wch: 10 },
    { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 24 }, { wch: 30 },
    ...PROJECT_BOQ_TECHNICAL_HEADERS.map(() => ({ hidden: true })),
  ];
  instructions['!cols'] = [{ wch: 110 }];

  XLSX.utils.book_append_sheet(workbook, instructions, PROJECT_BOQ_INSTRUCTIONS_SHEET);
  XLSX.utils.book_append_sheet(workbook, boq, PROJECT_BOQ_ITEMS_SHEET);
  XLSX.utils.book_append_sheet(workbook, metadata, PROJECT_BOQ_METADATA_SHEET);
  workbook.Workbook = { Sheets: [
    { name: PROJECT_BOQ_INSTRUCTIONS_SHEET, Hidden: 0 },
    { name: PROJECT_BOQ_ITEMS_SHEET, Hidden: 0 },
    { name: PROJECT_BOQ_METADATA_SHEET, Hidden: 2 },
  ] };
  return workbook;
}

export function buildProjectBoqWorkbookBytes(input, options = {}) {
  return workbookToArrayBuffer(buildProjectBoqWorkbook(input, options));
}

export function buildProjectBudgetWorkbook(input) {
  const model = buildProjectBudgetSpreadsheetModel(input);
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet(model.instructions);
  const budget = XLSX.utils.aoa_to_sheet([model.headers, ...model.rows]);
  const metadata = XLSX.utils.aoa_to_sheet(model.metadata);
  budget['!autofilter'] = { ref: `A1:L${model.rows.length + 1}` };
  budget['!freeze'] = { xSplit: 5, ySplit: 1, topLeftCell: 'F2', activePane: 'bottomRight', state: 'frozen' };
  budget['!cols'] = [
    { wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 26 }, { wch: 18 }, { wch: 38 },
    { wch: 18 }, { wch: 18 }, { wch: 40 }, ...PROJECT_BUDGET_TECHNICAL_HEADERS.map(() => ({ hidden: true })),
  ];
  instructions['!cols'] = [{ wch: 110 }];
  for (let index = 0; index < model.rows.length; index += 1) {
    const cell = budget[`G${index + 2}`];
    if (cell && cell.t === 'n') cell.z = '#,##0.00';
  }
  XLSX.utils.book_append_sheet(workbook, instructions, PROJECT_BUDGET_INSTRUCTIONS_SHEET);
  XLSX.utils.book_append_sheet(workbook, budget, PROJECT_BUDGET_ITEMS_SHEET);
  XLSX.utils.book_append_sheet(workbook, metadata, PROJECT_BUDGET_METADATA_SHEET);
  workbook.Workbook = { Sheets: [
    { name: PROJECT_BUDGET_INSTRUCTIONS_SHEET, Hidden: 0 },
    { name: PROJECT_BUDGET_ITEMS_SHEET, Hidden: 0 },
    { name: PROJECT_BUDGET_METADATA_SHEET, Hidden: 2 },
  ] };
  return workbook;
}

export function buildProjectBudgetWorkbookBytes(input) {
  return workbookToArrayBuffer(buildProjectBudgetWorkbook(input));
}
