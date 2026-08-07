// Canonical, minimal DB-boundary contract for the public.templates table.
//
// This module owns exactly three things, per its P0 scope:
//   1. Raw templates row normalization (toTemplateRecord).
//   2. Schema-rollout-compatibility error classification
//      (isTemplateSchemaContractError).
//   3. Template data-contract validation (the throw-on-malformed rules
//      toTemplateRecord enforces).
//
// It deliberately owns NOTHING else: no default-template selection, no
// family-routing policy, no "what to do when a template is missing"
// decision, no Supabase query construction. Those are business/orchestration
// concerns and belong in templateService.js / projectService.js instead.
//
// Why select('*') is the correct query shape for every templates read: the
// production database currently runs the original 000_baseline.sql schema
//   id, name, data, is_active, updated_at, family_id, version
// and does NOT have `family` or `company_id` (both added by migration 041,
// which has not reached production - see docs from the templates clean-room
// audit). PostgREST rejects ANY query - select clause OR filter clause -
// that names a column that does not physically exist, with:
//   { code: '42703', message: 'column templates.<name> does not exist' }
// Naming `family`/`company_id` anywhere in a query (not just SELECT) is
// therefore unsafe against production today. `select('*')` never fails this
// way - it simply returns whichever columns actually exist - so every
// templates query in this codebase must use `select('*')` (TEMPLATE_SELECT)
// and never filter on family/company_id at the database level. Any
// family/company_id-based logic must operate on the NORMALIZED record
// (after toTemplateRecord), in application code, not in the query.

export const TEMPLATE_SELECT = '*';

// Thrown by toTemplateRecord when a REQUIRED field is missing or the wrong
// shape. Never silently converted to null and never swallowed by a
// filter(Boolean) - a malformed required field is a real data-integrity
// problem, not routine "this optional thing is absent."
export class TemplateDataContractError extends Error {
  constructor(message, { field, value } = {}) {
    super(message);
    this.name = 'TemplateDataContractError';
    this.field = field;
    this.value = value;
  }
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TemplateDataContractError(
      `Template row has an invalid "${field}": expected a non-empty string, got ${JSON.stringify(value)}.`,
      { field, value }
    );
  }
  return value;
}

function requireDataObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TemplateDataContractError(
      `Template row has an invalid "data": expected a non-null, non-array object, got ${Array.isArray(value) ? 'an array' : JSON.stringify(value)}.`,
      { field: 'data', value }
    );
  }
  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new TemplateDataContractError(
      `Template row has an invalid "${field}": expected a boolean, got ${JSON.stringify(value)}.`,
      { field, value }
    );
  }
  return value;
}

// Normalizes one raw `select('*')` row into the exact, explicit
// TemplateRecord shape:
//   id, name, data, isActive, family, familyId, companyId, version, updatedAt
// Required (throw TemplateDataContractError if malformed): id, name, data,
// isActive. Optional (pass through, default to null when absent - this is
// how a column that does not physically exist in the current environment,
// e.g. `family` in production today, is represented): family, familyId,
// companyId, version, updatedAt. No other property of the raw row is ever
// copied onto the returned object - unknown/unexpected raw DB columns never
// escape this boundary.
export function toTemplateRecord(row) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw new TemplateDataContractError(
      'Template row is missing or malformed: expected a non-null, non-array object.',
      { field: 'row', value: row }
    );
  }
  return {
    id: requireNonEmptyString(row.id, 'id'),
    name: requireNonEmptyString(row.name, 'name'),
    data: requireDataObject(row.data),
    isActive: requireBoolean(row.is_active, 'is_active'),
    family: row.family ?? null,
    familyId: row.family_id ?? null,
    companyId: row.company_id ?? null,
    version: row.version ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// Classifies exactly one known condition: a PostgreSQL "undefined column"
// error (42703) whose missing column is EXACTLY public.templates.family or
// public.templates.company_id - the two columns migration 041 adds and that
// are confirmed absent from production today. Every other error - any other
// 42703 (a different table/column), permission/RLS errors, auth errors,
// network failures, timeouts, 5xx responses, missing-table errors - is
// deliberately NOT classified as this condition. Uses exact identifier
// parsing (schema-qualified or not, quoted or not, case-insensitive)
// rather than a loose substring match, so an unrelated error message that
// merely happens to contain the word "family" is never misclassified.
const SCHEMA_CONTRACT_COLUMN_PATTERN = /^column\s+(?:public\.)?templates\.(family|company_id)\s+does not exist$/i;

export function isTemplateSchemaContractError(error) {
  if (!error || error.code !== '42703' || typeof error.message !== 'string') return false;
  const normalized = error.message
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return SCHEMA_CONTRACT_COLUMN_PATTERN.test(normalized);
}
