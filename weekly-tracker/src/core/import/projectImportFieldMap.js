/**
 * Single canonical source for "what can Import v1 write to a project, and
 * what spreadsheet header text plausibly means that field" — the mapper,
 * normalizer, and validator all read from this one catalog rather than each
 * keeping their own copy of the field vocabulary (One Source of Truth).
 *
 * Every `key` below is an existing, already-canonical projects.* column
 * (verified live against the schema — see the Import v1 architecture audit).
 * This module adds no schema, no migration, no new destination.
 *
 * Deliberately excluded for now (architecture-audit Category C — genuine
 * gaps, not yet supported): actual_start_date, actual_opening_date, budget,
 * actual_cost, store_type. FUTURE_CANONICAL_FIELDS below exists solely so a
 * recognizable historical-spreadsheet header for one of these can be
 * surfaced as "OpenDay can't import this yet" instead of being silently
 * dropped — no value for these fields is ever read, stored, or normalized.
 */

// project_type has no DB-level enum/CHECK constraint (verified live: zero
// CHECK constraints exist on public.projects). The only place a fixed
// vocabulary is expressed at all today is Projects.jsx's own filter list
// (`["All", "New Opening", "Rebuilding"]`). Treating unrecognized values as
// a warning rather than a hard block matches that reality — the current
// product does not itself enforce a stricter rule.
export const PROJECT_TYPE_VALUES = Object.freeze(['New Opening', 'Rebuilding']);

