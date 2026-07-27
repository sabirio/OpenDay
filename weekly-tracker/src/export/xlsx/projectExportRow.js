/**
 * projectExportRow — turns one canonical, already-fetched project object
 * (the shape `projectService.fromDB()` produces, used throughout the live
 * app) into one ordered Project Exchange row.
 *
 * Project Exchange v1's ONLY field catalog is Import's own
 * `IMPORT_FIELD_CATALOG` (core/import/projectImportFieldMap.js) — this
 * module does not define a second header/order list. Import, Project
 * Export, and the Blank Import Template all read the exact same catalog,
 * so a field added there is automatically importable AND exportable, and a
 * generated spreadsheet's headers are always exactly what Import's own
 * column-mapping already recognizes (One Source of Truth).
 *
 * Deliberately excluded from the exchange catalog (see docs/SourceOfTruth.md
 * "Project Exchange v1" for the full reasoning):
 *   - Portfolio's derived LOCATION (presentation-only, never a stored field)
 *   - construction_completion_date / forecast_opening_date / gantt_* (engine
 *     -owned forecasts, never editable Project Exchange facts — NOT to be
 *     confused with construction_end_date, the PLANNED construction end,
 *     which IS part of this catalog)
 *   - project_status, project_manager (not currently Import-writable)
 *   - every internal id (project id, company_id, template_id, created_by, ...)
 */
import { IMPORT_FIELD_CATALOG } from '../../core/import/projectImportFieldMap.js';

// Every IMPORT_FIELD_CATALOG `key` is a snake_case projects.* column name,
// and projectService.js's own fromDB()/toDB() mapping is mechanically
// snake_case <-> camelCase for every one of these fields (verified field by
// field) — so no hand-kept accessor table is needed here, just the
// mechanical conversion.
function snakeToCamel(key) {
  return key.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

function toIsoDateCell(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function toCellValue(field, rawValue) {
  // Unknown/null/empty always exports as a genuinely blank cell — never a
  // fabricated 0/"N/A"/"Unknown" (frozen "unknown ≠ zero" rule).
  if (rawValue == null || rawValue === '') return null;
  if (field.type === 'date') return toIsoDateCell(rawValue);
  return rawValue;
}

/** Header row, in the catalog's own deterministic order. */
export const PROJECT_EXPORT_HEADERS = IMPORT_FIELD_CATALOG.map(field => field.label);

/** One project -> one ordered row of cell values (blank for unknown). */
export function buildProjectExportRow(project) {
  return IMPORT_FIELD_CATALOG.map(field => toCellValue(field, project?.[snakeToCamel(field.key)]));
}

/** Convenience: many projects -> many ordered rows, in the same order as input. */
export function buildProjectExportRows(projects) {
  return (projects || []).map(buildProjectExportRow);
}
