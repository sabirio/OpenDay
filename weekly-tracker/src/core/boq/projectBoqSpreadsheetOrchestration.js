import { parseWorkbookTables } from '../import/parseImportFile.js';
import {
  PROJECT_BOQ_ITEMS_SHEET,
  PROJECT_BOQ_METADATA_SHEET,
  planProjectBoqSpreadsheetImport,
} from '../../domains/boq/projectBoqSpreadsheetExchange.js';

function failure(code, details = {}) {
  return { ok: false, issues: [{ code, ...details }] };
}

export function planProjectBoqWorkbookImport(file, context) {
  if (!/\.xlsx$/i.test(file?.filename || '')) return failure('BOQ_IMPORT_REQUIRES_XLSX');
  const parsed = parseWorkbookTables(file);
  if (!parsed.ok) return failure(parsed.error.code, { message: parsed.error.message });
  const itemSheet = parsed.sheets.find(sheet => sheet.name === PROJECT_BOQ_ITEMS_SHEET);
  const metadataSheet = parsed.sheets.find(sheet => sheet.name === PROJECT_BOQ_METADATA_SHEET);
  if (!itemSheet || !metadataSheet) return failure('BOQ_IMPORT_REQUIRED_SHEET_MISSING');
  if (metadataSheet.hidden !== 2) return failure('BOQ_IMPORT_METADATA_SHEET_NOT_VERY_HIDDEN');
  if (!Array.isArray(itemSheet.rows[0])) return failure('BOQ_IMPORT_HEADER_MISMATCH');
  return planProjectBoqSpreadsheetImport({
    headers: itemSheet.rows[0].map(value => String(value ?? '').trim()),
    rows: itemSheet.rows.slice(1),
    metadataRows: metadataSheet.rows,
  }, {
    ...context,
    createLineId: context.createLineId || (() => globalThis.crypto?.randomUUID?.()),
  });
}

export async function commitProjectBoqWorkbookImport(projectId, file, context) {
  const plan = planProjectBoqWorkbookImport(file, context);
  if (!plan.ok) {
    const error = new Error('INVALID_PROJECT_BOQ_WORKBOOK');
    error.code = 'INVALID_PROJECT_BOQ_WORKBOOK';
    error.issues = plan.issues;
    throw error;
  }
  const { commitProjectBoqRevision } = await import('./projectBoqOrchestration.js');
  const result = await commitProjectBoqRevision(projectId, plan.payload, { sourceKind: 'IMPORT' });
  return { result, summary: plan.summary, warnings: plan.warnings };
}
