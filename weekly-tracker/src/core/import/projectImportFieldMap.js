/**
 * Single canonical source for "what can Import v1 write to a project, and
 * what spreadsheet header text plausibly means that field" — the mapper,
 * normalizer, and validator all read from this one catalog rather than each
 * keeping their own copy of the field vocabulary (One Source of Truth).
 *
 * Every `key` below is an existing, already-canonical projects.* column as of
 * migration 037 (Retail Historical Project Profile v1 — see the frozen
 * design's correction pass report). This module adds no schema, no
 * migration, no new destination.
 */

// project_type/location_type have no DB-level enum/CHECK constraint (verified
// live: zero CHECK constraints exist on public.projects) — these three
// vocabularies are UI/Import-layer conventions, not database law. Their one
// literal definition lives in config/projectVocabulary.js (a dependency-free
// leaf layer legal for both core/import/ and UI code to depend on); this
// module re-exports under its historic names so every existing Import
// consumer/test keeps working unchanged (Project Information Architecture v1
// cleanup — see docs/SourceOfTruth.md). Treating unrecognized values as a
// warning rather than a hard block (see validateProjectImportRow) matches
// the product's own lack of a stricter DB-level rule.
export {
  PROJECT_TYPE_OPTIONS as PROJECT_TYPE_VALUES,
  LOCATION_TYPE_OPTIONS as LOCATION_TYPE_VALUES,
  STORE_CONCEPT_SUGGESTIONS,
} from '../../config/projectVocabulary.js';

// ISO 4217 allow-list for currency_code validation. A 3-letter regex proves
// only shape, never that the code is a real currency (frozen design §8) —
// this is the actual conceptual validation list. Scoped to currencies a
// retail construction historical import is realistically likely to contain;
// extend here (not with a DB CHECK) if a genuine gap surfaces.
export const ISO_4217_CURRENCY_CODES = Object.freeze([
  'AED', 'AUD', 'BHD', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EGP', 'EUR',
  'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'JOD', 'JPY', 'KRW', 'KWD',
  'MXN', 'MYR', 'NOK', 'NZD', 'OMR', 'PLN', 'QAR', 'RON', 'RUB', 'SAR',
  'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'USD', 'ZAR',
]);

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
    // Label/aliases deliberately do NOT include "project name" (frozen
    // design correction pass §4A): a spreadsheet column literally named
    // "Project Name" must not silently populate the mall name — that was a
    // Phase 1 field-mapping debt, not an intentional synonym. There is no
    // separate canonical Project Name field in the product (audited: none
    // exists), so a genuine "project name" header remains unmapped rather
    // than guessed into the wrong field.
    key: 'shopping_mall_name',
    label: 'Shopping Mall Name',
    required: false,
    type: 'string',
    aliases: ['mall', 'mall name', 'shopping mall name', 'shopping mall'],
  },
  {
    key: 'country',
    label: 'Country',
    required: true,
    type: 'country',
    aliases: ['country'],
  },
  {
    key: 'city',
    label: 'City',
    required: true,
    type: 'string',
    aliases: ['city'],
  },
  {
    // Mall/Street only recognized in v1 (frozen design §3/§11); the
    // vocabulary lives in LOCATION_TYPE_VALUES, not a DB CHECK, so it can be
    // extended without a migration.
    key: 'location_type',
    label: 'Location Type',
    required: true,
    type: 'locationType',
    aliases: ['location type', 'location'],
  },
  {
    key: 'street',
    label: 'Street Address',
    required: false,
    type: 'string',
    aliases: ['street', 'street address', 'address'],
  },
  {
    key: 'store_size_sqm',
    label: 'Total Area',
    required: false,
    type: 'area',
    aliases: ['sqm', 'm2', 'area', 'store area', 'store size', 'size', 'total area'],
  },
  {
    key: 'sales_area_sqm',
    label: 'Sales Area',
    required: false,
    type: 'area',
    aliases: ['sales area', 'sales floor area', 'sales sqm'],
  },
  {
    key: 'back_of_house_area_sqm',
    label: 'Back of House Area',
    required: false,
    type: 'area',
    aliases: ['back of house area', 'boh area', 'boh', 'back of house'],
  },
  {
    key: 'project_type',
    label: 'Project Type',
    required: true,
    type: 'projectType',
    aliases: ['project type', 'type'],
  },
  {
    key: 'store_concept',
    label: 'Store Concept',
    required: false,
    type: 'string',
    aliases: ['store concept', 'concept', 'store format', 'format'],
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
    key: 'actual_construction_start_date',
    label: 'Actual Construction Start',
    required: false,
    type: 'date',
    aliases: ['actual construction start', 'actual start', 'actual start date', 'real start'],
  },
  {
    key: 'actual_construction_completion_date',
    label: 'Actual Construction Completion',
    required: false,
    type: 'date',
    aliases: ['actual construction completion', 'actual completion', 'actual completion date', 'real completion'],
  },
  {
    key: 'actual_opening_date',
    label: 'Actual Opening Date',
    required: false,
    type: 'date',
    aliases: ['actual opening', 'actual opening date', 'real opening', 'opened on'],
  },
  {
    key: 'budget',
    label: 'Budget',
    required: false,
    type: 'money',
    aliases: ['budget', 'planned budget', 'budgeted cost'],
  },
  {
    key: 'actual_cost',
    label: 'Actual Cost',
    required: false,
    type: 'money',
    aliases: ['actual cost', 'final cost', 'real cost', 'total cost'],
  },
  {
    key: 'currency_code',
    label: 'Currency',
    required: false,
    type: 'currency',
    aliases: ['currency', 'currency code'],
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
 * isn't silently discarded without explanation. Empty as of migration 037:
 * every previously-identified gap (actual dates, budget, actual cost,
 * location/store type) now has a real catalog entry above. Add a field here
 * (never a shadow property elsewhere) if a genuine new gap is identified.
 */
export const FUTURE_CANONICAL_FIELDS = Object.freeze([]);

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
