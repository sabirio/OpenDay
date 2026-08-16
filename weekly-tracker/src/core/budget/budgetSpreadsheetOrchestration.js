import { parseWorkbookTables } from '../import/parseImportFile.js';
import {
  PROJECT_BUDGET_ITEMS_SHEET,
  PROJECT_BUDGET_METADATA_SHEET,
  planProjectBudgetSpreadsheetImport,
} from '../../domains/budget/budgetSpreadsheetExchange.js';

const failure = (code, details = {}) => ({ ok: false, issues: [{ code, ...details }] });

export function planProjectBudgetWorkbookImport(file, context) {
  if (!/\.xlsx$/i.test(file?.filename || '')) return failure('BUDGET_IMPORT_REQUIRES_XLSX');
  const parsed = parseWorkbookTables(file);
  if (!parsed.ok) return failure(parsed.error.code, { message: parsed.error.message });
  const itemSheet = parsed.sheets.find(sheet => sheet.name === PROJECT_BUDGET_ITEMS_SHEET);
  const metadataSheet = parsed.sheets.find(sheet => sheet.name === PROJECT_BUDGET_METADATA_SHEET);
  if (!itemSheet || !metadataSheet) return failure('BUDGET_IMPORT_REQUIRED_SHEET_MISSING');
  if (metadataSheet.hidden !== 2) return failure('BUDGET_IMPORT_METADATA_SHEET_NOT_VERY_HIDDEN');
  if (!Array.isArray(itemSheet.rows[0])) return failure('BUDGET_IMPORT_HEADER_MISMATCH');
  return planProjectBudgetSpreadsheetImport({
    headers: itemSheet.rows[0].map(value => String(value ?? '').trim()),
    rows: itemSheet.rows.slice(1).filter(row => row.some(cell => cell != null && String(cell).trim() !== '')),
    metadataRows: metadataSheet.rows,
  }, context);
}
