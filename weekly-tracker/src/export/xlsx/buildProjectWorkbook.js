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
