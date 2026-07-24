/**
 * normalizeProjectImportRow — deterministic, format-agnostic value cleanup
 * for one already-mapped project row (header -> canonical field already
 * applied by projectImportFieldMap.applyColumnMapping). Never guesses at an
 * ambiguous value; an ambiguous input produces an explicit failure note for
 * validateProjectImportRow to turn into a structured error, never a
 * best-effort silent result.
 */
import { PROJECT_TYPE_VALUES } from './projectImportFieldMap.js';

const AREA_UNIT_SUFFIX_RE = /\s*(m²|m2|sq\.?\s*m|sqm|㎡)\s*$/i;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Bare numeric D/M/Y-shaped dates are genuinely ambiguous (03/04/2025 could
// be 3 April or 4 March) and are rejected outright rather than guessed —
// exactly the case the architecture decision calls out by name.
const AMBIGUOUS_NUMERIC_DATE_RE = /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/;
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isRealCalendarDate(year, monthIndex, day, candidate) {
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === monthIndex && candidate.getUTCDate() === day;
}

export function normalizeString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

export function normalizeArea(value) {
  if (value == null || value === '') return { ok: true, value: null };
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  }
  let text = String(value).trim();
  if (text === '') return { ok: true, value: null };
  text = text.replace(AREA_UNIT_SUFFIX_RE, '');
  text = text.replace(/[\s\u00A0]/g, ''); // plain whitespace + non-breaking space (\u00A0) thousand separators, e.g. "1 250"
  if (/^\d{1,3}(,\d{3})+$/.test(text)) {
    text = text.replace(/,/g, ''); // comma-grouped thousands: "1,250" / "12,345,678"
  } else if (/^\d+,\d{1,2}$/.test(text)) {
    text = text.replace(',', '.'); // decimal comma: "1250,5"
  } else if (text.includes(',')) {
    return { ok: false }; // any other comma shape is ambiguous, not guessed
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false };
  const parsed = Number(text);
  return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false };
}

export function normalizeDate(value) {
  if (value == null || value === '') return { ok: true, value: null };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { ok: false, reason: 'INVALID_DATE' };
    return { ok: true, value: `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}` };
  }
  const text = String(value).trim();
  if (text === '') return { ok: true, value: null };

  const iso = text.match(ISO_DATE_RE);
  if (iso) {
    const [, yearText, monthText, dayText] = iso;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (!isRealCalendarDate(year, month - 1, day, candidate)) return { ok: false, reason: 'INVALID_DATE' };
    return { ok: true, value: `${yearText}-${monthText}-${dayText}` };
  }

  if (AMBIGUOUS_NUMERIC_DATE_RE.test(text)) return { ok: false, reason: 'AMBIGUOUS_DATE' };

  // Spelled-out month formats are unambiguous regardless of locale:
  // "15 March 2025" or "March 15, 2025".
  const dayFirst = text.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  const monthFirst = text.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  let day, monthName, year;
  if (dayFirst) [, day, monthName, year] = dayFirst;
  else if (monthFirst) [, monthName, day, year] = monthFirst;
  if (monthName) {
    const monthIndex = MONTH_NAMES.indexOf(monthName.toLowerCase());
    if (monthIndex === -1) return { ok: false, reason: 'INVALID_DATE' };
    const dayNum = Number(day), yearNum = Number(year);
    const candidate = new Date(Date.UTC(yearNum, monthIndex, dayNum));
    if (!isRealCalendarDate(yearNum, monthIndex, dayNum, candidate)) return { ok: false, reason: 'INVALID_DATE' };
    return { ok: true, value: `${yearNum}-${pad2(monthIndex + 1)}-${pad2(dayNum)}` };
  }

  return { ok: false, reason: 'INVALID_DATE' };
}

export function normalizeCountry(value, aliases) {
  const text = normalizeString(value);
  if (text == null) return null;
  const alias = aliases[text.toLowerCase()];
  return alias ?? text;
}

export function normalizeProjectType(value) {
  const text = normalizeString(value);
  if (text == null) return { value: null, recognized: true };
  const match = PROJECT_TYPE_VALUES.find(candidate => candidate.toLowerCase() === text.toLowerCase());
  return match ? { value: match, recognized: true } : { value: text, recognized: false };
}

export function normalizeEmail(value) {
  const text = normalizeString(value);
  return text == null ? null : text.toLowerCase();
}

const COUNTRY_ALIASES = Object.freeze({
  uae: 'United Arab Emirates',
  'u.a.e.': 'United Arab Emirates',
  usa: 'United States',
  us: 'United States',
  'u.s.a.': 'United States',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  ksa: 'Saudi Arabia',
});

/**
 * @param {Record<string, unknown>} mappedRow - header->canonical-field values, pre-normalization
 * @returns {{ normalized: Record<string, unknown>, fieldNotes: Record<string, object> }}
 */
export function normalizeProjectImportRow(mappedRow) {
  const row = mappedRow || {};
  const fieldNotes = {};
  const normalized = {};

  normalized.store_code = normalizeString(row.store_code);
  normalized.shopping_mall_name = normalizeString(row.shopping_mall_name);
  normalized.city = normalizeString(row.city);
  normalized.general_contractor = normalizeString(row.general_contractor);
  normalized.contractor_email = normalizeEmail(row.contractor_email);
  normalized.country = normalizeCountry(row.country, COUNTRY_ALIASES);

  const area = normalizeArea(row.store_size_sqm);
  fieldNotes.store_size_sqm = area;
  normalized.store_size_sqm = area.ok ? area.value : null;

  const projectType = normalizeProjectType(row.project_type);
  fieldNotes.project_type = projectType;
  normalized.project_type = projectType.value;

  for (const dateField of ['construction_start_date', 'target_opening_date']) {
    const note = normalizeDate(row[dateField]);
    fieldNotes[dateField] = note;
    normalized[dateField] = note.ok ? note.value : null;
  }

  return { normalized, fieldNotes };
}
