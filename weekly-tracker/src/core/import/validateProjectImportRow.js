/**
 * validateProjectImportRow — the single validation pass for one mapped
 * project import row. Calls normalizeProjectImportRow exactly once and
 * reads its notes to decide errors/warnings; it never re-derives
 * normalization logic of its own (One Source of Truth — normalize once,
 * validate reads that one result).
 *
 * Only validates relationships the currently-supported field set can prove.
 * No rule references actual_start_date/actual_opening_date/budget/
 * actual_cost/store_type — those fields don't exist yet (architecture-audit
 * Category C) and are handled upstream as UNSUPPORTED_CANONICAL_FIELD
 * planning notes, never as row-level validation rules here.
 */
import { normalizeProjectImportRow } from './normalizeProjectImportRow.js';

/**
 * @param {Record<string, unknown>} mappedRow - header->canonical-field values (pre-normalization)
 * @returns {{ valid: boolean, errors: Array<{field:string,code:string,message:string}>, warnings: Array<{field:string,code:string,message:string}>, normalizedRow: Record<string, unknown> }}
 */
export function validateProjectImportRow(mappedRow) {
  const row = mappedRow || {};
  const { normalized, fieldNotes } = normalizeProjectImportRow(row);
  const errors = [];
  const warnings = [];

  if (!normalized.store_code) {
    errors.push({ field: 'store_code', code: 'MISSING_STORE_CODE', message: 'Store code is required.' });
  }

  const areaSupplied = row.store_size_sqm != null && row.store_size_sqm !== '';
  if (areaSupplied) {
    if (!fieldNotes.store_size_sqm.ok) {
      errors.push({ field: 'store_size_sqm', code: 'INVALID_AREA', message: 'Area could not be parsed as a number.' });
    } else if (normalized.store_size_sqm != null && normalized.store_size_sqm <= 0) {
      errors.push({ field: 'store_size_sqm', code: 'INVALID_AREA', message: 'Area must be greater than 0.' });
    }
  }

  for (const dateField of ['construction_start_date', 'target_opening_date']) {
    const supplied = row[dateField] != null && row[dateField] !== '';
    if (!supplied) continue;
    const note = fieldNotes[dateField];
    if (!note.ok) {
      errors.push({
        field: dateField,
        code: note.reason === 'AMBIGUOUS_DATE' ? 'AMBIGUOUS_DATE' : 'INVALID_DATE',
        message: note.reason === 'AMBIGUOUS_DATE'
          ? `"${row[dateField]}" is an ambiguous date format and cannot be safely interpreted.`
          : `"${row[dateField]}" could not be parsed as a date.`,
      });
    }
  }

  // Only compared because both fields are Phase-1-supported and already
  // normalized above — no assumption about actual_start/actual_opening,
  // which don't exist yet.
  if (normalized.construction_start_date && normalized.target_opening_date
    && normalized.target_opening_date < normalized.construction_start_date) {
    warnings.push({
      field: 'target_opening_date',
      code: 'OPENING_BEFORE_START',
      message: 'Planned opening date is before planned start date.',
    });
  }

  if (normalized.project_type && !fieldNotes.project_type.recognized) {
    warnings.push({
      field: 'project_type',
      code: 'UNKNOWN_PROJECT_TYPE',
      message: `"${normalized.project_type}" is not a recognized project type.`,
    });
  }

  return { valid: errors.length === 0, errors, warnings, normalizedRow: normalized };
}
