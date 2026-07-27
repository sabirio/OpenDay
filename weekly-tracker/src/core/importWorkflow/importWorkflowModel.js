/**
 * importWorkflowModel — the pure half of the facade Phase 3's UI hook calls
 * into: parsing, mapping suggestions, planning, and result-label
 * translation. Every function here either delegates verbatim to the frozen
 * Import Foundation (core/import/*) or translates an already-computed
 * result into a display label — it never normalizes, validates, detects
 * duplicates, or decides CREATE/SKIP/BLOCK itself. Deliberately has ZERO
 * services/Supabase dependency (see importWorkflowIO.js for the two
 * functions that do) so it stays unit-testable under plain Node.
 *
 * Layer boundary (see src/tests/architectureGuard.test.mjs's HARD guard):
 * pages/components/hooks may never import core/engines/services/lib/supabase
 * directly. This is one of the two core/ files the Import UI's hook is
 * allowed to import from.
 */
import { parseImportFile } from '../import/parseImportFile.js';
import { suggestColumnMapping, getRequiredFieldKeys, getFieldDefinition, IMPORT_FIELD_CATALOG } from '../import/projectImportFieldMap.js';
import { planProjectImport } from '../import/planProjectImport.js';
import { summarizeCommitResult } from '../../engines/importPlanSummaryEngine.js';

const PARSER_ERROR_MESSAGES = {
  UNSUPPORTED_FILE_TYPE: 'Only Excel (.xlsx) and CSV files are supported.',
  UNREADABLE_FILE: 'This file could not be read.',
  MISSING_HEADER_ROW: 'No header row was found.',
  NO_USABLE_ROWS: 'This file has a header row but no data rows.',
  ROW_LIMIT_EXCEEDED: 'This file has too many rows for one import.',
};

/**
 * @param {{filename:string, data:string|ArrayBuffer|Uint8Array}} input
 * @returns {{ok:true, sheetName:string, headers:string[], rows:unknown[][]}
 *         | {ok:false, errorCode:string, errorMessage:string, detail:string}}
 */
export function parseUploadedFile({ filename, data }) {
  const result = parseImportFile({ filename, data });
  if (result.ok) return result;
  return {
    ok: false,
    errorCode: result.error.code,
    errorMessage: PARSER_ERROR_MESSAGES[result.error.code] || 'This file could not be read.',
    detail: result.error.message,
  };
}

/** Deterministic alias-table suggestions only — never fuzzy/semantic. */
export function suggestInitialMapping(headers) {
  return suggestColumnMapping(headers);
}

export function getRequiredFieldDefinitions() {
  return getRequiredFieldKeys().map(key => getFieldDefinition(key));
}

/** Human-friendly field list for the Mapping step's dropdowns — labels only, never internal keys. */
export function getFieldCatalog() {
  return IMPORT_FIELD_CATALOG.map(({ key, label, required }) => ({ key, label, required }));
}

/**
 * @param {Record<string,string|null>} mapping - header -> canonical field key
 * @returns {Array<{key:string,label:string}>} required fields with no header mapped to them
 */
export function getMissingRequiredFields(mapping) {
  const mappedFields = new Set(Object.values(mapping || {}).filter(Boolean));
  return getRequiredFieldDefinitions().filter(field => !mappedFields.has(field.key));
}

/** The one canonical plan. Never re-derived, never mutated after the fact. */
export function generatePlan({ headers, rows, mapping, existingProjects }) {
  return planProjectImport({ headers, rows, mapping, existingProjects });
}

const ROW_STATUS = {
  CREATE: { label: 'Ready', tone: 'success' },
  SKIP: { label: 'Already exists', tone: 'neutral' },
  BLOCK: { label: 'Needs attention', tone: 'danger' },
};
/** action ('CREATE'|'SKIP'|'BLOCK') stays untouched everywhere else — this is a label only. */
export function describeRowStatus(action) {
  return ROW_STATUS[action] || { label: action || 'Unknown', tone: 'neutral' };
}

/**
 * Compact display-only location label. Never persisted, never fed back into
 * the plan — shopping_mall_name/street remain the only stored facts.
 */
export function describeLocation(normalized) {
  if (!normalized) return '—';
  const { location_type: locationType, shopping_mall_name: mallName, street } = normalized;
  if (locationType === 'Mall') return mallName ? `Mall · ${mallName}` : 'Mall';
  if (locationType === 'Street') return street ? `Street · ${street}` : 'Street';
  return locationType || '—';
}

/** Unknown/blank stays visually blank — never rendered as 0. No FX, no conversion. */
export function describeMoney(value, currencyCode) {
  if (value == null) return '—';
  const formatted = value.toLocaleString('en-US');
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}

export function describeDate(value) {
  return value || '—';
}

const COMMIT_OUTCOME_STATUS = {
  COMMITTED: { label: 'Imported', tone: 'success' },
  CONFLICT: { label: 'Conflict', tone: 'danger' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
  BLOCKED_IN_PLAN: { label: 'Not imported', tone: 'danger' },
  REJECTED_INVALID_ACTION: { label: 'Not imported', tone: 'danger' },
  REJECTED_INTEGRITY_FLOOR: { label: 'Not imported', tone: 'danger' },
  FAILED: { label: 'Not imported', tone: 'danger' },
};
export function describeCommitOutcome(outcome) {
  return COMMIT_OUTCOME_STATUS[outcome] || { label: outcome || 'Unknown', tone: 'neutral' };
}

const COMMIT_ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED: 'You need to sign in again before importing.',
  FORBIDDEN: 'You do not have permission to import projects for this company.',
  IDEMPOTENCY_CONFLICT: 'This import was already submitted with different data. Start a new import.',
  INVALID_PAYLOAD: 'The import request was invalid. Try re-uploading the file.',
  NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
  UNKNOWN_ERROR: 'Something went wrong while importing. Please try again.',
};
export function describeCommitError(error) {
  return COMMIT_ERROR_MESSAGES[error?.code] || COMMIT_ERROR_MESSAGES.UNKNOWN_ERROR;
}

/** Imported/Conflict/Skipped/Not-imported tally for the Result screen — see engines/importPlanSummaryEngine.js. */
export function summarizeResult(result) {
  return summarizeCommitResult(result?.rows);
}
