/**
 * validateProjectImportRow — the single validation pass for one mapped
 * project import row. Calls normalizeProjectImportRow exactly once and
 * reads its notes to decide errors/warnings; it never re-derives
 * normalization logic of its own (One Source of Truth — normalize once,
 * validate reads that one result).
 *
 * This is the ONE validation pass shared by Preview and Commit (Phase 2's
 * trusted RPC calls the identical rules server-side rather than inventing
 * RPC-only semantics) — see planProjectImport.js and the commit_project_
 * import_batch RPC in migration 038.
 */
import { normalizeProjectImportRow } from './normalizeProjectImportRow.js';
import { computeAreaSumMismatch } from '../../engines/importPlanSummaryEngine.js';

const AREA_FIELDS = ['sales_area_sqm', 'back_of_house_area_sqm'];
const ACTUAL_DATE_FIELDS = ['actual_construction_start_date', 'actual_construction_completion_date', 'actual_opening_date'];
const ALL_DATE_FIELDS = ['construction_start_date', 'construction_end_date', 'target_opening_date', ...ACTUAL_DATE_FIELDS];
const CURRENCY_FORMAT_RE = /^[A-Z]{3}$/;

function supplied(row, field) {
  return row[field] != null && row[field] !== '';
}

/**
 * @param {Record<string, unknown>} mappedRow - header->canonical-field values (pre-normalization)
 * @returns {{ valid: boolean, errors: Array<{field:string,code:string,message:string}>, warnings: Array<{field:string,code:string,message:string}>, normalizedRow: Record<string, unknown> }}
 */
