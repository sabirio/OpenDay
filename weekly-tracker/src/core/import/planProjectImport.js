/**
 * planProjectImport — the canonical Import v1 dry-run/preview engine. This
 * is the ONE place mapping + normalization + validation + duplicate
 * detection are combined into a decision per row; Phase 2's commit path
 * must call this exact function (or produce byte-identical output) rather
 * than re-implementing "what should happen to this row" — there is no
 * separate preview business logic.
 *
 * Pure: takes existing-project identity as an input parameter rather than
 * querying anything, so it works identically in a unit test, a future CLI,
 * or Phase 2's service layer (which will fetch existingProjects from the
 * database and hand them to this same function).
 */
import { applyColumnMapping, findMappingConflicts, suggestColumnMapping } from './projectImportFieldMap.js';
import { validateProjectImportRow } from './validateProjectImportRow.js';
import { summarizeImportPlan } from '../../engines/importPlanSummaryEngine.js';

function normalizeCodeForComparison(code) {
  return String(code ?? '').trim().toLowerCase();
}

/**
 * @param {object} input
 * @param {string[]} input.headers - column headers, in file order (parseImportFile output)
 * @param {Array<Array<unknown>>} input.rows - raw positional row values (parseImportFile output)
 * @param {Record<string,string>} input.mapping - confirmed header -> canonical field key mapping
 * @param {Array<{storeCode: string}>} [input.existingProjects] - identity of projects that already exist (Phase 2 supplies this; Phase 1 never queries for it)
 * @returns {{
 *   ok: boolean,
 *   mappingErrors?: Array<{canonicalField:string, headers:string[]}>,
 *   unsupportedColumns: Array<{header:string, canonicalField:string, label:string}>,
 *   summary: {total:number, create:number, skip:number, blocked:number, warnings:number},
 *   rows: Array<{sourceRow:number, action:'CREATE'|'SKIP'|'BLOCK', normalized:object, errors:Array, warnings:Array}>,
 * }}
 */
export function planProjectImport({ headers, rows, mapping, existingProjects = [] } = {}) {
  const safeHeaders = headers || [];
  const safeRows = rows || [];
  const safeMapping = mapping || {};

  const mappingErrors = findMappingConflicts(safeMapping);
  const suggestions = suggestColumnMapping(safeHeaders);
  const unsupportedColumns = suggestions
    .filter(suggestion => !safeMapping[suggestion.header] && suggestion.unsupported)
    .map(suggestion => ({ header: suggestion.header, canonicalField: suggestion.unsupported.key, label: suggestion.unsupported.label }));

  if (mappingErrors.length > 0) {
    // A confirmed mapping that assigns two different headers to the same
    // canonical field has no deterministic resolution — refuse to guess
    // which value should win for any row, rather than silently picking one.
    return {
      ok: false,
      mappingErrors,
      unsupportedColumns,
      summary: { total: safeRows.length, create: 0, skip: 0, blocked: safeRows.length, warnings: 0 },
      rows: [],
    };
  }

  const existingCodes = new Set(
    (existingProjects || [])
      .map(project => normalizeCodeForComparison(project?.storeCode))
      .filter(code => code !== ''),
  );

  // First pass: mapping + normalization + row-level validation, and tally
  // in-file store-code occurrences so every row sharing a duplicated code
  // (not just the second-and-later ones) can be reported together.
  const prepared = safeRows.map((rowValues, index) => {
    const mappedRow = applyColumnMapping(safeHeaders, rowValues, safeMapping);
    const result = validateProjectImportRow(mappedRow);
    const comparableCode = normalizeCodeForComparison(result.normalizedRow.store_code);
    return { sourceRow: index + 2, comparableCode, ...result };
  });

  const codeOccurrences = new Map();
  for (const row of prepared) {
    if (row.comparableCode === '') continue;
    codeOccurrences.set(row.comparableCode, (codeOccurrences.get(row.comparableCode) || 0) + 1);
  }

  const planned = prepared.map(({ sourceRow, comparableCode, valid, errors, warnings, normalizedRow }) => {
    const rowErrors = [...errors];
    const rowWarnings = [...warnings];
    let action;

    const isDuplicateInFile = comparableCode !== '' && (codeOccurrences.get(comparableCode) || 0) > 1;
    const matchesExisting = comparableCode !== '' && existingCodes.has(comparableCode);

    if (!valid) {
      action = 'BLOCK';
    } else if (isDuplicateInFile) {
      rowErrors.push({ field: 'store_code', code: 'DUPLICATE_IN_FILE', message: `Store code "${normalizedRow.store_code}" appears more than once in this file.` });
      action = 'BLOCK';
    } else if (matchesExisting) {
      rowWarnings.push({ field: 'store_code', code: 'EXISTING_PROJECT_SKIPPED', message: `A project with store code "${normalizedRow.store_code}" already exists and will be skipped.` });
      action = 'SKIP';
    } else {
      action = 'CREATE';
    }

    return { sourceRow, action, normalized: normalizedRow, errors: rowErrors, warnings: rowWarnings };
  });

  const summary = summarizeImportPlan(planned);

  return { ok: true, unsupportedColumns, summary, rows: planned };
}