function keyify(text) {
  return String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * IMPORT_FIELD_CATALOG — ordered list of every canonical destination Import
 * v1 may write. `aliases` are matched case-insensitively with normalized
 * whitespace (see keyify above); they are deliberately literal strings, not
 * patterns — no fuzzy/semantic matching per the architecture decision.
 */
export const IMPORT_FIELD_CATALOG = Object.freeze([
  {
    key: 'store_code',
    label: 'Store Code',
    required: true,
    type: 'string',
    aliases: ['store code', 'store', 'project code', 'code'],
  },
  {
    key: 'shopping_mall_name',
    label: 'Project Name',
    required: false,
    type: 'string',
    aliases: ['project name', 'mall', 'mall name', 'shopping mall name', 'shopping mall'],
  },
  {
    key: 'country',
    label: 'Country',
    required: false,
    type: 'country',
    aliases: ['country'],
  },
  {
    key: 'city',
    label: 'City',
    required: false,
    type: 'string',
    aliases: ['city'],
  },
  {
    key: 'store_size_sqm',
    label: 'Area',
    required: false,
    type: 'area',
    aliases: ['sqm', 'm2', 'area', 'store area', 'store size', 'size'],
  },
  {
    key: 'project_type',
    label: 'Project Type',
    required: false,
    type: 'projectType',
    aliases: ['project type', 'type'],
  },
  {
    key: 'construction_start_date',
    label: 'Planned Start',
    required: false,
    type: 'date',
    aliases: ['construction start', 'planned start', 'start date', 'construction start date'],
  },
  {
    key: 'target_opening_date',
    label: 'Planned Opening',
    required: false,
    type: 'date',
    aliases: ['target opening', 'planned opening', 'opening date', 'opening target', 'target opening date'],
  },
  {
    key: 'general_contractor',
    label: 'General Contractor',
    required: false,
    type: 'string',
    aliases: ['general contractor', 'gc', 'contractor'],
  },
  {
    key: 'contractor_email',
    label: 'Contractor Email',
    required: false,
    type: 'email',
    aliases: ['contractor email', 'gc email'],
  },
]);

/**
 * Recognizable headers for a genuine schema gap (architecture-audit Category
 * C). These are never mapped, never normalized, never stored — detecting one
 * only produces an UNSUPPORTED_CANONICAL_FIELD planning note so the column
 * isn't silently discarded without explanation. Add a field here (and to the
 * catalog above, once schema work lands) rather than inventing a shadow
 * property to hold its values today.
 */
export const FUTURE_CANONICAL_FIELDS = Object.freeze([
  { key: 'actual_start_date', label: 'Actual Start', aliases: ['actual start', 'actual start date', 'real start'] },
  { key: 'actual_opening_date', label: 'Actual Opening', aliases: ['actual opening', 'actual opening date', 'real opening', 'opened on'] },
  { key: 'budget', label: 'Budget', aliases: ['budget', 'planned budget', 'budgeted cost'] },
  { key: 'actual_cost', label: 'Actual Cost', aliases: ['actual cost', 'final cost', 'real cost', 'total cost'] },
  { key: 'store_type', label: 'Store Type', aliases: ['store type', 'format', 'store format'] },
]);

const ALIAS_TO_FIELD = new Map();
for (const field of IMPORT_FIELD_CATALOG) {
  for (const alias of field.aliases) ALIAS_TO_FIELD.set(keyify(alias), field.key);
  ALIAS_TO_FIELD.set(keyify(field.label), field.key);
}

const ALIAS_TO_FUTURE_FIELD = new Map();
for (const field of FUTURE_CANONICAL_FIELDS) {
  for (const alias of field.aliases) ALIAS_TO_FUTURE_FIELD.set(keyify(alias), field);
  ALIAS_TO_FUTURE_FIELD.set(keyify(field.label), field);
}

export function getFieldDefinition(canonicalKey) {
  return IMPORT_FIELD_CATALOG.find(field => field.key === canonicalKey) || null;
}

export function getRequiredFieldKeys() {
  return IMPORT_FIELD_CATALOG.filter(field => field.required).map(field => field.key);
}

/**
 * suggestColumnMapping(headers) — deterministic, alias-table-only column
 * suggestion. Never guesses: an alias either matches exactly (after
 * case/whitespace normalization) or it doesn't. The caller (Phase 3 UI,
 * later) still owns final confirmation — this only proposes.
 *
 * @param {string[]} headers - raw spreadsheet header text, in file order
 * @returns {Array<{ header: string, suggestedField: string|null, unsupported: {key:string,label:string}|null }>}
 */
export function suggestColumnMapping(headers) {
  return (headers || []).map(header => {
    const key = keyify(header);
    const suggestedField = ALIAS_TO_FIELD.get(key) ?? null;
    const unsupported = suggestedField ? null : (ALIAS_TO_FUTURE_FIELD.get(key) ?? null);
    return { header, suggestedField, unsupported };
  });
}

/**
 * findMappingConflicts(mapping) — a *confirmed* mapping (header -> canonical
 * key) is ambiguous if two different headers were assigned to the same
 * canonical field; there would be no deterministic way to know which value
 * should win. Returns the conflicting canonical keys and the headers
 * pointing at each, or [] if the mapping is unambiguous.
 *
 * @param {Record<string,string>} mapping
 * @returns {Array<{ canonicalField: string, headers: string[] }>}
 */
export function findMappingConflicts(mapping) {
  const byField = new Map();
  for (const [header, field] of Object.entries(mapping || {})) {
    if (!field) continue;
    if (!byField.has(field)) byField.set(field, []);
    byField.get(field).push(header);
  }
  return [...byField.entries()]
    .filter(([, headers]) => headers.length > 1)
    .map(([canonicalField, headers]) => ({ canonicalField, headers }));
}

/**
 * applyColumnMapping(headers, rowValues, mapping) — turns one positional
 * spreadsheet row into a plain object keyed by canonical field name. Pure
 * data shuffling only; no normalization, no validation.
 *
 * @param {string[]} headers
 * @param {Array<unknown>} rowValues
 * @param {Record<string,string>} mapping - header -> canonical field key
 * @returns {Record<string, unknown>}
 */
export function applyColumnMapping(headers, rowValues, mapping) {
  const mapped = {};
  headers.forEach((header, index) => {
    const field = mapping?.[header];
    if (!field) return;
    mapped[field] = rowValues[index];
  });
  return mapped;
}