export function validateProjectImportRow(mappedRow) {
  const row = mappedRow || {};
  const { normalized, fieldNotes } = normalizeProjectImportRow(row);
  const errors = [];
  const warnings = [];

  // --- Required identity/business fields (frozen design §12/§13) ---
  if (!normalized.store_code) {
    errors.push({ field: 'store_code', code: 'MISSING_STORE_CODE', message: 'Store code is required.' });
  }
  if (!normalized.country) {
    errors.push({ field: 'country', code: 'MISSING_COUNTRY', message: 'Country is required.' });
  }
  if (!normalized.city) {
    errors.push({ field: 'city', code: 'MISSING_CITY', message: 'City is required.' });
  }
  if (!normalized.location_type) {
    errors.push({ field: 'location_type', code: 'MISSING_LOCATION_TYPE', message: 'Location type is required.' });
  }
  if (!normalized.project_type) {
    errors.push({ field: 'project_type', code: 'MISSING_PROJECT_TYPE', message: 'Project type is required.' });
  }

  // --- Location invariants (frozen design §3/§4) ---
  if (normalized.location_type && !fieldNotes.location_type.recognized) {
    warnings.push({
      field: 'location_type',
      code: 'UNKNOWN_LOCATION_TYPE',
      message: `"${normalized.location_type}" is not a recognized location type (Mall/Street).`,
    });
  } else if (normalized.location_type === 'Mall' && !normalized.shopping_mall_name) {
    errors.push({ field: 'shopping_mall_name', code: 'MALL_MISSING_MALL_NAME', message: 'A Mall location requires a shopping mall name.' });
  } else if (normalized.location_type === 'Street') {
    if (normalized.shopping_mall_name) {
      errors.push({ field: 'shopping_mall_name', code: 'STREET_WITH_MALL_NAME', message: 'A Street location must not have a shopping mall name.' });
    }
    if (!normalized.street) {
      errors.push({ field: 'street', code: 'STREET_MISSING_ADDRESS', message: 'A Street location requires a street address.' });
    }
  }

  // --- Total area (existing Phase 1 rule, unchanged: must be > 0 when supplied) ---
  if (supplied(row, 'store_size_sqm')) {
    if (!fieldNotes.store_size_sqm.ok) {
      errors.push({ field: 'store_size_sqm', code: 'INVALID_AREA', message: 'Area could not be parsed as a number.' });
    } else if (normalized.store_size_sqm != null && normalized.store_size_sqm <= 0) {
      errors.push({ field: 'store_size_sqm', code: 'INVALID_AREA', message: 'Area must be greater than 0.' });
    }
  }

  // --- Sales / BOH area (frozen design §7: negative -> BLOCK, zero allowed) ---
  for (const areaField of AREA_FIELDS) {
    if (!supplied(row, areaField)) continue;
    if (!fieldNotes[areaField].ok) {
      errors.push({ field: areaField, code: 'INVALID_AREA', message: 'Area could not be parsed as a number.' });
    } else if (normalized[areaField] != null && normalized[areaField] < 0) {
      errors.push({ field: areaField, code: 'INVALID_AREA', message: 'Area cannot be negative.' });
    }
  }

  if (normalized.sales_area_sqm != null && normalized.store_size_sqm != null
    && normalized.sales_area_sqm > normalized.store_size_sqm) {
    errors.push({ field: 'sales_area_sqm', code: 'SALES_AREA_EXCEEDS_TOTAL', message: 'Sales area cannot exceed total area.' });
  }

  if (normalized.store_size_sqm != null && normalized.sales_area_sqm != null && normalized.back_of_house_area_sqm != null) {
    const { sum, mismatch } = computeAreaSumMismatch(normalized.store_size_sqm, normalized.sales_area_sqm, normalized.back_of_house_area_sqm);
    if (mismatch) {
      warnings.push({
        field: 'store_size_sqm',
        code: 'AREA_SUM_MISMATCH',
        message: `Sales area + back of house area (${sum}) differs from total area (${normalized.store_size_sqm}) by more than the expected tolerance.`,
      });
    }
  }

  // --- Dates ---
  for (const dateField of ALL_DATE_FIELDS) {
    if (!supplied(row, dateField)) continue;
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

  // Only compared because both fields are already normalized above — no
  // reuse of forecast-owned columns (construction_completion_date /
  // forecast_opening_date), which this validator never touches.
  if (normalized.construction_start_date && normalized.construction_end_date
    && normalized.construction_end_date < normalized.construction_start_date) {
    // WARNING, not BLOCK — same severity as the sibling planned-date check
    // immediately below (target_opening_date vs construction_start_date).
    // Planned dates are estimates subject to revision; only ACTUAL/observed
    // date orderings (below) are hard business impossibilities.
    warnings.push({
      field: 'construction_end_date',
      code: 'PLANNED_END_BEFORE_START',
      message: 'Planned construction end date is before planned construction start date.',
    });
  }

  if (normalized.construction_start_date && normalized.target_opening_date
    && normalized.target_opening_date < normalized.construction_start_date) {
    warnings.push({
      field: 'target_opening_date',
      code: 'OPENING_BEFORE_START',
      message: 'Planned opening date is before planned start date.',
    });
  }

  if (normalized.actual_construction_start_date && normalized.actual_construction_completion_date
    && normalized.actual_construction_completion_date < normalized.actual_construction_start_date) {
    errors.push({
      field: 'actual_construction_completion_date',
      code: 'ACTUAL_COMPLETION_BEFORE_START',
      message: 'Actual construction completion date is before actual construction start date.',
    });
  }

  if (normalized.actual_construction_start_date && normalized.actual_opening_date
    && normalized.actual_opening_date < normalized.actual_construction_start_date) {
    errors.push({
      field: 'actual_opening_date',
      code: 'ACTUAL_OPENING_BEFORE_START',
      message: 'Actual opening date is before actual construction start date.',
    });
  }

  if (normalized.actual_construction_completion_date && normalized.actual_opening_date
    && normalized.actual_opening_date < normalized.actual_construction_completion_date) {
    warnings.push({
      field: 'actual_opening_date',
      code: 'OPENING_BEFORE_CONSTRUCTION_COMPLETION',
      message: 'Actual opening date is before actual construction completion date — real stores may open with punch-list items outstanding.',
    });
  }

  // --- Financial (frozen design §8) ---
  for (const moneyField of ['budget', 'actual_cost']) {
    if (!supplied(row, moneyField)) continue;
    if (!fieldNotes[moneyField].ok) {
      errors.push({ field: moneyField, code: 'INVALID_MONEY', message: `${moneyField === 'budget' ? 'Budget' : 'Actual cost'} could not be parsed as a number.` });
    } else if (normalized[moneyField] != null && normalized[moneyField] < 0) {
      errors.push({ field: moneyField, code: 'INVALID_MONEY', message: `${moneyField === 'budget' ? 'Budget' : 'Actual cost'} cannot be negative.` });
    }
  }

  const hasMoney = normalized.budget != null || normalized.actual_cost != null;
  const currencySupplied = supplied(row, 'currency_code');
  if (hasMoney && !currencySupplied) {
    errors.push({ field: 'currency_code', code: 'MONEY_WITHOUT_CURRENCY', message: 'A currency is required when budget or actual cost is set.' });
  }
  if (currencySupplied) {
    if (!CURRENCY_FORMAT_RE.test(normalized.currency_code || '')) {
      errors.push({ field: 'currency_code', code: 'INVALID_CURRENCY_FORMAT', message: `"${row.currency_code}" is not a valid 3-letter currency code.` });
    } else if (!fieldNotes.currency_code.recognized) {
      warnings.push({ field: 'currency_code', code: 'UNRECOGNIZED_CURRENCY', message: `"${normalized.currency_code}" is not on the recognized ISO 4217 list.` });
    }
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
